import json
import unittest
from unittest import mock

import main

NOW = 1_800_000_000


def site(url, up, ms=None, error=None):
    return {"site": url, "up": up, "ms": ms, "error": error}


class HomeCardTests(unittest.TestCase):
    def test_all_up_shows_counters_and_chart(self):
        history = [[NOW - h * 3600, 100 + h, 2, 0] for h in range(24)]
        card = main.build_card({"sites": [site("https://a", True, 100), site("https://b", True, 200)], "history": history}, NOW)
        self.assertEqual(card["status"], "All 2 sites up")
        self.assertEqual([b["type"] for b in card["blocks"]], ["counters", "chart", "buttons"])
        self.assertEqual([i["value"] for i in card["blocks"][0]["items"]], ["2", "0", "150"])
        self.assertLessEqual(len(card["blocks"][1]["series"][0]["values"]), 24)
        self.assertEqual(card["blocks"][2]["items"][0]["path"], "/")

    def test_down_sites_are_listed_with_an_alert(self):
        card = main.build_card({"sites": [site("https://a", True, 100), site("https://b", False, None, "timeout")], "history": []}, NOW)
        self.assertEqual(card["tone"], "critical")
        self.assertEqual([b["type"] for b in card["blocks"]], ["alert", "counters", "list", "buttons"])
        self.assertEqual(card["blocks"][2]["rows"][0]["text"], "https://b")

    def test_list_is_capped_and_blocks_stay_within_six(self):
        sites = [site(f"https://s{i}", False, None, "x") for i in range(9)]
        card = main.build_card({"sites": sites, "history": [[NOW - h * 3600, 90, 0, 9] for h in range(24)]}, NOW)
        self.assertLessEqual(len(card["blocks"]), 6)
        self.assertEqual(len(card["blocks"][2]["rows"]) if card["blocks"][2]["type"] == "list" else 5, 5)

    def test_no_sites_still_links_to_the_app(self):
        card = main.build_card({"sites": []}, NOW)
        self.assertEqual(card["status"], "No sites yet")

    def test_missing_url_is_a_card_error(self):
        with self.assertRaises(main.CardError):
            main.fetch("")

    def test_unreachable_app_is_a_card_error(self):
        with mock.patch.object(main, "urlopen", side_effect=OSError("x")):
            with self.assertRaises(main.CardError):
                main.fetch("http://app:8080")

    def test_card_matches_schema_limits(self):
        card = main.build_card({"sites": [site("https://a" + "x" * 300, False, None, "e" * 300)], "history": []}, NOW)
        json.dumps(card)
        for row in card["blocks"][2]["rows"]:
            self.assertLessEqual(len(row["text"]), 120)
            self.assertLessEqual(len(row["note"]), 120)


if __name__ == "__main__":
    unittest.main()
