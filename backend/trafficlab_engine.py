#!/usr/bin/env python3
"""
TrafficLab Analytical & Matching Engine
Modular Transportation Engineering Engine for Vehicle Entry-Exit Tracking,
Partial License Plate Matching, OD Matrix Synthesis, and Travel Time Analysis.
"""

from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
import json
import math
import statistics
import sys
from typing import List, Dict, Any, Optional, Tuple

def parse_iso_or_epoch(val: Any) -> float:
    """Parses ISO timestamp string or numeric epoch seconds into float epoch seconds."""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        # Handle trailing Z or offsets
        val_clean = val.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(val_clean)
            return dt.timestamp()
        except Exception:
            try:
                return float(val)
            except Exception as e:
                raise ValueError(f"Cannot parse timestamp '{val}': {e}")
    raise ValueError(f"Unsupported timestamp type: {type(val)}")

def format_epoch_iso(epoch_sec: float) -> str:
    """Formats epoch seconds into standard UTC ISO 8601 string."""
    dt = datetime.fromtimestamp(epoch_sec, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

@dataclass
class Observation:
    id: str
    study_id: str
    point_code: str
    point_type: str  # 'ENTRY' or 'EXIT'
    plate_suffix: str  # 3 digits, string to preserve leading zeroes
    observation_timestamp: float
    vehicle_category: str = "CAR"
    vehicle_color: Optional[str] = None
    observer_id: Optional[str] = None
    idempotency_key: Optional[str] = None

@dataclass
class CandidatePair:
    entry_id: str
    exit_id: str
    plate_suffix: str
    entry_point: str
    exit_point: str
    entry_time: float
    exit_time: float
    travel_time_sec: float
    confidence_score: float
    category_match: bool
    estimated_speed_kmh: Optional[float] = None

@dataclass
class MatchResult:
    id: str
    study_id: str
    plate_suffix: str
    entry_observation_id: str
    exit_observation_id: str
    entry_point_code: str
    exit_point_code: str
    entry_timestamp: str
    exit_timestamp: str
    travel_time_seconds: float
    estimated_speed_kmh: Optional[float]
    confidence_score: float
    match_status: str  # 'MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'REVIEWED', 'REJECTED'
    vehicle_category: str
    candidate_ids: List[str] = field(default_factory=list)
    notes: Optional[str] = None

class PartialPlateMatcher:
    def __init__(
        self,
        min_travel_time_sec: float = 30.0,
        max_travel_time_sec: float = 900.0,
        strict_category_match: bool = False,
        route_distances: Optional[Dict[str, float]] = None,
    ):
        self.min_travel_time_sec = float(min_travel_time_sec)
        self.max_travel_time_sec = float(max_travel_time_sec)
        self.strict_category_match = strict_category_match
        # route_distances: mapping e.g. "E01->X01": distance_in_meters
        self.route_distances = route_distances or {}

    def get_route_distance(self, entry: str, exit_pt: str) -> Optional[float]:
        key = f"{entry}->{exit_pt}"
        if key in self.route_distances:
            return float(self.route_distances[key])
        alt_key = f"{entry}_{exit_pt}"
        if alt_key in self.route_distances:
            return float(self.route_distances[alt_key])
        return None

    def calculate_confidence(
        self,
        travel_time_sec: float,
        entry_cat: str,
        exit_cat: str,
        distance_m: Optional[float] = None
    ) -> Tuple[float, Optional[float]]:
        """
        Calculates match confidence (0-100) and estimated journey speed (km/h).
        Considers time window feasibility, speed plausibility, and category agreement.
        """
        score = 65.0  # Base score for identical 3-digit suffix

        # Category compatibility check (up to 15 pts)
        norm_entry = (entry_cat or "").strip().upper()
        norm_exit = (exit_cat or "").strip().upper()
        if norm_entry and norm_exit:
            if norm_entry == norm_exit:
                score += 15.0
            elif norm_entry in ("UNKNOWN", "OTHER") or norm_exit in ("UNKNOWN", "OTHER"):
                score += 5.0
            else:
                score -= 20.0  # Category discrepancy penalty
        else:
            score += 5.0

        # Speed calculation and physical plausibility check
        speed_kmh = None
        if distance_m is not None and distance_m > 0 and travel_time_sec > 0:
            speed_kmh = (distance_m / travel_time_sec) * 3.6
            # Urban speeds typically 10 - 90 km/h
            if 15.0 <= speed_kmh <= 80.0:
                score += 20.0
            elif 5.0 <= speed_kmh < 15.0 or 80.0 < speed_kmh <= 110.0:
                score += 10.0
            elif speed_kmh > 140.0 or speed_kmh < 3.0:
                # Highly implausible speed indicates spurious match
                score -= 35.0
        else:
            # When distance is unknown, evaluate relative travel time position within window
            mid_window = (self.min_travel_time_sec + self.max_travel_time_sec) / 2.0
            time_dev = abs(travel_time_sec - mid_window) / (self.max_travel_time_sec - self.min_travel_time_sec)
            score += max(0.0, 20.0 * (1.0 - time_dev))

        clamped_score = max(5.0, min(99.0, score))
        return round(clamped_score, 1), round(speed_kmh, 1) if speed_kmh is not None else None

    def match_observations(self, observations: List[Observation]) -> Dict[str, Any]:
        """
        Main matching pipeline.
        1. Segregate entries and exits.
        2. Identify candidate pairs where t_exit > t_entry and within feasible travel time window.
        3. Detect ambiguities (1 entry matching multiple exits or 1 exit matching multiple entries).
        4. Produce MATCHED, AMBIGUOUS, and UNMATCHED records.
        """
        entries: List[Observation] = []
        exits: List[Observation] = []

        for obs in observations:
            p_type = obs.point_type.strip().upper()
            if p_type == "ENTRY":
                entries.append(obs)
            elif p_type == "EXIT":
                exits.append(obs)

        # Sort chronologically
        entries.sort(key=lambda o: o.observation_timestamp)
        exits.sort(key=lambda o: o.observation_timestamp)

        # Map by plate suffix
        entries_by_suffix: Dict[str, List[Observation]] = {}
        for e in entries:
            entries_by_suffix.setdefault(e.plate_suffix, []).append(e)

        exits_by_suffix: Dict[str, List[Observation]] = {}
        for x in exits:
            exits_by_suffix.setdefault(x.plate_suffix, []).append(x)

        all_suffixes = set(entries_by_suffix.keys()) | set(exits_by_suffix.keys())

        matched_records: List[MatchResult] = []
        ambiguous_records: List[Dict[str, Any]] = []
        matched_entry_ids = set()
        matched_exit_ids = set()

        for suffix in sorted(all_suffixes):
            suffix_entries = entries_by_suffix.get(suffix, [])
            suffix_exits = exits_by_suffix.get(suffix, [])

            # Find all feasible candidate pairs
            candidate_pairs: List[CandidatePair] = []
            for ent in suffix_entries:
                for ext in suffix_exits:
                    tt = ext.observation_timestamp - ent.observation_timestamp
                    if self.min_travel_time_sec <= tt <= self.max_travel_time_sec:
                        cat_match = (
                            ent.vehicle_category.upper() == ext.vehicle_category.upper()
                            or ent.vehicle_category.upper() in ("UNKNOWN", "OTHER")
                            or ext.vehicle_category.upper() in ("UNKNOWN", "OTHER")
                        )
                        if self.strict_category_match and not cat_match:
                            continue

                        dist = self.get_route_distance(ent.point_code, ext.point_code)
                        conf, spd = self.calculate_confidence(tt, ent.vehicle_category, ext.vehicle_category, dist)

                        candidate_pairs.append(CandidatePair(
                            entry_id=ent.id,
                            exit_id=ext.id,
                            plate_suffix=suffix,
                            entry_point=ent.point_code,
                            exit_point=ext.point_code,
                            entry_time=ent.observation_timestamp,
                            exit_time=ext.observation_timestamp,
                            travel_time_sec=tt,
                            confidence_score=conf,
                            category_match=cat_match,
                            estimated_speed_kmh=spd
                        ))

            # Resolution strategy
            if not candidate_pairs:
                continue

            # Check if this suffix is unambiguous: 1 entry and 1 exit with 1 pair
            if len(suffix_entries) == 1 and len(suffix_exits) == 1 and len(candidate_pairs) == 1:
                cp = candidate_pairs[0]
                matched_entry_ids.add(cp.entry_id)
                matched_exit_ids.add(cp.exit_id)
                ent_obs = suffix_entries[0]
                category = ent_obs.vehicle_category if ent_obs.vehicle_category != "UNKNOWN" else suffix_exits[0].vehicle_category
                
                matched_records.append(MatchResult(
                    id=f"match-{cp.entry_id}-{cp.exit_id}",
                    study_id=ent_obs.study_id,
                    plate_suffix=suffix,
                    entry_observation_id=cp.entry_id,
                    exit_observation_id=cp.exit_id,
                    entry_point_code=cp.entry_point,
                    exit_point_code=cp.exit_point,
                    entry_timestamp=format_epoch_iso(cp.entry_time),
                    exit_timestamp=format_epoch_iso(cp.exit_time),
                    travel_time_seconds=round(cp.travel_time_sec, 1),
                    estimated_speed_kmh=cp.estimated_speed_kmh,
                    confidence_score=cp.confidence_score,
                    match_status="MATCHED",
                    vehicle_category=category,
                    candidate_ids=[cp.entry_id, cp.exit_id],
                    notes="Deterministic 1-to-1 match within feasible travel time window"
                ))
            else:
                # Multiple candidates exist for this suffix (e.g., duplicate suffix within short duration)
                # Group candidates by exit or entry to find conflicts
                entries_involved = set(cp.entry_id for cp in candidate_pairs)
                exits_involved = set(cp.exit_id for cp in candidate_pairs)

                # If perfectly pairable with identical count and non-overlapping sequence, resolve sequentially
                if len(entries_involved) == len(candidate_pairs) and len(exits_involved) == len(candidate_pairs):
                    # No ambiguity: each entry mapped to distinct exit
                    for cp in candidate_pairs:
                        matched_entry_ids.add(cp.entry_id)
                        matched_exit_ids.add(cp.exit_id)
                        matched_records.append(MatchResult(
                            id=f"match-{cp.entry_id}-{cp.exit_id}",
                            study_id=suffix_entries[0].study_id,
                            plate_suffix=suffix,
                            entry_observation_id=cp.entry_id,
                            exit_observation_id=cp.exit_id,
                            entry_point_code=cp.entry_point,
                            exit_point_code=cp.exit_point,
                            entry_timestamp=format_epoch_iso(cp.entry_time),
                            exit_timestamp=format_epoch_iso(cp.exit_time),
                            travel_time_seconds=round(cp.travel_time_sec, 1),
                            estimated_speed_kmh=cp.estimated_speed_kmh,
                            confidence_score=cp.confidence_score,
                            match_status="MATCHED",
                            vehicle_category=suffix_entries[0].vehicle_category,
                            candidate_ids=[cp.entry_id, cp.exit_id],
                            notes="Resolved 1-to-1 sequential match"
                        ))
                else:
                    # True Ambiguity: One observation has multiple candidate matches!
                    # Mark as AMBIGUOUS for supervisor review and include all candidates
                    ambig_item = {
                        "plate_suffix": suffix,
                        "status": "AMBIGUOUS",
                        "entries_count": len(suffix_entries),
                        "exits_count": len(suffix_exits),
                        "candidate_pairs": [
                            {
                                "entry_id": cp.entry_id,
                                "exit_id": cp.exit_id,
                                "entry_point": cp.entry_point,
                                "exit_point": cp.exit_point,
                                "entry_time": format_epoch_iso(cp.entry_time),
                                "exit_time": format_epoch_iso(cp.exit_time),
                                "travel_time_sec": round(cp.travel_time_sec, 1),
                                "confidence_score": cp.confidence_score,
                                "speed_kmh": cp.estimated_speed_kmh
                            }
                            for cp in candidate_pairs
                        ],
                        "notes": f"Multiple potential vehicle journeys ({len(candidate_pairs)} candidate pairs) detected for suffix {suffix}."
                    }
                    ambiguous_records.append(ambig_item)

        # Unmatched entries and exits
        unmatched_entries = [e for e in entries if e.id not in matched_entry_ids]
        unmatched_exits = [x for x in exits if x.id not in matched_exit_ids]

        total_entries = len(entries)
        total_exits = len(exits)
        matched_count = len(matched_records)
        ambig_count = len(ambiguous_records)

        matching_rate = (matched_count / total_entries * 100.0) if total_entries > 0 else 0.0

        travel_times = [m.travel_time_seconds for m in matched_records]
        mean_tt = round(statistics.mean(travel_times), 1) if travel_times else 0.0
        median_tt = round(statistics.median(travel_times), 1) if travel_times else 0.0

        summary = {
            "total_observations": len(observations),
            "total_entries": total_entries,
            "total_exits": total_exits,
            "matched_journeys": matched_count,
            "ambiguous_cases": ambig_count,
            "unmatched_entries": len(unmatched_entries),
            "unmatched_exits": len(unmatched_exits),
            "matching_rate_percent": round(matching_rate, 2),
            "mean_travel_time_sec": mean_tt,
            "median_travel_time_sec": median_tt
        }

        return {
            "summary": summary,
            "matches": [asdict(m) for m in matched_records],
            "ambiguous": ambiguous_records,
            "unmatched_entries": [
                {
                    "id": u.id,
                    "plate_suffix": u.plate_suffix,
                    "point_code": u.point_code,
                    "timestamp": format_epoch_iso(u.observation_timestamp),
                    "vehicle_category": u.vehicle_category
                }
                for u in unmatched_entries
            ],
            "unmatched_exits": [
                {
                    "id": u.id,
                    "plate_suffix": u.plate_suffix,
                    "point_code": u.point_code,
                    "timestamp": format_epoch_iso(u.observation_timestamp),
                    "vehicle_category": u.vehicle_category
                }
                for u in unmatched_exits
            ]
        }


class TrafficAnalytics:
    @staticmethod
    def calculate_od_matrix(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Builds the 2D Origin-Destination Matrix with row, column, and total sums.
        """
        origins = sorted(list(set(m["entry_point_code"] for m in matches)))
        destinations = sorted(list(set(m["exit_point_code"] for m in matches)))

        matrix: Dict[str, Dict[str, int]] = {o: {d: 0 for d in destinations} for o in origins}
        row_totals: Dict[str, int] = {o: 0 for o in origins}
        col_totals: Dict[str, int] = {d: 0 for d in destinations}
        grand_total = 0

        for m in matches:
            o = m["entry_point_code"]
            d = m["exit_point_code"]
            if o in matrix and d in matrix[o]:
                matrix[o][d] += 1
                row_totals[o] += 1
                col_totals[d] += 1
                grand_total += 1

        # Calculate percentage distribution
        percentage_matrix: Dict[str, Dict[str, float]] = {
            o: {d: round((matrix[o][d] / grand_total * 100.0), 1) if grand_total > 0 else 0.0 for d in destinations}
            for o in origins
        }

        return {
            "origins": origins,
            "destinations": destinations,
            "counts": matrix,
            "percentages": percentage_matrix,
            "row_totals": row_totals,
            "col_totals": col_totals,
            "grand_total": grand_total
        }

    @staticmethod
    def calculate_travel_time_stats(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates travel time distribution statistics: mean, median, std dev,
        min, max, and percentiles (15th, 50th, 85th, 95th).
        """
        times = [float(m["travel_time_seconds"]) for m in matches if "travel_time_seconds" in m]
        if not times:
            return {
                "count": 0,
                "mean": 0.0,
                "median": 0.0,
                "std_dev": 0.0,
                "min": 0.0,
                "max": 0.0,
                "p15": 0.0,
                "p50": 0.0,
                "p85": 0.0,
                "p95": 0.0,
                "histogram": []
            }

        times.sort()
        n = len(times)

        def percentile(p: float) -> float:
            if n == 1:
                return times[0]
            k = (n - 1) * (p / 100.0)
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return times[int(k)]
            d0 = times[int(f)] * (c - k)
            d1 = times[int(c)] * (k - f)
            return d0 + d1

        mean_val = statistics.mean(times)
        std_val = statistics.stdev(times) if n > 1 else 0.0
        med_val = statistics.median(times)

        # Build 6-bin histogram
        min_t = times[0]
        max_t = times[-1]
        bin_count = 6
        bin_width = max(1.0, (max_t - min_t) / bin_count)
        histogram = []
        for i in range(bin_count):
            b_start = min_t + i * bin_width
            b_end = b_start + bin_width
            cnt = sum(1 for t in times if b_start <= t < b_end or (i == bin_count - 1 and t == max_t))
            histogram.append({
                "bin_start": round(b_start, 1),
                "bin_end": round(b_end, 1),
                "label": f"{int(b_start)}s - {int(b_end)}s",
                "count": cnt
            })

        return {
            "count": n,
            "mean": round(mean_val, 1),
            "median": round(med_val, 1),
            "std_dev": round(std_val, 1),
            "min": round(min_t, 1),
            "max": round(max_t, 1),
            "p15": round(percentile(15.0), 1),
            "p50": round(med_val, 1),
            "p85": round(percentile(85.0), 1),
            "p95": round(percentile(95.0), 1),
            "histogram": histogram
        }

    @staticmethod
    def calculate_vehicle_category_split(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculates modal split by vehicle classification."""
        counts: Dict[str, int] = {}
        for m in matches:
            cat = m.get("vehicle_category", "UNKNOWN") or "UNKNOWN"
            counts[cat] = counts.get(cat, 0) + 1

        total = len(matches)
        percentages = {k: round(v / total * 100.0, 1) for k, v in counts.items()} if total > 0 else {}
        return {
            "total": total,
            "counts": counts,
            "percentages": percentages
        }


class ReportExporter:
    @staticmethod
    def export_csv(matches: List[Dict[str, Any]], od_matrix: Dict[str, Any]) -> str:
        """Generates RFC 4180 compliant CSV of matched records and OD counts."""
        lines = []
        lines.append("# TrafficLab Matched Vehicle Journey Records")
        lines.append("Match ID,Plate Suffix,Entry Point,Exit Point,Entry Time (UTC),Exit Time (UTC),Travel Time (sec),Speed (km/h),Confidence (%),Vehicle Category,Status")
        
        for m in matches:
            speed_str = str(m.get("estimated_speed_kmh") or "N/A")
            lines.append(
                f'"{m.get("id")}","{m.get("plate_suffix")}","{m.get("entry_point_code")}","{m.get("exit_point_code")}",'
                f'"{m.get("entry_timestamp")}","{m.get("exit_timestamp")}",{m.get("travel_time_seconds")},'
                f'{speed_str},{m.get("confidence_score")},"{m.get("vehicle_category")}","{m.get("match_status")}"'
            )

        lines.append("")
        lines.append("# Origin-Destination Matrix Summary")
        dest_header = ",".join([f'"{d}"' for d in od_matrix.get("destinations", [])])
        lines.append(f"Origin,{dest_header},Total")

        for orig in od_matrix.get("origins", []):
            row_vals = [str(od_matrix["counts"][orig].get(d, 0)) for d in od_matrix.get("destinations", [])]
            lines.append(f'"{orig}",{",".join(row_vals)},{od_matrix["row_totals"].get(orig, 0)}')

        col_tot_vals = [str(od_matrix["col_totals"].get(d, 0)) for d in od_matrix.get("destinations", [])]
        lines.append(f'"Total",{",".join(col_tot_vals)},{od_matrix.get("grand_total", 0)}')

        return "\n".join(lines)


def run_cli():
    """CLI dispatcher for IPC from Express server."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified. Use match, od, or stats."}))
        sys.exit(1)

    action = sys.argv[1].lower()
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        print(json.dumps({"error": "Empty input payload"}))
        sys.exit(1)

    try:
        payload = json.loads(raw_input)
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON payload: {e}"}))
        sys.exit(1)

    if action == "match":
        obs_raw = payload.get("observations", [])
        obs_list = []
        for o in obs_raw:
            obs_list.append(Observation(
                id=str(o["id"]),
                study_id=str(o.get("study_id", "")),
                point_code=str(o["point_code"]),
                point_type=str(o["point_type"]),
                plate_suffix=str(o["plate_suffix"]).zfill(3),
                observation_timestamp=parse_iso_or_epoch(o["observation_timestamp"]),
                vehicle_category=str(o.get("vehicle_category", "CAR")),
                vehicle_color=o.get("vehicle_color"),
                observer_id=o.get("observer_id")
            ))

        matcher = PartialPlateMatcher(
            min_travel_time_sec=payload.get("min_travel_time_sec", 30.0),
            max_travel_time_sec=payload.get("max_travel_time_sec", 900.0),
            strict_category_match=payload.get("strict_category_match", False),
            route_distances=payload.get("route_distances", {})
        )

        result = matcher.match_observations(obs_list)
        print(json.dumps(result))

    elif action == "analytics":
        matches = payload.get("matches", [])
        od = TrafficAnalytics.calculate_od_matrix(matches)
        tt_stats = TrafficAnalytics.calculate_travel_time_stats(matches)
        cat_split = TrafficAnalytics.calculate_vehicle_category_split(matches)

        response = {
            "od_matrix": od,
            "travel_time_stats": tt_stats,
            "vehicle_category_split": cat_split
        }
        print(json.dumps(response))

    elif action == "export_csv":
        matches = payload.get("matches", [])
        od = TrafficAnalytics.calculate_od_matrix(matches)
        csv_content = ReportExporter.export_csv(matches, od)
        print(json.dumps({"csv": csv_content}))

    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))
        sys.exit(1)

if __name__ == "__main__":
    run_cli()
