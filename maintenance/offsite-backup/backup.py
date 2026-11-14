"""Server calls for the Off-site Backup page: read the server's backups and ask it to make a new one."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

USER_AGENT = "Automaton-Offsite-Backup"
STATUS = {403: "forbidden", 404: "not_found", 409: "conflict", 503: "unavailable"}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # the app key is never sent to another address
        return None


class Settings:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.api_base_url = (env.get("AUTOMATON_API_URL", "").strip() or env.get("API_BASE_URL", "").strip()).rstrip("/")
        self.api_key = env.get("APP_AUTOMATON_API_KEY", "").strip()


def call(settings: Settings, method: str, path: str, viewer_token: str | None = None, timeout: float = 30, opener=None):
    """Calls one fixed endpoint. Returns (status, data, message); status is ok, forbidden, not_found, conflict,
    unavailable, no_key, not_configured or error."""
    if not settings.api_base_url:
        return "not_configured", None, "The server address (AUTOMATON_API_URL) is not set."
    if not settings.api_key:
        return "no_key", None, "The app has no key yet."
    headers = {"Authorization": "Bearer " + settings.api_key, "Accept": "application/json", "User-Agent": USER_AGENT}
    if viewer_token:
        headers["X-Automaton-Viewer-Token"] = viewer_token
    request = Request(settings.api_base_url + path, method=method, headers=headers, data=b"" if method == "POST" else None)
    try:
        with (opener or build_opener(_NoRedirect())).open(request, timeout=timeout) as response:
            return "ok", json.loads(response.read(2_000_000).decode("utf-8") or "null"), None
    except HTTPError as error:
        status = STATUS.get(error.code)
        if not status:
            return "error", None, f"The server answered HTTP {error.code}."
        message = ""
        try:
            body = json.loads(error.read(10_000).decode("utf-8"))
            message = body.get("error") or body.get("message") or ""
        except (ValueError, OSError, AttributeError):
            pass
        if status == "forbidden":
            message = "Only a system administrator can do this, and an administrator must approve backups:run for this app."
        return status, None, message or f"The server answered HTTP {error.code}."
    except (URLError, OSError, ValueError) as error:
        return "error", None, f"The server could not be reached: {type(error).__name__}."


def backups(settings: Settings, **kwargs):
    """The server's backups (permission backups:read), reduced to what the page shows."""
    status, data, message = call(settings, "GET", "/api/Install/backups", **kwargs)
    if status != "ok" or not isinstance(data, dict):
        return status, None, message
    items = [b for b in data.get("backups") or [] if isinstance(b, dict)]
    newest = max(items, key=lambda b: str(b.get("createdAt") or ""), default=None)
    return "ok", {
        "lastSuccessAt": data.get("lastSuccessAt"), "lastError": data.get("lastError"), "count": len(items),
        "newest": {"name": newest.get("name"), "createdAt": newest.get("createdAt"), "sizeBytes": newest.get("sizeBytes")} if newest else None,
    }, None


def run_backup(settings: Settings, viewer_token: str | None, **kwargs):
    """Asks the server for a new backup (permission backups:run). The viewer's token is what proves an administrator pressed the button."""
    if not viewer_token:
        return "forbidden", None, "Only a system administrator can do this, and an administrator must approve backups:run for this app."
    return call(settings, "POST", "/api/Install/backups/run", viewer_token, **kwargs)
