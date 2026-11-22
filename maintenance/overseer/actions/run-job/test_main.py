import io
import json
import unittest
from urllib.error import HTTPError

import main


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class RunJob(unittest.TestCase):
    def test_posts_with_the_token(self):
        seen = {}

        def opener(request, timeout):
            seen["url"], seen["auth"] = request.full_url, request.get_header("Authorization")
            return Resp(b'{"ok":true,"text":"queued x"}')
        self.assertEqual(main.run_job("http://10.0.0.5:3000/", "t" * 16, "report", opener)["ok"], True)
        self.assertEqual(seen, {"url": "http://10.0.0.5:3000/api/jobs/report", "auth": "Bearer " + "t" * 16})

    def test_main_logs_the_job_text(self):
        import contextlib, os, sys
        out, err = io.StringIO(), io.StringIO()
        old = main.run_job
        main.run_job = lambda *a, **k: {"ok": True, "text": "queued #807, #1086"}
        sys.stdin = io.StringIO('{"job":"pick-up"}')
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(main.main(), 0)
        finally:
            main.run_job, sys.stdin = old, sys.__stdin__
        self.assertIn("queued #807, #1086", err.getvalue())

    def test_bad_input(self):
        for args in (("ftp://x", "t" * 16, "report"), ("http://x", "t" * 16, "rm"), ("http://x", "short", "report")):
            with self.assertRaises(ValueError):
                main.run_job(*args)

    def test_http_error_is_a_failure(self):
        def opener(request, timeout):
            raise HTTPError("u", 502, "bad", {}, io.BytesIO(b'{"ok":false,"text":"could not connect"}'))
        with self.assertRaises(RuntimeError) as caught:
            main.run_job("http://x", "t" * 16, "lessons", opener)
        self.assertIn("502", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
