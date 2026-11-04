#!/usr/bin/env python3
"""Crawl configured public sites and maintain deduplicated GitHub issues."""

from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import (HTTPHandler, HTTPRedirectHandler, HTTPSHandler, ProxyHandler,
                            Request, build_opener, urlopen)


USER_AGENT = "automaton-site-links"
GITHUB_REPOSITORY = "rzvdaniel/automaton"
MAX_PAGES = 2000
MAX_PAGE_BYTES = 5 * 1024 * 1024
REQUEST_INTERVAL_SECONDS = 0.25
ISSUE_BODY_LIMIT = 60000
API_BASE = "https://api.github.com"


class SiteLinksError(RuntimeError):
    """An expected, safe-to-report configuration or remote API failure."""


@dataclass(frozen=True)
class HttpResult:
    status: int | None
    headers: dict[str, str]
    body: bytes
    final_url: str
    error: str | None = None


class RateLimitedHttp:
    def __init__(self, interval: float = REQUEST_INTERVAL_SECONDS, opener=None):
        self.interval = interval
        self.opener = opener or safe_urlopen
        self.last_request = 0.0
        self.public_hosts: dict[str, bool] = {}

    def request(self, url: str, method: str = "GET", headers: dict[str, str] | None = None,
                read_limit: int = 0, body: bytes | None = None) -> HttpResult:
        host = urlsplit(url).hostname or ""
        if host not in self.public_hosts:
            self.public_hosts[host] = is_public_host(host)
        if not self.public_hosts[host]:
            return HttpResult(None, {}, b"", url, "blocked non-public host")
        self.wait_for_request()
        request_headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"}
        request_headers.update(headers or {})
        request = Request(url, data=body, method=method, headers=request_headers)
        try:
            if self.opener is safe_urlopen:
                response_context = self.opener(request, timeout=20, before_redirect=self.wait_for_request)
            else:
                response_context = self.opener(request, timeout=20)
            with response_context as response:
                body = response.read(read_limit + 1) if read_limit else b""
                return HttpResult(response.status, lower_headers(response.headers), body, response.geturl())
        except HTTPError as error:
            result = HttpResult(error.code, lower_headers(error.headers), b"", error.geturl())
            error.close()
            return result
        except (URLError, TimeoutError, OSError, ValueError) as error:
            return HttpResult(None, {}, b"", url, type(error).__name__)

    def wait_for_request(self):
        wait = self.interval - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()


class PublicRedirectHandler(HTTPRedirectHandler):
    def __init__(self, before_redirect=None):
        super().__init__()
        self.before_redirect = before_redirect

    def redirect_request(self, request, response, code, message, headers, new_url):
        target = normalize_url(urljoin(request.full_url, new_url))
        source_host = (urlsplit(request.full_url).hostname or "").lower()
        target_host = (urlsplit(target).hostname or "").lower() if target else ""
        carries_auth = request.has_header("Authorization")
        if target is None or not is_public_host(target_host) or (carries_auth and source_host != target_host):
            raise URLError("blocked redirect to non-public host")
        if self.before_redirect:
            self.before_redirect()
        return super().redirect_request(request, response, code, message, headers, target)


def connect_to_public_address(connection):
    host = connection.host.strip("[]")
    addresses = socket.getaddrinfo(host, connection.port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise OSError("blocked non-public host")
    last_error = None
    for family, socktype, protocol, _, sockaddr in addresses:
        sock = socket.socket(family, socktype, protocol)
        sock.settimeout(connection.timeout)
        try:
            sock.connect(sockaddr)
            connection.sock = sock
            return
        except OSError as error:
            last_error = error
            sock.close()
    raise last_error or OSError("unable to connect to public host")


class PublicHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        connect_to_public_address(self)


class PublicHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        connect_to_public_address(self)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class PublicHTTPHandler(HTTPHandler):
    def http_open(self, request):
        return self.do_open(PublicHTTPConnection, request)


class PublicHTTPSHandler(HTTPSHandler):
    def https_open(self, request):
        return self.do_open(PublicHTTPSConnection, request, context=self._context)


def safe_urlopen(request, timeout=20, before_redirect=None):
    opener = build_opener(ProxyHandler({}), PublicHTTPHandler(), PublicHTTPSHandler(),
                          PublicRedirectHandler(before_redirect))
    return opener.open(request, timeout=timeout)


def lower_headers(headers) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in headers.items()}


def normalize_url(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return None
        hostname = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
        port = parsed.port
        if port and not ((parsed.scheme.lower() == "http" and port == 80)
                         or (parsed.scheme.lower() == "https" and port == 443)):
            if ":" in hostname:
                hostname = f"[{hostname}]"
            netloc = f"{hostname}:{port}"
        else:
            netloc = f"[{hostname}]" if ":" in hostname else hostname
        return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", parsed.query, parsed.fragment))
    except (UnicodeError, ValueError):
        return None


def page_url(value: str) -> str:
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def same_host(left: str, right: str) -> bool:
    return (urlsplit(left).hostname or "").lower() == (urlsplit(right).hostname or "").lower()


def is_public_host(hostname: str) -> bool:
    try:
        addresses = {ipaddress.ip_address(hostname)}
    except ValueError:
        try:
            addresses = {ipaddress.ip_address(result[4][0]) for result in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)}
        except (OSError, ValueError):
            return False
    return bool(addresses) and all(address.is_global for address in addresses)


def is_ignored(url: str, ignored: list[str]) -> bool:
    normalized = page_url(url)
    for entry in ignored:
        if not isinstance(entry, str):
            continue
        if entry.endswith("*") and normalized.startswith(entry[:-1]):
            return True
        if page_url(entry) == normalized:
            return True
    return False


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.anchors: set[str] = set()
        self.base_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs if value is not None}
        if "id" in values:
            self.anchors.add(values["id"])
        if tag.lower() == "a" and "name" in values:
            self.anchors.add(values["name"])
        if tag.lower() == "base" and self.base_href is None:
            self.base_href = values.get("href")
        if tag.lower() in ("a", "area", "link") and "href" in values:
            self.links.append(values["href"])


@dataclass
class Page:
    url: str
    status: int | None
    content_type: str
    anchors: set[str]
    links: list[str]
    error: str | None = None


@dataclass(frozen=True)
class BrokenLink:
    page: str
    url: str
    status: str


class SiteCrawler:
    def __init__(self, http: RateLimitedHttp, ignored: list[str], max_pages: int = MAX_PAGES,
                 external_cache: dict[str, tuple[bool, str]] | None = None):
        self.http = http
        self.ignored = ignored
        self.max_pages = max_pages
        self.external_cache = external_cache if external_cache is not None else {}

    def crawl(self, site: dict) -> tuple[list[BrokenLink], int]:
        root = normalize_url(site.get("root", ""))
        if root is None:
            raise SiteLinksError(f"Site {site.get('key', '<unknown>')} has an invalid root URL.")
        pages: dict[str, Page] = {}
        queue = [page_url(root)]
        references: list[tuple[str, str]] = []
        broken: list[BrokenLink] = []

        while queue and len(pages) < self.max_pages:
            current = queue.pop(0)
            if current in pages or is_ignored(current, self.ignored):
                continue
            response = self.http.request(current, read_limit=MAX_PAGE_BYTES)
            content_type = response.headers.get("content-type", "").lower()
            links: list[str] = []
            anchors: set[str] = set()
            if response.status is not None and response.status < 400 and "html" in content_type:
                encoding = "utf-8"
                charset = re.search(r"charset=([\w.-]+)", content_type)
                if charset:
                    encoding = charset.group(1)
                parser = LinkParser()
                parser.feed(response.body[:MAX_PAGE_BYTES].decode(encoding, errors="replace"))
                anchors = parser.anchors
                base = normalize_url(urljoin(current, parser.base_href)) if parser.base_href else current
                links = [urljoin(base or current, href) for href in parser.links]
            page = Page(current, response.status, content_type, anchors, links, response.error)
            pages[current] = page
            if len(response.body) > MAX_PAGE_BYTES:
                page.error = "page exceeded the 5 MiB parsing limit"
            for raw_link in links:
                normalized = normalize_url(raw_link)
                if normalized is None or is_ignored(normalized, self.ignored):
                    continue
                target = page_url(normalized)
                references.append((current, normalized))
                if same_host(root, target) and target not in pages and len(pages) + len(queue) < self.max_pages:
                    queue.append(target)

        for source, target in references:
            target_page = page_url(target)
            if same_host(root, target_page):
                result = pages.get(target_page)
                if result is None:
                    continue
                if result.status is None or result.status >= 400:
                    broken.append(BrokenLink(source, target, result.error or f"HTTP {result.status}"))
                    continue
                fragment = unquote(urlsplit(target).fragment)
                if fragment and "html" in result.content_type and fragment not in result.anchors:
                    broken.append(BrokenLink(source, target, f"missing anchor #{fragment}"))
            else:
                failed, status = self.check_external(target)
                if failed:
                    broken.append(BrokenLink(source, target, status))

        seed = pages.get(page_url(root))
        if seed and (seed.status is None or seed.status >= 400):
            broken.append(BrokenLink(page_url(root), page_url(root), seed.error or f"HTTP {seed.status}"))
        return deduplicate(broken), len(pages)

    def check_external(self, url: str) -> tuple[bool, str]:
        target = page_url(url)
        if target in self.external_cache:
            return self.external_cache[target]
        head = self.http.request(target, method="HEAD")
        if head.status is not None and 200 <= head.status < 400:
            result = (False, str(head.status))
        else:
            get = self.http.request(target, method="GET")
            if get.status is not None and 200 <= get.status < 400:
                result = (False, str(get.status))
            else:
                result = (True, get.error or f"HTTP {get.status}")
        self.external_cache[target] = result
        return result


def deduplicate(links: list[BrokenLink]) -> list[BrokenLink]:
    unique = {(item.page, item.url, item.status): item for item in links}
    return sorted(unique.values(), key=lambda item: (item.page, item.url, item.status))


def issue_marker(site_key: str) -> str:
    return f"<!-- site-links:{site_key} -->"


def issue_body(site: dict, broken: list[BrokenLink]) -> str:
    lines = [issue_marker(site["key"]), f"## Broken links on {site['name']}", "",
             "Found links that failed the site-links check:", "", "| Page | Link | Status |", "| --- | --- | --- |"]
    ordered = sorted(broken, key=lambda item: (item.page, item.url, item.status))
    shown = ordered[:150]
    for item in shown:
        lines.append(f"| {markdown_cell(item.page)} | {markdown_cell(item.url)} | {markdown_cell(item.status)} |")
    if len(ordered) > len(shown):
        lines.extend(["", f"Showing {len(shown)} of {len(ordered)} broken links."])
    body = "\n".join(lines)
    return body[:ISSUE_BODY_LIMIT]


def markdown_cell(value: str) -> str:
    return value.replace("|", "&#124;").replace("\n", " ").replace("\r", " ")


class GitHubIssues:
    def __init__(self, token: str, http: RateLimitedHttp, api_base: str = API_BASE):
        self.token = token
        self.http = http
        self.api_base = api_base.rstrip("/")

    def report(self, site: dict, broken: list[BrokenLink]) -> str:
        issue = self.find_site_issue(site["key"])
        if broken:
            body = issue_body(site, broken)
            if issue is None:
                self.api("POST", self.issue_endpoint(), {"title": f"Broken links: {site['name']}",
                                                          "body": body, "labels": ["maintenance"]})
                return "opened"
            if issue.get("state") == "open" and issue.get("body") == body:
                return "unchanged"
            self.api("PATCH", self.issue_endpoint(issue["number"]), {"state": "open", "body": body})
            return "updated" if issue.get("state") == "open" else "reopened"

        if issue is None or issue.get("state") != "open":
            return "clean"
        self.api("POST", f"{self.issue_endpoint(issue['number'])}/comments",
                 {"body": f"All monitored links on {site['name']} now pass the site-links check."})
        self.api("PATCH", self.issue_endpoint(issue["number"]), {"state": "closed"})
        return "closed"

    def find_site_issue(self, site_key: str) -> dict | None:
        page = 1
        marker = issue_marker(site_key)
        while True:
            query = urlencode({"state": "all", "labels": "maintenance", "per_page": 100, "page": page})
            issues = self.api("GET", f"{self.issue_endpoint()}?{query}")
            if not isinstance(issues, list):
                raise SiteLinksError("GitHub returned an invalid issue list.")
            for issue in issues:
                if not issue.get("pull_request") and marker in (issue.get("body") or ""):
                    return issue
            if len(issues) < 100:
                return None
            page += 1

    def issue_endpoint(self, number: int | None = None) -> str:
        base = f"/repos/{GITHUB_REPOSITORY}/issues"
        return base if number is None else f"{base}/{number}"

    def api(self, method: str, path: str, payload: dict | None = None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        response = self.http.request(self.api_base + path, method=method, headers=headers,
                                     read_limit=2 * 1024 * 1024, body=data)
        if response.status is None or response.status >= 400:
            raise SiteLinksError(f"GitHub issue API request failed (HTTP {response.status or response.error}).")
        if method == "POST" or method == "PATCH" or method == "GET":
            try:
                return json.loads(response.body)
            except json.JSONDecodeError as error:
                raise SiteLinksError("GitHub returned an invalid issue response.") from error
        return None


def load_config(directory: Path) -> tuple[list[dict], list[str]]:
    try:
        sites = json.loads((directory / "sites.json").read_text(encoding="utf-8"))
        ignored_data = json.loads((directory / "ignore.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SiteLinksError("Could not read sites.json or ignore.json.") from error
    if not isinstance(sites, list) or not sites:
        raise SiteLinksError("sites.json must contain at least one site.")
    keys = set()
    for site in sites:
        if not isinstance(site, dict) or not isinstance(site.get("key"), str) \
                or not re.fullmatch(r"[a-z0-9-]{1,40}", site["key"]) \
                or not isinstance(site.get("name"), str) or not isinstance(site.get("root"), str):
            raise SiteLinksError("Each site needs a safe key, a name, and a root URL.")
        if site["key"] in keys:
            raise SiteLinksError("Site keys must be unique.")
        keys.add(site["key"])
    ignored = ignored_data.get("urls", []) if isinstance(ignored_data, dict) else None
    if not isinstance(ignored, list) or any(not isinstance(value, str) for value in ignored):
        raise SiteLinksError("ignore.json must contain a string array named urls.")
    return sites, ignored


def run(directory: Path, http: RateLimitedHttp | None = None, issues: GitHubIssues | None = None) -> dict:
    sites, ignored = load_config(directory)
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        raise SiteLinksError("Required app secret GITHUB_TOKEN is not set.")
    http = http or RateLimitedHttp()
    issues = issues or GitHubIssues(token, http)
    results = []
    total_pages = 0
    external_cache: dict[str, tuple[bool, str]] = {}
    failed = []
    for site in sites:
        try:
            crawler = SiteCrawler(http, ignored, external_cache=external_cache)
            broken, pages = crawler.crawl(site)
            total_pages += pages
            status = issues.report(site, broken)
            results.append({"site": site["key"], "pagesChecked": pages, "brokenLinks": len(broken), "issue": status})
        except Exception as error:  # one site's failure must not stop the others
            reason = str(error) if isinstance(error, SiteLinksError) else type(error).__name__
            print(f"Site {site['key']} failed: {reason}", file=sys.stderr)
            failed.append(site["key"])
            results.append({"site": site["key"], "error": reason})
    result = {"sites": results, "pagesChecked": total_pages}
    if failed:
        raise SiteRunFailed(result, failed)
    return result


class SiteRunFailed(SiteLinksError):
    def __init__(self, result: dict, failed: list[str]):
        super().__init__(f"Sites failed: {', '.join(failed)}.")
        self.result = result


def main() -> int:
    try:
        result = run(Path(__file__).resolve().parent)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except SiteLinksError as error:
        if isinstance(error, SiteRunFailed):
            print(json.dumps(error.result, separators=(",", ":")))
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Site-links failed ({type(error).__name__}).", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
