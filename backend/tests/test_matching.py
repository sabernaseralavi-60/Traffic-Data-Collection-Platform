#!/usr/bin/env python3
"""
Unit tests for the TrafficLab matching engine and analytics (synthetic observations only).

Covers the spec's edge cases: acceptance scenario (suffix 387), leading zeros, same suffix at different places,
missing exit / missing entry, incorrect timestamp, ambiguity, supervisor review (REVIEWED / REJECTED), time-zone
independence, filters, counts, route speeds, and safe CSV export.
"""

import json
import os
import subprocess
import sys
import time
import unittest
from datetime import datetime

from backend.trafficlab_engine import (
    Observation,
    PartialPlateMatcher,
    ReportExporter,
    TrafficAnalytics,
    apply_filters,
    build_report,
    parse_iso_or_epoch,
)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def iso(s: str) -> float:
    return datetime.fromisoformat(s).timestamp()


def obs(id_, point, kind, suffix, t, cat="CAR", study="s1"):
    return Observation(id_, study, point, kind, suffix, t, cat)


class TestMatching(unittest.TestCase):
    def setUp(self):
        self.matcher = PartialPlateMatcher(30.0, 900.0, False, {"E01->X01": 2500.0})

    def test_acceptance_scenario_387(self):
        e = obs("e1", "E01", "ENTRY", "387", iso("2026-10-30T08:15:10+00:00"))
        x = obs("x1", "X01", "EXIT", "387", iso("2026-10-30T08:19:20+00:00"))
        res = self.matcher.match_observations([e, x])
        self.assertEqual(len(res["matches"]), 1)
        m = res["matches"][0]
        self.assertEqual((m["entry_point_code"], m["exit_point_code"]), ("E01", "X01"))
        self.assertEqual(m["travel_time_seconds"], 250.0)
        self.assertAlmostEqual(m["estimated_speed_kmh"], 36.0, places=1)
        self.assertEqual(m["match_status"], "MATCHED")
        self.assertEqual(m["match_score"], 90.0)  # 40 + 20 (same category) + 30 (36 km/h is plausible)
        self.assertIn("not a probability", res["summary"]["method_note"])

    def test_leading_zero_preserved(self):
        res = self.matcher.match_observations([obs("a", "E01", "ENTRY", "042", 1000.0), obs("b", "X01", "EXIT", "042", 1180.0)])
        self.assertEqual(res["matches"][0]["plate_suffix"], "042")
        self.assertEqual(res["matches"][0]["travel_time_seconds"], 180.0)

    def test_window_filtering(self):
        fast = self.matcher.match_observations([obs("a", "E01", "ENTRY", "111", 1000.0), obs("b", "X01", "EXIT", "111", 1010.0)])
        self.assertEqual(len(fast["matches"]), 0)
        self.assertEqual(len(fast["unmatched_entries"]), 1)
        self.assertEqual(len(fast["unmatched_exits"]), 1)
        slow = self.matcher.match_observations([obs("a", "E01", "ENTRY", "222", 1000.0), obs("b", "X01", "EXIT", "222", 2200.0)])
        self.assertEqual(len(slow["matches"]), 0)

    def test_missing_exit_and_missing_entry_are_unmatched(self):
        res = self.matcher.match_observations([obs("a", "E01", "ENTRY", "100", 1000.0), obs("b", "X01", "EXIT", "200", 1100.0)])
        self.assertEqual(res["summary"]["unmatched_entries"], 1)
        self.assertEqual(res["summary"]["unmatched_exits"], 1)
        self.assertEqual(res["summary"]["matching_rate_percent"], 0.0)

    def test_exit_before_entry_does_not_match(self):
        res = self.matcher.match_observations([obs("a", "E01", "ENTRY", "300", 2000.0), obs("b", "X01", "EXIT", "300", 1900.0)])
        self.assertEqual(len(res["matches"]), 0)

    def test_same_suffix_two_entries_one_exit_is_ambiguous_and_not_counted_unmatched(self):
        e1 = obs("e1", "E01", "ENTRY", "555", 1000.0)
        e2 = obs("e2", "E02", "ENTRY", "555", 1050.0)
        x1 = obs("x1", "X01", "EXIT", "555", 1200.0)
        res = self.matcher.match_observations([e1, e2, x1])
        self.assertEqual(len(res["matches"]), 0)
        self.assertEqual(len(res["ambiguous"]), 1)
        self.assertEqual(len(res["ambiguous"][0]["candidate_pairs"]), 2)
        s = res["summary"]
        self.assertEqual((s["ambiguous_entries"], s["ambiguous_exits"]), (2, 1))
        self.assertEqual((s["unmatched_entries"], s["unmatched_exits"]), (0, 0))  # ambiguity is not "unmatched"

    def test_two_vehicles_same_suffix_distinct_pairs_each_get_own_category(self):
        res = self.matcher.match_observations([
            obs("e1", "E01", "ENTRY", "777", 1000.0, "CAR"), obs("x1", "X01", "EXIT", "777", 1150.0, "CAR"),
            obs("e2", "E01", "ENTRY", "777", 5000.0, "BUS"), obs("x2", "X01", "EXIT", "777", 5200.0, "BUS"),
        ])
        cats = sorted(m["vehicle_category"] for m in res["matches"])
        self.assertEqual(cats, ["BUS", "CAR"])
        self.assertEqual(len(res["ambiguous"]), 0)

    def test_strict_category_blocks_mismatch(self):
        strict = PartialPlateMatcher(30, 900, True)
        res = strict.match_observations([obs("a", "E01", "ENTRY", "123", 1000.0, "CAR"), obs("b", "X01", "EXIT", "123", 1200.0, "BUS")])
        self.assertEqual(len(res["matches"]), 0)

    def test_review_confirmed_resolves_ambiguity(self):
        e1, e2 = obs("e1", "E01", "ENTRY", "555", 1000.0), obs("e2", "E02", "ENTRY", "555", 1050.0)
        x1 = obs("x1", "X01", "EXIT", "555", 1200.0)
        res = self.matcher.match_observations([e1, e2, x1], reviews=[{"entry_id": "e2", "exit_id": "x1", "decision": "REVIEWED", "note": "seen"}])
        self.assertEqual([m["match_status"] for m in res["matches"]], ["REVIEWED"])
        self.assertEqual(res["matches"][0]["entry_observation_id"], "e2")
        self.assertEqual(res["summary"]["reviewed_journeys"], 1)
        self.assertEqual(len(res["ambiguous"]), 0)
        self.assertEqual(res["summary"]["unmatched_entries"], 1)  # e1 remains an unmatched entry

    def test_review_rejected_pair_is_never_proposed_again(self):
        e1, x1 = obs("e1", "E01", "ENTRY", "555", 1000.0), obs("x1", "X01", "EXIT", "555", 1200.0)
        res = self.matcher.match_observations([e1, x1], reviews=[{"entry_id": "e1", "exit_id": "x1", "decision": "REJECTED"}])
        self.assertEqual(len(res["matches"]), 0)
        self.assertEqual(res["summary"]["rejected_pairs"], 1)
        self.assertEqual(res["summary"]["unmatched_entries"], 1)

    def test_review_with_impossible_order_is_ignored(self):
        e1, x1 = obs("e1", "E01", "ENTRY", "555", 1200.0), obs("x1", "X01", "EXIT", "555", 1000.0)
        res = self.matcher.match_observations([e1, x1], reviews=[{"entry_id": "e1", "exit_id": "x1", "decision": "REVIEWED"}])
        self.assertEqual(len(res["matches"]), 0)

    def test_window_validation(self):
        with self.assertRaises(ValueError):
            PartialPlateMatcher(100, 50)

    def test_zero_width_window_does_not_divide_by_zero(self):
        res = PartialPlateMatcher(100, 100).match_observations([obs("a", "E01", "ENTRY", "900", 0.0), obs("b", "X01", "EXIT", "900", 100.0)])
        self.assertEqual(len(res["matches"]), 1)


class TestScore(unittest.TestCase):
    def test_score_discriminates_and_never_saturates(self):
        m = PartialPlateMatcher(30, 900, False, {"E01->X01": 2500.0})
        good, _ = m.score(250, "CAR", "CAR", 2500)       # 36 km/h
        slow, _ = m.score(800, "CAR", "CAR", 2500)       # 11 km/h
        fast, _ = m.score(70, "CAR", "CAR", 2500)        # 128 km/h
        mismatch, _ = m.score(250, "CAR", "BUS", 2500)
        self.assertGreater(good, slow)
        self.assertGreater(slow, fast)
        self.assertGreater(good, mismatch)
        self.assertLessEqual(good, 95.0)
        absurd, spd = m.score(5, "CAR", "CAR", 2500)     # 1800 km/h
        self.assertLess(absurd, 40.0)
        self.assertGreater(spd, 1000)

    def test_without_distance_window_position_is_used(self):
        m = PartialPlateMatcher(30, 900)
        mid, _ = m.score(465, "CAR", "CAR", None)
        edge, _ = m.score(31, "CAR", "CAR", None)
        self.assertGreater(mid, edge)


class TestTimestamps(unittest.TestCase):
    def test_naive_timestamp_is_utc_regardless_of_server_timezone(self):
        code = "from backend.trafficlab_engine import parse_iso_or_epoch as p;print(p('2026-10-30T08:15:10'))"
        outs = set()
        for tz in ("UTC", "Asia/Tehran", "America/New_York"):
            env = {**os.environ, "TZ": tz}
            if sys.platform == "win32":
                self.skipTest("TZ env var is not honoured by the C runtime on Windows; covered on Linux CI")
            outs.add(subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True).stdout.strip())
        self.assertEqual(len(outs), 1)

    def test_naive_equals_explicit_utc(self):
        self.assertEqual(parse_iso_or_epoch("2026-10-30T08:15:10"), parse_iso_or_epoch("2026-10-30T08:15:10Z"))
        self.assertEqual(parse_iso_or_epoch("2026-10-30T11:45:10+03:30"), parse_iso_or_epoch("2026-10-30T08:15:10Z"))

    def test_garbage_timestamp_raises(self):
        with self.assertRaises(ValueError):
            parse_iso_or_epoch("not a time")
        with self.assertRaises(ValueError):
            parse_iso_or_epoch(True)


class TestAnalytics(unittest.TestCase):
    MATCHES = [
        {"entry_point_code": "E01", "exit_point_code": "X01", "travel_time_seconds": 200.0, "vehicle_category": "CAR"},
        {"entry_point_code": "E01", "exit_point_code": "X01", "travel_time_seconds": 220.0, "vehicle_category": "CAR"},
        {"entry_point_code": "E01", "exit_point_code": "X02", "travel_time_seconds": 300.0, "vehicle_category": "TAXI"},
        {"entry_point_code": "E02", "exit_point_code": "X01", "travel_time_seconds": 180.0, "vehicle_category": "BUS"},
        {"entry_point_code": "E02", "exit_point_code": "X02", "travel_time_seconds": 240.0, "vehicle_category": "TRUCK"},
    ]

    def test_od_matrix_and_stats(self):
        od = TrafficAnalytics.calculate_od_matrix(self.MATCHES)
        self.assertEqual(od["counts"]["E01"]["X01"], 2)
        self.assertEqual((od["row_totals"]["E01"], od["row_totals"]["E02"], od["grand_total"]), (3, 2, 5))
        self.assertEqual(sum(od["col_totals"].values()), 5)
        st = TrafficAnalytics.calculate_travel_time_stats(self.MATCHES)
        self.assertEqual((st["count"], st["min"], st["max"], st["median"]), (5, 180.0, 300.0, 220.0))
        self.assertAlmostEqual(st["mean"], 228.0, places=1)
        self.assertEqual(sum(b["count"] for b in st["histogram"]), 5)

    def test_empty_inputs(self):
        self.assertEqual(TrafficAnalytics.calculate_od_matrix([])["grand_total"], 0)
        self.assertEqual(TrafficAnalytics.calculate_travel_time_stats([])["count"], 0)

    def test_route_speed_only_where_distance_known(self):
        sp = TrafficAnalytics.route_speeds(self.MATCHES, {"E01->X01": 2100.0})
        self.assertEqual(len(sp), 1)
        self.assertEqual(sp[0]["route"], "E01->X01")
        self.assertAlmostEqual(sp[0]["mean_journey_speed_kmh"], 2100 / 210 * 3.6, places=1)

    def test_counts_by_point_category_interval(self):
        base = iso("2026-10-30T08:00:00+00:00")
        o = [obs("1", "E01", "ENTRY", "111", base + 60), obs("2", "E01", "ENTRY", "112", base + 14 * 60 + 59, "TAXI"),
             obs("3", "X01", "EXIT", "111", base + 15 * 60, "TAXI")]
        c = TrafficAnalytics.counts(o, 15)
        self.assertEqual((c["total"], c["entries"], c["exits"]), (3, 2, 1))
        self.assertEqual(c["by_point"], {"E01": 2, "X01": 1})
        self.assertEqual(c["by_category"], {"CAR": 1, "TAXI": 2})
        self.assertEqual([b["total"] for b in c["by_interval"]], [2, 1])

    def test_filters(self):
        base = iso("2026-10-30T08:00:00+00:00")
        o = [obs("1", "E01", "ENTRY", "111", base, "CAR"), obs("2", "E02", "ENTRY", "222", base + 600, "BUS"), obs("3", "X01", "EXIT", "111", base + 1200, "CAR")]
        self.assertEqual(len(apply_filters(o, {"categories": ["car"]})), 2)
        self.assertEqual(len(apply_filters(o, {"points": ["E02"]})), 1)
        self.assertEqual(len(apply_filters(o, {"from": "2026-10-30T08:05:00Z", "to": "2026-10-30T08:15:00Z"})), 1)
        self.assertEqual(len(apply_filters(o, None)), 3)


class TestExport(unittest.TestCase):
    def test_csv_neutralises_formulas_and_quotes(self):
        matches = [{"id": "m1", "plate_suffix": "042", "entry_point_code": "E01", "exit_point_code": "X01",
                    "entry_timestamp": "t1", "exit_timestamp": "t2", "travel_time_seconds": 100.0,
                    "estimated_speed_kmh": None, "match_score": 80.0, "vehicle_category": '=HYPERLINK("http://x")', "match_status": "MATCHED"}]
        od = TrafficAnalytics.calculate_od_matrix(matches)
        out = ReportExporter.export_csv(matches, od, [])
        self.assertNotIn(',=HYPERLINK', out)
        self.assertIn("'=HYPERLINK", out)
        self.assertIn("Origin-Destination matrix", out)
        self.assertIn("042", out)  # leading zero kept as text

    def test_csv_includes_ambiguous_section(self):
        amb = [{"plate_suffix": "777", "candidate_pairs": [{"entry_point": "E01", "exit_point": "X01", "entry_time": "a", "exit_time": "b", "travel_time_sec": 10, "match_score": 70}]}]
        out = ReportExporter.export_csv([], TrafficAnalytics.calculate_od_matrix([]), amb)
        self.assertIn("Ambiguous cases", out)
        self.assertIn("777", out)


class TestReportAndCli(unittest.TestCase):
    PAYLOAD = {
        "observations": [
            {"id": "e1", "study_id": "s", "point_code": "E01", "point_type": "ENTRY", "plate_suffix": "387", "observation_timestamp": "2026-10-30T08:15:10Z", "vehicle_category": "CAR"},
            {"id": "x1", "study_id": "s", "point_code": "X01", "point_type": "EXIT", "plate_suffix": "387", "observation_timestamp": "2026-10-30T08:19:20Z", "vehicle_category": "CAR"},
        ],
        "route_distances": {"E01->X01": 2500},
    }

    def test_build_report(self):
        rep = build_report(self.PAYLOAD)
        self.assertEqual(rep["summary"]["matched_journeys"], 1)
        self.assertEqual(rep["analytics"]["od_matrix"]["grand_total"], 1)
        self.assertEqual(rep["analytics"]["route_speeds"][0]["mean_journey_speed_kmh"], 36.0)
        self.assertEqual(rep["analytics"]["counts"]["total"], 2)

    def test_cli_report_roundtrip_utf8(self):
        p = subprocess.run([sys.executable, os.path.join(ROOT, "backend", "trafficlab_engine.py"), "report"],
                           input=json.dumps(self.PAYLOAD).encode(), capture_output=True, cwd=ROOT)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout)["summary"]["matched_journeys"], 1)

    def test_cli_rejects_bad_input_without_traceback(self):
        bad = {"observations": [{"id": "e1"}]}
        p = subprocess.run([sys.executable, os.path.join(ROOT, "backend", "trafficlab_engine.py"), "report"],
                           input=json.dumps(bad).encode(), capture_output=True, cwd=ROOT)
        self.assertEqual(p.returncode, 2)
        self.assertIn("error", json.loads(p.stdout))
        self.assertNotIn(b"Traceback", p.stderr)


if __name__ == "__main__":
    unittest.main()
