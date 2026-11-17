import unittest
from unittest import mock

import main


class HomeCardTests(unittest.TestCase):
    def test_counts_errors_and_warnings_and_top_source(self):
        card = main.build_card(
            [{"severity_text": "Error", "c": "12"}, {"severity_text": "Warning", "c": "30"}],
            [{"service.name": "automaton-worker", "c": "9"}])
        self.assertEqual(card["status"], "12 errors in the last hour")
        self.assertEqual([f["value"] for f in card["facts"]], ["12", "30", "automaton-worker"])
        self.assertEqual(card["alerts"][0]["severity"], "warning")

    def test_quiet_hour_has_no_alert(self):
        card = main.build_card([], [])
        self.assertEqual(card["status"], "No errors in the last hour")
        self.assertEqual(card["alerts"], [])
        self.assertLessEqual(len(card["facts"]), 3)

    def test_url_must_be_plain_http(self):
        for bad in ["", "ftp://x", "http://u:p@x", "http://x/path", "javascript:alert(1)"]:
            with self.assertRaises(main.CardError):
                main.base_url(bad)
        self.assertEqual(main.base_url("http://logs:9428/"), "http://logs:9428")

    def test_unreachable_server_fails_without_card(self):
        with mock.patch.object(main, "build_opener", side_effect=OSError("x")):
            with self.assertRaises(main.CardError):
                main.query("http://logs:9428", "q")

    def test_main_reports_missing_setting(self):
        with mock.patch.dict("os.environ", {"LOGS_URL": ""}):
            self.assertEqual(main.main(), 1)


if __name__ == "__main__":
    unittest.main()
