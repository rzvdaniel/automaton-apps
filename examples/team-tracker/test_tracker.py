import json, tempfile, threading, unittest, urllib.error, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer

import main
from store import Invalid, Store


def serve(env):
    app = main.App(env)
    server = ThreadingHTTPServer(("127.0.0.1", 0), main.make_handler(app))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return app, server, f"http://127.0.0.1:{server.server_port}"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def call(base, path, data=None, headers=None):
    request = urllib.request.Request(base + path, data=urllib.parse.urlencode(data).encode() if data is not None else None,
                                     headers={"Origin": base, **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(request) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


SIGNED_IN = {"X-Automaton-Viewer-Role": "member", "X-Automaton-Viewer-Token": "t"}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = Store(self.dir.name)

    def test_lifecycle_persists(self):
        item_id = self.store.add({"title": " New laptop  for Ana ", "priority": "High", "owner": "Mihai", "due": "2026-12-04"}, "Ana")
        self.store.move(item_id, "In progress")
        self.store.comment(item_id, "Mihai", "Ordered")
        item = Store(self.dir.name).list()[0]
        self.assertEqual((item["title"], item["status"], item["priority"], item["owner"]), ("New laptop for Ana", "In progress", "High", "Mihai"))
        self.assertEqual(item["comments"][0]["text"], "Ordered")

    def test_rejects_bad_input(self):
        for form in ({"title": ""}, {"title": "x", "status": "Nope"}, {"title": "x", "due": "friday"}, {"title": "x", "priority": "Urgent"}):
            with self.assertRaises(Invalid):
                self.store.add(form, "a")
        item_id = self.store.add({"title": "x"}, "a")
        with self.assertRaises(Invalid):
            self.store.comment(item_id, "a", "  ")
        with self.assertRaises(Invalid):
            self.store.move("missing", "Done")

    def test_remove(self):
        item_id = self.store.add({"title": "x"}, "a")
        self.store.remove(item_id)
        self.assertEqual(self.store.list(), [])


class ManagedTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.app, self.server, self.base = serve({"AUTOMATON_APP_ID": "x", "AUTOMATON_APP_DATA_DIR": self.dir.name})

    def tearDown(self):
        self.server.shutdown()

    def test_write_needs_sign_in(self):
        self.assertEqual(call(self.base, "/items/add", {"title": "x"})[0], 401)
        self.assertEqual(self.app.store.list(), [])

    def test_forged_origin_is_refused(self):
        self.assertEqual(call(self.base, "/items/add", {"title": "x"}, {**SIGNED_IN, "Origin": "https://evil.example"})[0], 403)

    def test_board_filter_and_escaping(self):
        for title, owner in (("<script>alert(1)</script>", "Mihai"), ("Book venue", "Ana")):
            self.assertEqual(call(self.base, "/items/add", {"title": title, "owner": owner}, SIGNED_IN)[0], 303)
        item_id = self.app.store.list()[1]["id"]
        call(self.base, "/items/move", {"id": item_id, "status": "In progress"}, SIGNED_IN)
        call(self.base, "/items/comment", {"id": item_id, "text": "On it", "author": "Ana"}, SIGNED_IN)
        _, page = call(self.base, "/?owner=Ana")
        self.assertIn("Book venue", page)
        self.assertNotIn("alert(1)", page)
        _, everyone = call(self.base, "/?view=table")
        self.assertIn("&lt;script&gt;", everyone)
        self.assertNotIn("<script>alert", everyone)
        self.assertIn("On it", everyone)
        _, none = call(self.base, "/?status=Done")
        self.assertIn("Nothing here", none)

    def test_viewer_name_header_wins_over_typed_name(self):
        item_id = self.app.store.add({"title": "x"}, "a")
        call(self.base, "/items/comment", {"id": item_id, "text": "hi", "author": "Spoof"}, {**SIGNED_IN, "X-Automaton-Viewer-Name": "Ana"})
        self.assertEqual(self.app.store.list()[0]["comments"][0]["author"], "Ana")

    def test_health_and_assets(self):
        self.assertEqual(call(self.base, "/health"), (200, "ok"))
        self.assertEqual(call(self.base, "/ui/tracker.css")[0], 200)
        self.assertEqual(call(self.base, "/../main.py")[0], 404)


class StandaloneTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()

    def start(self, token):
        self.app, self.server, self.base = serve({"AUTOMATON_APP_DATA_DIR": self.dir.name, "ADMIN_TOKEN": token})
        self.addCleanup(self.server.shutdown)

    def test_forged_viewer_headers_are_ignored(self):
        self.start("a-long-enough-token")
        self.assertEqual(call(self.base, "/items/add", {"title": "x"}, SIGNED_IN)[0], 401)
        self.assertEqual(self.app.store.list(), [])

    def test_token_allows_writing(self):
        self.start("a-long-enough-token")
        self.assertEqual(call(self.base, "/items/add", {"title": "x", "admin_token": "a-long-enough-token"})[0], 303)
        self.assertEqual(call(self.base, "/items/add", {"title": "y"}, {"Authorization": "Bearer a-long-enough-token"})[0], 303)
        self.assertEqual(len(self.app.store.list()), 2)

    def test_every_form_carries_the_token_field(self):
        self.start("a-long-enough-token")
        self.app.store.add({"title": "x"}, "a")
        _, page = call(self.base, "/")
        forms = page.split("<form")[1:]
        for form in forms:
            if 'method="post"' in form.split(">")[0]:
                self.assertIn('name="admin_token"', form.split("</form>")[0])

    def test_short_token_never_works(self):
        self.start("short")
        self.assertEqual(call(self.base, "/items/add", {"title": "x", "admin_token": "short"})[0], 401)


if __name__ == "__main__":
    unittest.main()
