import io
import json
import os
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock
from urllib.error import HTTPError, URLError

import main


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def opener_for(body):
    seen = []

    def opener(request, timeout=0):
        seen.append(request.full_url)
        return Response(body if isinstance(body, bytes) else json.dumps(body).encode())

    opener.seen = seen
    return opener


def run_main(env, opener=None):
    out, err = io.StringIO(), io.StringIO()
    patches = [mock.patch.dict(os.environ, env, clear=True)]
    if opener:
        patches.append(mock.patch.object(main, "urlopen", opener))
    with redirect_stdout(out), redirect_stderr(err):
        for patch in patches:
            patch.start()
        try:
            code = main.main()
        finally:
            mock.patch.stopall()
    return code, out.getvalue(), err.getvalue()


class ActionTests(unittest.TestCase):
    def test_it_reads_the_card_from_the_running_app(self):
        opener = opener_for({"status": "All good", "blocks": []})
        card = main.fetch_card("http://10.0.0.5:32768/", opener=opener)
        self.assertEqual(card["status"], "All good")
        self.assertEqual(opener.seen, ["http://10.0.0.5:32768/api/home-card"])

    def test_main_prints_the_card_as_the_whole_result(self):
        code, out, _ = run_main({"AUTOMATON_APP_INTERNAL_URL": "http://10.0.0.5:1"}, opener_for({"status": "All good"}))
        self.assertEqual((code, json.loads(out)), (0, {"status": "All good"}))

    def test_a_missing_address_fails_with_a_reason(self):
        code, out, err = run_main({})
        self.assertEqual((code, out), (1, ""))
        self.assertIn("not running", err)

    def test_something_that_is_not_a_card_fails(self):
        for body in ([1], {"nope": 1}, b"not json"):
            with self.assertRaises(ValueError):
                main.fetch_card("http://x", opener=opener_for(body))

    def test_a_refusing_or_unreachable_app_fails_without_details_of_the_address(self):
        def refuse(request, timeout=0):
            raise HTTPError(request.full_url, 503, "x", {}, None)

        def down(request, timeout=0):
            raise URLError("down")
        for opener, text in ((refuse, "HTTP 503"), (down, "URLError")):
            code, out, err = run_main({"AUTOMATON_APP_INTERNAL_URL": "http://10.9.9.9:1"}, opener)
            self.assertEqual((code, out), (1, ""))
            self.assertIn(text, err)
            self.assertNotIn("10.9.9.9", err)

    def test_a_non_address_is_refused(self):
        with self.assertRaises(ValueError):
            main.fetch_card("file:///etc/passwd")


if __name__ == "__main__":
    unittest.main()
