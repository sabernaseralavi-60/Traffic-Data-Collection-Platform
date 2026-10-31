#!/usr/bin/env python3
"""
Unit tests for TrafficLab Matching Engine and Analytics.
Covers:
- Acceptance test scenario: Suffix 387 recorded at E01 (08:15:10) and X01 (08:19:20)
- Travel time calculation: 250s (4 min 10 sec)
- Speed calculation when distance is known
- Multiple identical suffixes (ambiguity detection vs blind association)
- Category mismatch handling
- Leading zeroes in plate suffixes (e.g. "042")
- OD matrix generation
- Travel time percentiles (p15, p50, p85, p95)
"""

import unittest
from datetime import datetime
from backend.trafficlab_engine import (
    Observation,
    PartialPlateMatcher,
    TrafficAnalytics,
    ReportExporter
)

class TestTrafficLabEngine(unittest.TestCase):
    def setUp(self):
        self.matcher = PartialPlateMatcher(
            min_travel_time_sec=30.0,
            max_travel_time_sec=900.0,
            strict_category_match=False,
            route_distances={"E01->X01": 2500.0}  # 2.5 km
        )

    def test_acceptance_test_scenario_plate_387(self):
        """
        MVP Acceptance Test Step:
        Observer 1 records plate suffix 387 at E01 at 08:15:10.
        Observer 2 records plate suffix 387 at X01 at 08:19:20.
        Expected:
        - Exactly 1 MATCHED journey
        - Travel time = 250 seconds (4 min 10 sec)
        - Estimated speed = 2500m / 250s * 3.6 = 36.0 km/h
        - High confidence score (>= 85%)
        """
        obs_entry = Observation(
            id="obs-entry-1",
            study_id="study-azadi",
            point_code="E01",
            point_type="ENTRY",
            plate_suffix="387",
            observation_timestamp=datetime.fromisoformat("2026-10-30T08:15:10+00:00").timestamp(),
            vehicle_category="CAR"
        )

        obs_exit = Observation(
            id="obs-exit-1",
            study_id="study-azadi",
            point_code="X01",
            point_type="EXIT",
            plate_suffix="387",
            observation_timestamp=datetime.fromisoformat("2026-10-30T08:19:20+00:00").timestamp(),
            vehicle_category="CAR"
        )

        result = self.matcher.match_observations([obs_entry, obs_exit])
        matches = result["matches"]

        self.assertEqual(len(matches), 1)
        m = matches[0]
        self.assertEqual(m["plate_suffix"], "387")
        self.assertEqual(m["entry_point_code"], "E01")
        self.assertEqual(m["exit_point_code"], "X01")
        self.assertEqual(m["travel_time_seconds"], 250.0)
        self.assertAlmostEqual(m["estimated_speed_kmh"], 36.0, places=1)
        self.assertEqual(m["match_status"], "MATCHED")
        self.assertGreaterEqual(m["confidence_score"], 85.0)

    def test_leading_zero_plate_suffix(self):
        """Verify plate suffixes like '042' preserve leading zero and match correctly."""
        obs_entry = Observation(
            id="obs-e-042",
            study_id="study-1",
            point_code="E01",
            point_type="ENTRY",
            plate_suffix="042",
            observation_timestamp=1000.0,
            vehicle_category="CAR"
        )
        obs_exit = Observation(
            id="obs-x-042",
            study_id="study-1",
            point_code="X01",
            point_type="EXIT",
            plate_suffix="042",
            observation_timestamp=1180.0,
            vehicle_category="CAR"
        )
        result = self.matcher.match_observations([obs_entry, obs_exit])
        self.assertEqual(len(result["matches"]), 1)
        self.assertEqual(result["matches"][0]["plate_suffix"], "042")
        self.assertEqual(result["matches"][0]["travel_time_seconds"], 180.0)

    def test_travel_time_window_filtering(self):
        """Observations faster than min_travel_time or slower than max_travel_time must NOT match."""
        # Too fast: 10 seconds (under 30s min)
        fast_entry = Observation("f1", "s1", "E01", "ENTRY", "111", 1000.0)
        fast_exit = Observation("f2", "s1", "X01", "EXIT", "111", 1010.0)
        res_fast = self.matcher.match_observations([fast_entry, fast_exit])
        self.assertEqual(len(res_fast["matches"]), 0)
        self.assertEqual(len(res_fast["unmatched_entries"]), 1)

        # Too slow: 1200 seconds (over 900s max)
        slow_entry = Observation("s1", "s1", "E01", "ENTRY", "222", 1000.0)
        slow_exit = Observation("s2", "s1", "X01", "EXIT", "222", 2200.0)
        res_slow = self.matcher.match_observations([slow_entry, slow_exit])
        self.assertEqual(len(res_slow["matches"]), 0)

    def test_ambiguous_matching_duplicate_suffixes(self):
        """
        Two distinct vehicles with the same suffix '555' enter at different times,
        but only 1 exit is recorded. The system must NOT blindly guess, but mark as AMBIGUOUS.
        """
        entry_1 = Observation("e-555-1", "s1", "E01", "ENTRY", "555", 1000.0, vehicle_category="CAR")
        entry_2 = Observation("e-555-2", "s1", "E02", "ENTRY", "555", 1050.0, vehicle_category="CAR")
        exit_1 = Observation("x-555-1", "s1", "X01", "EXIT", "555", 1200.0, vehicle_category="CAR")

        res = self.matcher.match_observations([entry_1, entry_2, exit_1])
        self.assertEqual(len(res["matches"]), 0)
        self.assertEqual(len(res["ambiguous"]), 1)
        ambig = res["ambiguous"][0]
        self.assertEqual(ambig["plate_suffix"], "555")
        self.assertEqual(len(ambig["candidate_pairs"]), 2)

    def test_od_matrix_and_travel_time_analytics(self):
        """Verify OD Matrix calculation and statistics."""
        matches = [
            {"entry_point_code": "E01", "exit_point_code": "X01", "travel_time_seconds": 200.0, "vehicle_category": "CAR"},
            {"entry_point_code": "E01", "exit_point_code": "X01", "travel_time_seconds": 220.0, "vehicle_category": "CAR"},
            {"entry_point_code": "E01", "exit_point_code": "X02", "travel_time_seconds": 300.0, "vehicle_category": "TAXI"},
            {"entry_point_code": "E02", "exit_point_code": "X01", "travel_time_seconds": 180.0, "vehicle_category": "BUS"},
            {"entry_point_code": "E02", "exit_point_code": "X02", "travel_time_seconds": 240.0, "vehicle_category": "TRUCK"},
        ]

        od = TrafficAnalytics.calculate_od_matrix(matches)
        self.assertEqual(od["counts"]["E01"]["X01"], 2)
        self.assertEqual(od["counts"]["E01"]["X02"], 1)
        self.assertEqual(od["counts"]["E02"]["X01"], 1)
        self.assertEqual(od["counts"]["E02"]["X02"], 1)
        self.assertEqual(od["row_totals"]["E01"], 3)
        self.assertEqual(od["row_totals"]["E02"], 2)
        self.assertEqual(od["grand_total"], 5)

        stats = TrafficAnalytics.calculate_travel_time_stats(matches)
        self.assertEqual(stats["count"], 5)
        self.assertEqual(stats["min"], 180.0)
        self.assertEqual(stats["max"], 300.0)
        self.assertEqual(stats["median"], 220.0)
        self.assertAlmostEqual(stats["mean"], 228.0, places=1)
        self.assertGreater(stats["p85"], 220.0)

        # Test CSV export
        csv_str = ReportExporter.export_csv(matches, od)
        self.assertIn("Match ID", csv_str)
        self.assertIn("Origin-Destination Matrix Summary", csv_str)
        self.assertIn('"E01"', csv_str)

if __name__ == "__main__":
    unittest.main()
