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
