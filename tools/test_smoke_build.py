import json, shutil, tempfile, unittest
from pathlib import Path

import smoke_build


class SmokeBuildTests(unittest.TestCase):
    def make_app(self, copy_list):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        folder = tmp / "app"
        folder.mkdir()
        (folder / "main.py").write_text(
            "import json, os\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\n"
            "json.load(open('automaton.json'))\n"
            "class H(BaseHTTPRequestHandler):\n"
            "    def do_GET(self): self.send_response(200); self.end_headers(); self.wfile.write(b'ok')\n"
            "HTTPServer(('127.0.0.1', int(os.environ['AUTOMATON_PORT'])), H).serve_forever()\n")
        (folder / "automaton.json").write_text(json.dumps({"application": {
            "build": {"command": {"executable": "sh", "arguments": ["-c", f"mkdir -p dist && cp {copy_list} dist/"], "workingDirectory": "."},
                      "outputDirectory": "dist"},
            "runtime": {"command": {"executable": "python", "arguments": ["main.py"], "workingDirectory": "dist"}},
            "health": {"path": "/health"}}}))
        smoke_build.root = tmp
        self.addCleanup(setattr, smoke_build, "root", Path(smoke_build.__file__).resolve().parent.parent)
        return "app"

    def test_complete_build_starts(self):
        ok, _ = smoke_build.smoke(self.make_app("main.py automaton.json"))
        self.assertTrue(ok)

    def test_file_missing_from_dist_fails(self):
        ok, note = smoke_build.smoke(self.make_app("main.py"))
        self.assertFalse(ok)
        self.assertIn("automaton.json", note)


if __name__ == "__main__":
    unittest.main()
