import tempfile
import unittest
from pathlib import Path

import check_vendored_ui as c


def make_repo(root: Path, copy_css: str) -> None:
    kit = root / "design" / "automaton-app-ui"
    kit.mkdir(parents=True)
    (kit / "app.css").write_text("a{}", encoding="utf-8")
    (kit / "app.js").write_text("var a;", encoding="utf-8")
    ui = root / "maintenance" / "demo" / "ui"
    ui.mkdir(parents=True)
    (ui / "app.css").write_text(copy_css, encoding="utf-8")
    (ui / "app.js").write_text("var a;", encoding="utf-8")


class VendoredUiTests(unittest.TestCase):
    def test_repository_copies_match_the_kit(self):
        self.assertEqual(c.check(), [])

    def test_identical_copies_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            make_repo(Path(directory), "a{}")
            self.assertEqual(c.check(Path(directory)), [])

    def test_an_edited_copy_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            make_repo(Path(directory), "a{color:red}")
            problems = c.check(Path(directory))
            self.assertEqual(len(problems), 1)
            self.assertIn("maintenance/demo/ui/app.css", problems[0])

    def test_a_missing_kit_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(len(c.check(Path(directory))), 2)


if __name__ == "__main__":
    unittest.main()
