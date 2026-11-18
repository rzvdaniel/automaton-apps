import json
import unittest
from unittest import mock

import main


class HomeCardTests(unittest.TestCase):
    def test_counters_chart_and_meter(self):
        volume = [{"_time": f"2026-11-18T{h:02d}:00:00Z", "c": str(100 + h)} for h in range(24)]
        card = main.build_card([{"severity_text": "Error", "c": "12"}, {"severity_text": "Warning", "c": "30"},
                                {"severity_text": "info", "c": "958"}], volume, (20e9, 100e9))
        self.assertEqual(card["status"], "12 errors in the last hour")
        kinds = [b["type"] for b in card["blocks"]]
        self.assertEqual(kinds, ["alert", "counters", "chart", "meter"])
        self.assertEqual([i["value"] for i in card["blocks"][1]["items"]], [1000, 12, 30])
        self.assertEqual(len(card["blocks"][2]["series"][0]["values"]), 24)
        self.assertEqual(card["blocks"][3]["max"], 100.0)

    def test_quiet_hour_has_no_alert_and_no_missing_parts(self):
        card = main.build_card([], [])
        self.assertEqual(card["status"], "No errors in the last hour")
        self.assertEqual([b["type"] for b in card["blocks"]], ["counters"])

    def test_storage_reads_metrics(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'vl_data_size_bytes{type="storage"} 5\nvl_data_size_bytes{type="indexdb"} 5\nvl_free_disk_space_bytes{path="x"} 90\n'
        opener = mock.Mock(open=mock.Mock(return_value=response))
        with mock.patch.object(main, "build_opener", return_value=opener):
            self.assertEqual(main.storage("http://logs:9428"), (10.0, 100.0))

    def test_url_must_be_plain_http(self):
        for bad in ["", "ftp://x", "http://u:p@x", "http://x/path", "javascript:alert(1)"]:
            with self.assertRaises(main.CardError):
                main.base_url(bad)
        self.assertEqual(main.base_url("http://logs:9428/"), "http://logs:9428")

    def test_unreachable_server_fails_without_card(self):
        with mock.patch.object(main, "build_opener", side_effect=OSError("x")):
            with self.assertRaises(main.CardError):
                main.query("http://logs:9428", "q")

    def test_non_json_answer_is_a_card_error(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"<html>bad gateway</html>"
        opener = mock.Mock(open=mock.Mock(return_value=response))
        with mock.patch.object(main, "build_opener", return_value=opener):
            with self.assertRaises(main.CardError):
                main.query("http://logs:9428", "q")

    def test_empty_setting_falls_back_to_the_app_address(self):
        self.assertEqual(main.base_url("", "http://10.0.0.5:32768/"), "http://10.0.0.5:32768")
        self.assertEqual(main.base_url("http://other:9428", "http://10.0.0.5:32768"), "http://other:9428")

    def test_missing_address_prints_a_no_data_card_not_a_failure(self):
        with mock.patch.dict("os.environ", {"LOGS_URL": "", "AUTOMATON_APP_INTERNAL_URL": ""}), \
                mock.patch("builtins.print") as out:
            self.assertEqual(main.main(), 0)
        card = json.loads(out.call_args.args[0])
        self.assertEqual(card["tone"], "warning")
        self.assertEqual(card["blocks"], [])
        self.assertIn("LOGS_URL", card["detail"])

    def test_alert_when_automaton_logs_do_not_arrive(self):
        card = main.build_card([{"severity_text": "info", "c": "5"}], [], None, 0, "http://10.0.0.5:32768")
        self.assertEqual(card["blocks"][0]["type"], "alert")
        self.assertIn("Logging__Otlp__Endpoint to http://10.0.0.5:32768", card["blocks"][0]["text"])
        self.assertEqual([b["type"] for b in main.build_card([], [], None, 3)["blocks"]], ["counters"])


if __name__ == "__main__":
    unittest.main()
