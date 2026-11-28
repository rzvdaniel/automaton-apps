import json
import re
import unittest
from pathlib import Path

HERE = Path(__file__).parent


class AdminerPackage(unittest.TestCase):
    def setUp(self):
        self.app = json.loads((HERE / "automaton.json").read_text())["application"]

    def test_image_is_pinned_by_digest(self):
        self.assertRegex(self.app["runtime"]["image"], r"^adminer@sha256:[0-9a-f]{64}$")

    def test_private_and_no_stored_credentials(self):
        self.assertNotIn("publicAccess", self.app)
        self.assertNotIn("secrets", self.app)
        self.assertFalse(self.app.get("settings"))
        self.assertEqual(self.app["permissions"], [])

    def test_run_script_listens_on_the_declared_port(self):
        port = self.app["runtime"]["port"]
        self.assertRegex((HERE / "run.sh").read_text(), rf"0\.0\.0\.0:{port}\b")
