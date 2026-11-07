"""Check logic for Website Monitor: configuration, site checks, certificate expiry, alert decisions.

Python standard library only. Nothing here reads the environment or the disk except load/save_state.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
import socket
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

USER_AGENT = "automaton-website-monitor"
MAX_BODY_BYTES = 1024 * 1024
MAX_SITES = 50
RETRY_DELAY = 3


class ConfigError(ValueError):
    """The configuration is unusable; the run fails and nothing is pinged."""


@dataclass(frozen=True)
class Site:
    url: str
    expected_status: int | None = None   # None: any status below 400
    keyword: str | None = None


@dataclass
class Result:
    ok: bool
    status: int | None = None
    ms: int | None = None
    error: str | None = None
    cert_days: int | None = None         # whole days left on the TLS certificate (negative: expired)


def display_url(url: str) -> str:
    """The URL without credentials, query or fragment: safe for alerts, pages and logs."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, "", ""))


def parse_sites(text: str) -> list[Site]:
    """Entries are separated by new lines or ';'. Each is `url`, `url|status` or `url|status|keyword`."""
    sites: list[Site] = []
    for raw in text.replace(";", "\n").splitlines():
        entry = raw.strip()
        if not entry or entry.startswith("#"):
            continue
        parts = [part.strip() for part in entry.split("|", 2)]
        url = parts[0]
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ConfigError(f"Site '{display_url(url) if parsed.hostname else url[:60]}' must start with http:// or https://")
        status = None
        if len(parts) > 1 and parts[1]:
            if not parts[1].isdigit() or not 100 <= int(parts[1]) <= 599:
                raise ConfigError(f"Expected status for {display_url(url)} must be a number from 100 to 599")
            status = int(parts[1])
        keyword = parts[2] if len(parts) > 2 and parts[2] else None
        sites.append(Site(url, status, keyword))
    if not sites:
        raise ConfigError("SITES is empty: list at least one http(s) URL")
    if len(sites) > MAX_SITES:
        raise ConfigError(f"At most {MAX_SITES} sites are supported")
    return sites


# --- certificate expiry -----------------------------------------------------------------------------------------

def _der_read(data: bytes, pos: int) -> tuple[int, int, int]:
    """Returns (tag, content start, content end) of the DER element at pos."""
    tag = data[pos]
    length = data[pos + 1]
    pos += 2
    if length & 0x80:
        count = length & 0x7F
        length = int.from_bytes(data[pos:pos + count], "big")
        pos += count
    if pos + length > len(data):
        raise ValueError("truncated certificate")
    return tag, pos, pos + length


def certificate_not_after(der: bytes) -> datetime:
    """Reads notAfter from a DER X.509 certificate (the standard library cannot do this for unverified certificates)."""
    _, start, _ = _der_read(der, 0)                 # Certificate
    _, start, end = _der_read(der, start)           # tbsCertificate
    pos, index = start, 0
    while pos < end:
        tag, content_start, content_end = _der_read(der, pos)
        if tag == 0xA0:                             # optional version, not counted
            pos = content_end
            continue
        index += 1
        if index == 4:                              # serial, signature, issuer, then validity
            _, vpos, vend = _der_read(der, pos)
            _, v_start, v_end = _der_read(der, vpos)             # notBefore, skipped
            tag, n_start, n_end = _der_read(der, v_end)          # notAfter
            text = der[n_start:n_end].decode("ascii")
            if tag == 0x17:
                year = int(text[:2])
                text = ("19" if year >= 50 else "20") + text
            return datetime.strptime(text[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        pos = content_end
    raise ValueError("no validity period in certificate")


def certificate_days_left(host: str, port: int, timeout: float, now: datetime | None = None) -> int | None:
    """Days left on the certificate a server presents, even when it does not verify. None if it cannot be read."""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((host, port), timeout=timeout) as raw:
            with context.wrap_socket(raw, server_hostname=host) as tls:
                der = tls.getpeercert(binary_form=True)
        expires = certificate_not_after(der)
    except (OSError, ValueError):
        return None
    return int((expires - (now or datetime.now(timezone.utc))).total_seconds() // 86400)


# --- checking one site -------------------------------------------------------------------------------------------

def _fetch(url: str, timeout: float, want_body: bool) -> tuple[int, bytes]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read(MAX_BODY_BYTES) if want_body else b""
    except HTTPError as error:
        try:
            return error.code, error.read(MAX_BODY_BYTES) if want_body else b""
        finally:
            error.close()


def describe_error(error: BaseException) -> str:
    reason = getattr(error, "reason", error)
    if isinstance(reason, ssl.SSLCertVerificationError):
        return f"certificate not trusted ({reason.verify_message})"
    if isinstance(reason, (socket.timeout, TimeoutError)):
        return "timed out"
    if isinstance(reason, socket.gaierror):
        return "name not found"
    if isinstance(reason, ConnectionRefusedError):
        return "connection refused"
    return type(reason).__name__ + (f": {reason}" if str(reason) and len(str(reason)) < 120 else "")


def check_site(site: Site, timeout: float = 10, retry_delay: float | None = None, fetch=_fetch, cert=certificate_days_left,
               sleep=time.sleep) -> Result:
    """One check, with one retry after a short pause so a single dropped request does not raise an alert."""
    parsed = urlsplit(site.url)
    cert_days = None
    if parsed.scheme == "https":
        cert_days = cert(parsed.hostname, parsed.port or 443, timeout)
    result = Result(False, cert_days=cert_days)
    for attempt in range(2):
        started = time.monotonic()
        try:
            status, body = fetch(site.url, timeout, site.keyword is not None)
        except (URLError, OSError, ValueError) as error:
            result = Result(False, error=describe_error(error), cert_days=cert_days)
        else:
            ms = round((time.monotonic() - started) * 1000)
            error = None
            expected = site.expected_status
            if (status != expected) if expected is not None else (status >= 400):
                error = f"HTTP {status}" + (f", expected {expected}" if expected is not None else "")
            elif site.keyword is not None and site.keyword.encode() not in body:
                error = f"keyword '{site.keyword}' not found"
            result = Result(error is None, status, ms, error, cert_days)
        if result.ok:
            break
        if attempt == 0:
            sleep(RETRY_DELAY if retry_delay is None else retry_delay)
    if cert_days is not None and cert_days < 0:
        result.ok = False
        expired = f"certificate expired {-cert_days} day{'s' if cert_days != -1 else ''} ago"
        result.error = expired if not result.error or "certificate" in result.error else f"{expired}; {result.error}"
    return result


# --- alert decisions ----------------------------------------------------------------------------------------------

def decide(prev: dict | None, result: Result, now: float, warn_days: int) -> tuple[dict, list[str]]:
    """Returns the new state of a site and the alert events it calls for: 'down', 'recovered', 'cert_warning', 'cert_ok'.

    `alerted` is what the owner has been told ('up' or 'down'); it only changes when the alert is delivered
    (see `confirm`), so a failed webhook is retried on the next run instead of being lost.
    """
    prev = prev or {}
    state = {
        "alerted": prev.get("alerted", "up"),
        "cert_alerted": prev.get("cert_alerted", False),
        "since": prev.get("since", now),
        "up": result.ok,
        "status": result.status, "ms": result.ms, "error": result.error, "cert_days": result.cert_days,
        "checked": now,
    }
    if prev and prev.get("up") != result.ok:
        state["since"] = now
    events: list[str] = []
    if not result.ok and state["alerted"] != "down":
        events.append("down")
    elif result.ok and state["alerted"] == "down":
        events.append("recovered")
    expiring = result.cert_days is not None and 0 <= result.cert_days <= warn_days
    if expiring and not state["cert_alerted"]:
        events.append("cert_warning")
    elif result.cert_days is not None and result.cert_days > warn_days and state["cert_alerted"]:
        events.append("cert_ok")
    return state, events


def confirm(state: dict, event: str) -> None:
    """Record that an alert was delivered."""
    if event == "down":
        state["alerted"] = "down"
    elif event == "recovered":
        state["alerted"] = "up"
    elif event == "cert_warning":
        state["cert_alerted"] = True
    elif event == "cert_ok":
        state["cert_alerted"] = False


def message(event: str, site: Site, state: dict, now: float) -> str:
    url = display_url(site.url)
    if event == "down":
        return f"DOWN: {url} - {state['error']}"
    if event == "recovered":
        return f"RECOVERED: {url} is back (HTTP {state['status']}, {state['ms']} ms)"
    if event == "cert_warning":
        return f"CERTIFICATE: {url} certificate expires in {state['cert_days']} day{'s' if state['cert_days'] != 1 else ''}"
    return f"CERTIFICATE OK: {url} certificate renewed ({state['cert_days']} days left)"


# --- run one cycle -----------------------------------------------------------------------------------------------

def run_cycle(sites: list[Site], state: dict, warn_days: int, timeout: float, send, now: float | None = None,
              check=check_site) -> dict:
    """Checks every site, sends the alerts that changed state and returns the new state.

    `send(event, text, site_url)` returns True when the alert was delivered.
    """
    now = time.time() if now is None else now
    with ThreadPoolExecutor(max_workers=min(8, len(sites))) as pool:
        results = list(pool.map(lambda site: check(site, timeout), sites))
    new_state: dict = {}
    for site, result in zip(sites, results):
        site_state, events = decide(state.get(site.url), result, now, warn_days)
        for event in events:
            if send(event, message(event, site, site_state, now), display_url(site.url)):
                confirm(site_state, event)
        new_state[site.url] = site_state
    return new_state


def load_state(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(path: str, state: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(state, handle)
    os.replace(temp, path)
