import io
import json
import os
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock
from urllib.error import HTTPError

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS = ("pick-up", "stall-check", "report", "lessons", "setup-machine")


def load_helper(job):
    import importlib.util
    spec = importlib.util.spec_from_file_location("job_" + job.replace("-", "_"), os.path.join(HERE, job, "job.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class JobActions(unittest.TestCase):
    def test_every_copy_of_the_helper_is_identical(self):
        texts = {open(os.path.join(HERE, j, "job.py"), encoding="utf-8").read() for j in JOBS}
        self.assertEqual(len(texts), 1)

    def test_each_action_posts_to_its_own_job_and_takes_no_input(self):
        for job in JOBS:
            seen = {}

            def opener(request, timeout):
                seen["url"], seen["auth"] = request.full_url, request.get_header("Authorization")
                return Resp(b'{"ok":true,"text":"queued x"}')
            self.assertTrue(load_helper(job).run_job("http://10.0.0.5:3000/", "t" * 16, job, opener)["ok"])
            self.assertEqual(seen, {"url": f"http://10.0.0.5:3000/api/jobs/{job}", "auth": "Bearer " + "t" * 16})
            manifest = open(os.path.join(HERE, job, "action.yaml"), encoding="utf-8").read()
            self.assertIn(f"key: {job}", manifest)
            self.assertNotIn("input:", manifest)
            main = open(os.path.join(HERE, job, "main.py"), encoding="utf-8").read()
            self.assertIn(f'main("{job}")', main)

    def test_main_logs_the_job_text_and_reads_the_environment(self):
        helper = load_helper("pick-up")
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"AUTOMATON_APP_INTERNAL_URL": "http://x", "ADMIN_TOKEN": "t" * 16}), \
                mock.patch.object(helper, "run_job", return_value={"ok": True, "text": "queued #807, #1086"}), \
                redirect_stdout(out), redirect_stderr(err):
            self.assertEqual(helper.main("pick-up"), 0)
        self.assertIn("pick-up: queued #807, #1086", err.getvalue())
        self.assertEqual(json.loads(out.getvalue())["ok"], True)

    def test_bad_input_exits_1(self):
        helper = load_helper("report")
        for base, token in (("ftp://x", "t" * 16), ("http://x", "short")):
            with self.assertRaises(ValueError):
                helper.run_job(base, token, "report")
        with mock.patch.dict(os.environ, {"AUTOMATON_APP_INTERNAL_URL": "", "ADMIN_TOKEN": ""}), redirect_stderr(io.StringIO()):
            self.assertEqual(helper.main("report"), 1)

    def test_http_error_is_a_failure(self):
        def opener(request, timeout):
            raise HTTPError("u", 502, "bad", {}, io.BytesIO(b'{"ok":false,"text":"could not connect"}'))
        with self.assertRaises(RuntimeError) as caught:
            load_helper("lessons").run_job("http://x", "t" * 16, "lessons", opener)
        self.assertIn("502", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
