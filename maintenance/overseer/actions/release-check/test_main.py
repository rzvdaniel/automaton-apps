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


class ReleaseCheck(unittest.TestCase):
    def test_posts_the_version_with_the_token(self):
        seen = {}

        def opener(request, timeout):
            seen.update(url=request.full_url, auth=request.get_header("Authorization"), body=json.loads(request.data))
            return Resp(b'{"ok":true,"text":"upgrading"}')
        self.assertTrue(main.release_check("http://10.0.0.5:3000/", "t" * 16, "0.2.176", opener)["ok"])
        self.assertEqual(seen, {"url": "http://10.0.0.5:3000/api/release-check", "auth": "Bearer " + "t" * 16, "body": {"version": "0.2.176"}})

    def test_bad_input(self):
        for args in (("ftp://x", "t" * 16, "0.2.1"), ("http://x", "t" * 16, "latest; rm"), ("http://x", "short", "0.2.1")):
            with self.assertRaises(ValueError):
                main.release_check(*args)

    def test_http_error_is_a_failure(self):
        def opener(request, timeout):
            raise HTTPError("u", 409, "no", {}, io.BytesIO(b'{"ok":false,"text":"set CLI_SERVER"}'))
        with self.assertRaises(RuntimeError) as caught:
            main.release_check("http://x", "t" * 16, "0.2.176", opener)
        self.assertIn("409: set CLI_SERVER", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
