"""Builds the pinned File Browser and checks run.sh: no second login inside Automaton, a login on its own,
and an uploaded file surviving a restart."""
import json, os, signal, subprocess, tempfile, time, unittest, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def request(port, method, path, body=None, headers=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class RunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["sh", "build.sh"], cwd=HERE, check=True, stdout=subprocess.DEVNULL)
        cls.dist = HERE / "dist"

    @classmethod
    def tearDownClass(cls):
        subprocess.run(["rm", "-rf", str(HERE / "dist")])

    def start(self, data, port, **env):
        e = {"PATH": os.environ["PATH"], "AUTOMATON_APP_DATA_DIR": data, "AUTOMATON_PORT": str(port), **env}
        proc = subprocess.Popen(["sh", "run.sh"], cwd=self.dist, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(60):
            if proc.poll() is not None:
                self.fail(proc.stderr.read().decode())
            try:
                if request(port, "GET", "/health")[0] == 200:
                    return proc
            except OSError:
                pass
            time.sleep(0.5)
        proc.kill()
        self.fail("did not start")

    def stop(self, proc):
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=20)

    def test_inside_automaton_needs_no_second_login_and_files_survive_restart(self):
        with tempfile.TemporaryDirectory() as data:
            proc = self.start(data, 18191, AUTOMATON_API_URL="http://api")
            try:
                status, token = request(18191, "POST", "/api/login")
                self.assertEqual(status, 200)
                auth = {"X-Auth": token.decode()}
                self.assertEqual(request(18191, "POST", "/api/resources/a.txt", b"hello", auth)[0], 200)
            finally:
                self.stop(proc)
            proc = self.start(data, 18191, AUTOMATON_API_URL="http://api")
            try:
                token = request(18191, "POST", "/api/login")[1].decode()
                status, body = request(18191, "GET", "/api/raw/a.txt", headers={"X-Auth": token})
                self.assertEqual((status, body), (200, b"hello"))
            finally:
                self.stop(proc)
            self.assertEqual((Path(data) / "files" / "a.txt").read_text(), "hello")

    def test_on_its_own_it_needs_the_admin_password(self):
        with tempfile.TemporaryDirectory() as data:
            bad = subprocess.run(["sh", "run.sh"], cwd=self.dist, env={"PATH": os.environ["PATH"], "AUTOMATON_APP_DATA_DIR": data},
                                 capture_output=True, timeout=30)
            self.assertNotEqual(bad.returncode, 0)
            proc = self.start(data, 18192, FB_ADMIN_PASSWORD="correct-horse-battery")
            try:
                body = json.dumps({"username": "admin", "password": "wrong-password-xx"}).encode()
                self.assertEqual(request(18192, "POST", "/api/login", body)[0], 403)
                body = json.dumps({"username": "admin", "password": "correct-horse-battery"}).encode()
                self.assertEqual(request(18192, "POST", "/api/login", body)[0], 200)
            finally:
                self.stop(proc)


if __name__ == "__main__":
    unittest.main()
