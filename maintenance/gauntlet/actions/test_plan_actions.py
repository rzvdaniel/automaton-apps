import importlib.util
import io
import json
import os
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError, URLError

HERE = Path(__file__).parent
KEYS = ("smoke", "full-cycle", "upgrade", "restore-drill")


def load(key):
    spec = importlib.util.spec_from_file_location("action_" + key.replace("-", "_"), HERE / key / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class PlanActionTests(unittest.TestCase):
    def test_the_four_folders_differ_only_in_the_plan_and_each_is_named_for_it(self):
        base = (HERE / "smoke" / "main.py").read_text()
        for key in KEYS:
            text = (HERE / key / "main.py").read_text()
            self.assertEqual(text.replace(key, "smoke"), base, key)
            self.assertEqual(load(key).PLAN, key)
            yaml = (HERE / key / "action.yaml").read_text()
            self.assertIn(f"key: {key}\n", yaml)
            self.assertIn("schedulable: true", yaml)

    def test_it_posts_the_plan_with_the_token_and_returns_the_run(self):
        for key in KEYS:
            seen = []

            def opener(request, timeout=0):
                seen.append(request)
                return Response(b'{"id": 7}')
            result = load(key).start_plan("http://app:8080/", "t" * 20, opener=opener)
            self.assertEqual(result, {"plan": key, "run": 7})
            request = seen[0]
            self.assertEqual((request.full_url, request.get_method()), ("http://app:8080/api/runs", "POST"))
            self.assertEqual(json.loads(request.data), {"plan": key, "trigger": "action"})
            self.assertEqual(request.get_header("Authorization"), "Bearer " + "t" * 20)
            self.assertEqual(request.get_header("X-gauntlet"), "1")

    def test_a_refused_or_unreachable_app_fails_with_the_reason(self):
        action = load("smoke")

        def refuse(code, body):
            def opener(request, timeout=0):
                raise HTTPError(request.full_url, code, "x", {}, io.BytesIO(body))
            return opener
        with self.assertRaisesRegex(RuntimeError, "409: another run is in progress"):
            action.start_plan("http://app", "t" * 20, opener=refuse(409, b'{"error": "another run is in progress"}'))
        with self.assertRaisesRegex(RuntimeError, "answered 502$"):
            action.start_plan("http://app", "t" * 20, opener=refuse(502, b"<html>"))

        def down(request, timeout=0):
            raise URLError("refused")
        with self.assertRaisesRegex(RuntimeError, "could not reach Gauntlet"):
            action.start_plan("http://app", "t" * 20, opener=down)
        with self.assertRaises(ValueError):
            action.start_plan("nonsense", "t" * 20)
        with self.assertRaisesRegex(ValueError, "ADMIN_TOKEN"):
            action.start_plan("http://app", "short")

    def test_main_exits_1_and_never_prints_the_token(self):
        action = load("upgrade")
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"AUTOMATON_APP_INTERNAL_URL": "http://app", "ADMIN_TOKEN": "s" * 20}), \
                mock.patch.object(action, "urlopen", side_effect=URLError("refused")), redirect_stdout(out), redirect_stderr(err):
            self.assertEqual(action.main(), 1)
        self.assertNotIn("s" * 20, out.getvalue() + err.getvalue())
        with mock.patch.dict(os.environ, {"AUTOMATON_APP_INTERNAL_URL": "", "ADMIN_TOKEN": ""}), redirect_stdout(out), redirect_stderr(err):
            self.assertEqual(action.main(), 1)


if __name__ == "__main__":
    unittest.main()
