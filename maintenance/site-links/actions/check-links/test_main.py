import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlsplit
from unittest.mock import Mock, patch

import main


class FixtureSiteHandler(BaseHTTPRequestHandler):
    broken = True
    extra_broken = False

    def do_GET(self):
        if self.path == "/missing":
            self.send_error(404)
            return
        if self.path == "/anchor":
            content = b'<html><body><a id="present" name="named">target</a></body></html>'
        elif self.path == "/":
            broken_links = '<a href="/missing">missing</a><a href="/anchor#absent">bad anchor</a>' if self.broken else ""
            if self.extra_broken:
                broken_links += '<a href="/missing-again">another missing link</a>'
            content = (f'<html><body>{broken_links}'
                       '<a href="/anchor#present">good anchor</a>'
                       '<a href="https://external.example/bad">external</a>'
                       '<a href="https://external.example/bad">duplicate external</a>'
                       '</body></html>').encode()
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        pass


class FakeResponse(io.BytesIO):
    def __init__(self, payload: bytes, status: int, url: str, headers=None):
        super().__init__(payload)
        self.status = status
        self.headers = headers or {}
        self.url = url

    def geturl(self):
        return self.url


class FakeGithub:
    def __init__(self):
        self.issues = []
        self.comments = []
        self.created = 0

    def request(self, request):
        parsed = urlsplit(request.full_url)
        path = parsed.path
        method = request.method
        if path.endswith("/issues") and method == "GET":
            return self.response(self.issues, request.full_url)
        if path.endswith("/issues") and method == "POST":
            body = json.loads(request.data)
            issue = {"number": len(self.issues) + 1, "state": "open", **body}
            self.issues.append(issue)
            self.created += 1
            return self.response(issue, request.full_url, status=201)
        parts = path.split("/")
        number = int(parts[-2]) if parts[-1] == "comments" else int(parts[-1])
        issue = next(item for item in self.issues if item["number"] == number)
        if path.endswith("/comments") and method == "POST":
            self.comments.append(json.loads(request.data)["body"])
            return self.response({"id": len(self.comments)}, request.full_url, status=201)
        if method == "PATCH":
            issue.update(json.loads(request.data))
            return self.response(issue, request.full_url)
        raise AssertionError(f"Unexpected GitHub API request: {method} {path}")

    @staticmethod
    def response(value, url, status=200):
        return FakeResponse(json.dumps(value).encode(), status, url,
                            {"Content-Type": "application/json"})


class SiteLinksTests(unittest.TestCase):
    def setUp(self):
        FixtureSiteHandler.broken = True
        FixtureSiteHandler.extra_broken = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureSiteHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        self.addCleanup(self.stop_server)
        self.root = f"http://127.0.0.1:{self.server.server_port}/"
        self.temporary = tempfile.TemporaryDirectory(prefix="site-links-test-")
        self.addCleanup(self.temporary.cleanup)
        self.config = Path(self.temporary.name)
        (self.config / "sites.json").write_text(json.dumps([
            {"key": "fixture", "name": "Fixture", "root": self.root}
        ]), encoding="utf-8")
        (self.config / "ignore.json").write_text('{"urls": []}\n', encoding="utf-8")
        self.fake_github = FakeGithub()
        self.external_calls = []
        self.external_broken = True

        def opener(request, timeout):
            parsed = urlsplit(request.full_url)
            if parsed.hostname == "external.example":
                self.assertIsNone(request.get_header("Authorization"))
                self.external_calls.append(request.method)
                if self.external_broken:
                    raise HTTPError(request.full_url, 503, "unavailable", {}, None)
                return FakeResponse(b"", 200, request.full_url)
            if parsed.hostname == "api.github.test":
                self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
                return self.fake_github.request(request)
            return main.urlopen(request, timeout=timeout)

        self.opener = opener
        self.http = main.RateLimitedHttp(interval=0, opener=opener)
        self.issues = main.GitHubIssues("test-token", self.http, api_base="https://api.github.test")

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)

    def test_broken_links_open_one_issue_and_clean_run_closes_it(self):
        with patch.object(main, "is_public_host", return_value=True), patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}):
            first = main.run(self.config, self.http, self.issues)
            self.assertEqual(first["sites"][0]["brokenLinks"], 3)
            self.assertEqual(first["sites"][0]["issue"], "opened")
            self.assertEqual(self.fake_github.created, 1)
            body = self.fake_github.issues[0]["body"]
            self.assertIn("<!-- site-links:fixture -->", body)
            self.assertIn("missing anchor #absent", body)
            self.assertIn("HTTP 503", body)
            self.assertEqual(self.external_calls, ["HEAD", "GET"])

            second = main.run(self.config, self.http, self.issues)
            self.assertEqual(second["sites"][0]["issue"], "unchanged")
            self.assertEqual(self.fake_github.created, 1)
            self.assertEqual(self.external_calls, ["HEAD", "GET", "HEAD", "GET"])

            FixtureSiteHandler.extra_broken = True
            changed = main.run(self.config, self.http, self.issues)
            self.assertEqual(changed["sites"][0]["issue"], "updated")
            self.assertIn("/missing-again", self.fake_github.issues[0]["body"])

            FixtureSiteHandler.broken = False
            FixtureSiteHandler.extra_broken = False
            self.external_broken = False
            third = main.run(self.config, self.http, self.issues)
            self.assertEqual(third["sites"][0]["brokenLinks"], 0)
            self.assertEqual(third["sites"][0]["issue"], "closed")
            self.assertEqual(self.fake_github.issues[0]["state"], "closed")
            self.assertEqual(len(self.fake_github.comments), 1)

    def test_no_secret_is_sent_to_crawled_external_hosts(self):
        with patch.object(main, "is_public_host", return_value=True):
            self.assertEqual(main.SiteCrawler(self.http, []).check_external("https://external.example/bad"),
                             (True, "HTTP 503"))
        # The fake opener asserts that external requests never carry the GitHub token.

    def test_external_checks_are_cached_across_sites_in_one_run(self):
        (self.config / "sites.json").write_text(json.dumps([
            {"key": "first", "name": "First", "root": self.root},
            {"key": "second", "name": "Second", "root": self.root},
        ]), encoding="utf-8")
        with patch.object(main, "is_public_host", return_value=True), patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}):
            result = main.run(self.config, self.http, self.issues)
        self.assertEqual(len(result["sites"]), 2)
        self.assertEqual(self.fake_github.created, 2)
        self.assertEqual(self.external_calls, ["HEAD", "GET"])

    def test_private_hosts_are_blocked_before_network_access(self):
        opened = []
        client = main.RateLimitedHttp(interval=0, opener=lambda request, timeout: opened.append(request))
        with patch.object(main, "is_public_host", return_value=False):
            result = client.request("http://127.0.0.1/private")
        self.assertEqual(result.error, "blocked non-public host")
        self.assertEqual(opened, [])

    def test_public_connection_rejects_private_dns_answer_at_connect_time(self):
        connection = SimpleNamespace(host="rebound.example", port=80, timeout=1)
        answer = (2, 1, 6, "", ("127.0.0.1", 80))
        with patch.object(main.socket, "getaddrinfo", return_value=[answer]), \
                patch.object(main.socket, "socket") as create_socket:
            with self.assertRaises(OSError):
                main.connect_to_public_address(connection)
        create_socket.assert_not_called()

    def test_redirect_hops_are_rate_limited(self):
        wait = Mock()
        handler = main.PublicRedirectHandler(wait)
        with patch.object(main, "is_public_host", return_value=True):
            redirect = handler.redirect_request(
                main.Request("https://source.example/"), None, 302, "Found", {},
                "https://target.example/next")
        self.assertEqual(redirect.full_url, "https://target.example/next")
        wait.assert_called_once_with()

    def test_normalization_rejects_userinfo_and_non_http_schemes(self):
        self.assertIsNone(main.normalize_url("https://user:pass@example.com/"))
        self.assertIsNone(main.normalize_url("javascript:alert(1)"))


if __name__ == "__main__":
    unittest.main()
