#!/usr/bin/env python3
"""
TrafficLab analytical and matching engine.

Entry-exit tracking with partial (3-digit) licence-plate matching, OD matrix, travel-time statistics,
counts, and report export. Pure functions over plain dictionaries: it knows nothing about the database
or HTTP layer (spec 9.1: matching independent of the database interface).

IMPORTANT (method limits): a three-digit suffix is not a vehicle identifier. A MATCHED record is a
*probable* journey. `match_score` is a heuristic ranking value (5-99), NOT a probability.
"""

from __future__ import annotations

import csv
import io
import json
import math
import statistics
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

METHOD_NOTE = (
    "Probable journeys from 3-digit plate suffix + feasible travel-time window. Suffixes are not unique; "
    "match_score is a heuristic (not a probability). Ambiguous cases are never forced and need supervisor review."
)
GENERIC_CATEGORIES = ("UNKNOWN", "OTHER", "")


def parse_iso_or_epoch(val: Any) -> float:
    """ISO-8601 string or epoch seconds -> epoch seconds. A timestamp WITHOUT a zone is read as UTC
    (never as the server's local zone, which would make results depend on where the server runs)."""
    if isinstance(val, bool):
        raise ValueError("Unsupported timestamp type: bool")
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.strip().replace("Z", "+00:00"))
        except ValueError:
            try:
                return float(val)
            except ValueError as exc:
                raise ValueError(f"Cannot parse timestamp '{val}'") from exc
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    raise ValueError(f"Unsupported timestamp type: {type(val)}")


def format_epoch_iso(epoch_sec: float) -> str:
    return datetime.fromtimestamp(epoch_sec, tz=timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class Observation:
    id: str
    study_id: str
    point_code: str
    point_type: str  # 'ENTRY' or 'EXIT'
    plate_suffix: str  # 3 digits kept as text (leading zeros are valid)
    observation_timestamp: float
    vehicle_category: str = "UNKNOWN"
    vehicle_color: Optional[str] = None
    observer_id: Optional[str] = None


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
    match_score: float
    category: str
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
    match_score: float
    match_status: str  # MATCHED | REVIEWED  (AMBIGUOUS / UNMATCHED / REJECTED are reported separately)
    vehicle_category: str
    candidate_ids: List[str] = field(default_factory=list)
    notes: Optional[str] = None


def _norm_cat(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _pick_category(entry_cat: str, exit_cat: str) -> str:
    e, x = _norm_cat(entry_cat), _norm_cat(exit_cat)
    if e not in GENERIC_CATEGORIES:
        return e
    if x not in GENERIC_CATEGORIES:
        return x
    return e or x or "UNKNOWN"


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
        if self.min_travel_time_sec < 0 or self.max_travel_time_sec < self.min_travel_time_sec:
            raise ValueError("travel-time window must satisfy 0 <= min <= max")
        self.strict_category_match = bool(strict_category_match)
        self.route_distances = route_distances or {}  # "E01->X01": metres

    def get_route_distance(self, entry: str, exit_pt: str) -> Optional[float]:
        for key in (f"{entry}->{exit_pt}", f"{entry}_{exit_pt}"):
            if key in self.route_distances:
                return float(self.route_distances[key])
        return None

    def score(self, travel_time_sec: float, entry_cat: str, exit_cat: str,
              distance_m: Optional[float] = None) -> Tuple[float, Optional[float]]:
        """Heuristic ranking score (5-99) and estimated average journey speed (km/h).
        base 65 for equal suffix; +category agreement; +plausible average speed (when the route
        distance is configured) or +position inside the time window (when it is not)."""
        score = 65.0
        e, x = _norm_cat(entry_cat), _norm_cat(exit_cat)
        if e and x:
            if e == x:
                score += 15.0
            elif e in GENERIC_CATEGORIES or x in GENERIC_CATEGORIES:
                score += 5.0
            else:
                score -= 20.0
        else:
            score += 5.0

        speed_kmh = None
        if distance_m is not None and distance_m > 0 and travel_time_sec > 0:
            speed_kmh = (distance_m / travel_time_sec) * 3.6
            if 15.0 <= speed_kmh <= 80.0:
                score += 20.0
            elif 5.0 <= speed_kmh < 15.0 or 80.0 < speed_kmh <= 110.0:
                score += 10.0
            elif speed_kmh > 140.0 or speed_kmh < 3.0:
                score -= 35.0
        else:
            span = self.max_travel_time_sec - self.min_travel_time_sec
            if span > 0:
                mid = (self.min_travel_time_sec + self.max_travel_time_sec) / 2.0
                score += max(0.0, 20.0 * (1.0 - abs(travel_time_sec - mid) / span))
        return round(max(5.0, min(99.0, score)), 1), (round(speed_kmh, 1) if speed_kmh is not None else None)

    # kept for backwards compatibility with older callers/tests
    def calculate_confidence(self, *a: Any, **k: Any) -> Tuple[float, Optional[float]]:
        return self.score(*a, **k)

    def _result(self, cp: CandidatePair, study_id: str, status: str, note: str) -> MatchResult:
        return MatchResult(
            id=f"match-{cp.entry_id}-{cp.exit_id}", study_id=study_id, plate_suffix=cp.plate_suffix,
            entry_observation_id=cp.entry_id, exit_observation_id=cp.exit_id,
            entry_point_code=cp.entry_point, exit_point_code=cp.exit_point,
            entry_timestamp=format_epoch_iso(cp.entry_time), exit_timestamp=format_epoch_iso(cp.exit_time),
            travel_time_seconds=round(cp.travel_time_sec, 1), estimated_speed_kmh=cp.estimated_speed_kmh,
            match_score=cp.match_score, match_status=status, vehicle_category=cp.category,
            candidate_ids=[cp.entry_id, cp.exit_id], notes=note,
        )

    def _pair(self, ent: Observation, ext: Observation, tt: float) -> CandidatePair:
        e, x = _norm_cat(ent.vehicle_category), _norm_cat(ext.vehicle_category)
        cat_match = e == x or e in GENERIC_CATEGORIES or x in GENERIC_CATEGORIES
        dist = self.get_route_distance(ent.point_code, ext.point_code)
        score, spd = self.score(tt, e, x, dist)
        return CandidatePair(
            entry_id=ent.id, exit_id=ext.id, plate_suffix=ent.plate_suffix,
            entry_point=ent.point_code, exit_point=ext.point_code,
            entry_time=ent.observation_timestamp, exit_time=ext.observation_timestamp,
            travel_time_sec=tt, match_score=score, category=_pick_category(e, x),
            category_match=cat_match, estimated_speed_kmh=spd,
        )

    def match_observations(self, observations: List[Observation],
                           reviews: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Pipeline: split entry/exit -> apply stored supervisor reviews -> per-suffix candidate pairs inside the
        feasible window -> unique 1:1 pairs are MATCHED, conflicts are AMBIGUOUS (never forced)."""
        entries = sorted((o for o in observations if o.point_type.strip().upper() == "ENTRY"),
                         key=lambda o: o.observation_timestamp)
        exits = sorted((o for o in observations if o.point_type.strip().upper() == "EXIT"),
                       key=lambda o: o.observation_timestamp)
        by_id: Dict[str, Observation] = {o.id: o for o in entries + exits}

        matched: List[MatchResult] = []
        taken: Set[str] = set()
        rejected: Set[Tuple[str, str]] = set()
        reviewed_count = rejected_count = 0

        for rv in reviews or []:
            ent, ext = by_id.get(str(rv.get("entry_id"))), by_id.get(str(rv.get("exit_id")))
            if ent is None or ext is None or ent.point_type.upper() != "ENTRY" or ext.point_type.upper() != "EXIT":
                continue
            decision = str(rv.get("decision", "")).upper()
            if decision == "REJECTED":
                rejected.add((ent.id, ext.id))
                rejected_count += 1
            elif decision == "REVIEWED":
                tt = ext.observation_timestamp - ent.observation_timestamp
                if tt <= 0 or ent.id in taken or ext.id in taken:
                    continue  # a decision that no longer makes sense (e.g. exit before entry) is ignored
                cp = self._pair(ent, ext, tt)
                matched.append(self._result(cp, ent.study_id, "REVIEWED",
                                            f"Confirmed by supervisor{': ' + rv['note'] if rv.get('note') else ''}"))
                taken.update((ent.id, ext.id))
                reviewed_count += 1

        ent_by_suffix: Dict[str, List[Observation]] = {}
        ext_by_suffix: Dict[str, List[Observation]] = {}
        for e in entries:
            if e.id not in taken:
                ent_by_suffix.setdefault(e.plate_suffix, []).append(e)
        for x in exits:
            if x.id not in taken:
                ext_by_suffix.setdefault(x.plate_suffix, []).append(x)

        ambiguous: List[Dict[str, Any]] = []
        amb_entry_ids: Set[str] = set()
        amb_exit_ids: Set[str] = set()

        for suffix in sorted(set(ent_by_suffix) | set(ext_by_suffix)):
            pairs: List[CandidatePair] = []
            for ent in ent_by_suffix.get(suffix, []):
                for ext in ext_by_suffix.get(suffix, []):
                    if (ent.id, ext.id) in rejected:
                        continue
                    tt = ext.observation_timestamp - ent.observation_timestamp
                    if not (self.min_travel_time_sec <= tt <= self.max_travel_time_sec):
                        continue
                    cp = self._pair(ent, ext, tt)
                    if self.strict_category_match and not cp.category_match:
                        continue
                    pairs.append(cp)
            if not pairs:
                continue
            ents = {cp.entry_id for cp in pairs}
            exts = {cp.exit_id for cp in pairs}
            if len(ents) == len(pairs) and len(exts) == len(pairs):  # every candidate is 1:1 -> unambiguous
                for cp in pairs:
                    sid = by_id[cp.entry_id].study_id
                    matched.append(self._result(cp, sid, "MATCHED", "Unique candidate inside the feasible travel-time window"))
                    taken.update((cp.entry_id, cp.exit_id))
            else:
                amb_entry_ids |= ents
                amb_exit_ids |= exts
                ambiguous.append({
                    "plate_suffix": suffix,
                    "status": "AMBIGUOUS",
                    "entries_count": len(ent_by_suffix.get(suffix, [])),
                    "exits_count": len(ext_by_suffix.get(suffix, [])),
                    "candidate_pairs": [
                        {"entry_id": cp.entry_id, "exit_id": cp.exit_id, "entry_point": cp.entry_point,
                         "exit_point": cp.exit_point, "entry_time": format_epoch_iso(cp.entry_time),
                         "exit_time": format_epoch_iso(cp.exit_time), "travel_time_sec": round(cp.travel_time_sec, 1),
                         "match_score": cp.match_score, "speed_kmh": cp.estimated_speed_kmh,
                         "vehicle_category": cp.category}
                        for cp in pairs
                    ],
                    "notes": f"{len(pairs)} candidate pairs for suffix {suffix}: the same observation has several possible partners.",
                })

        def brief(o: Observation) -> Dict[str, Any]:
            return {"id": o.id, "plate_suffix": o.plate_suffix, "point_code": o.point_code,
                    "timestamp": format_epoch_iso(o.observation_timestamp), "vehicle_category": o.vehicle_category}

        unmatched_entries = [e for e in entries if e.id not in taken and e.id not in amb_entry_ids]
        unmatched_exits = [x for x in exits if x.id not in taken and x.id not in amb_exit_ids]
        times = [m.travel_time_seconds for m in matched]
        rate = (len(matched) / len(entries) * 100.0) if entries else 0.0
        summary = {
            "total_observations": len(observations),
            "total_entries": len(entries),
            "total_exits": len(exits),
            "matched_journeys": len(matched),
            "reviewed_journeys": reviewed_count,
            "rejected_pairs": rejected_count,
            "ambiguous_cases": len(ambiguous),
            "ambiguous_entries": len(amb_entry_ids),
            "ambiguous_exits": len(amb_exit_ids),
            "unmatched_entries": len(unmatched_entries),
            "unmatched_exits": len(unmatched_exits),
            "matching_rate_percent": round(rate, 2),
            "mean_travel_time_sec": round(statistics.mean(times), 1) if times else 0.0,
            "median_travel_time_sec": round(statistics.median(times), 1) if times else 0.0,
            "method_note": METHOD_NOTE,
        }
        return {
            "summary": summary,
            "matches": [asdict(m) for m in matched],
            "ambiguous": ambiguous,
            "unmatched_entries": [brief(u) for u in unmatched_entries],
            "unmatched_exits": [brief(u) for u in unmatched_exits],
        }


class TrafficAnalytics:
    @staticmethod
    def calculate_od_matrix(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        origins = sorted({m["entry_point_code"] for m in matches})
        destinations = sorted({m["exit_point_code"] for m in matches})
        matrix = {o: {d: 0 for d in destinations} for o in origins}
        row_totals = {o: 0 for o in origins}
        col_totals = {d: 0 for d in destinations}
        grand = 0
        for m in matches:
            o, d = m["entry_point_code"], m["exit_point_code"]
            matrix[o][d] += 1
            row_totals[o] += 1
            col_totals[d] += 1
            grand += 1
        pct = {o: {d: (round(matrix[o][d] / grand * 100.0, 1) if grand else 0.0) for d in destinations} for o in origins}
        return {"origins": origins, "destinations": destinations, "counts": matrix, "percentages": pct,
                "row_totals": row_totals, "col_totals": col_totals, "grand_total": grand}

    @staticmethod
    def calculate_travel_time_stats(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        times = sorted(float(m["travel_time_seconds"]) for m in matches if "travel_time_seconds" in m)
        n = len(times)
        if n == 0:
            return {"count": 0, "mean": 0.0, "median": 0.0, "std_dev": 0.0, "min": 0.0, "max": 0.0,
                    "p15": 0.0, "p50": 0.0, "p85": 0.0, "p95": 0.0, "histogram": []}

        def pct(p: float) -> float:
            if n == 1:
                return times[0]
            k = (n - 1) * p / 100.0
            f, c = math.floor(k), math.ceil(k)
            return times[int(k)] if f == c else times[f] * (c - k) + times[c] * (k - f)

        lo, hi, bins = times[0], times[-1], 6
        width = max(1.0, (hi - lo) / bins)
        hist = []
        for i in range(bins):
            a, b = lo + i * width, lo + (i + 1) * width
            cnt = sum(1 for t in times if a <= t < b or (i == bins - 1 and t == hi))
            hist.append({"bin_start": round(a, 1), "bin_end": round(b, 1), "label": f"{int(a)}s - {int(b)}s", "count": cnt})
        med = statistics.median(times)
        return {"count": n, "mean": round(statistics.mean(times), 1), "median": round(med, 1),
                "std_dev": round(statistics.stdev(times), 1) if n > 1 else 0.0,
                "min": round(lo, 1), "max": round(hi, 1), "p15": round(pct(15), 1), "p50": round(med, 1),
                "p85": round(pct(85), 1), "p95": round(pct(95), 1), "histogram": hist}

    @staticmethod
    def calculate_vehicle_category_split(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        counts: Dict[str, int] = {}
        for m in matches:
            cat = m.get("vehicle_category") or "UNKNOWN"
            counts[cat] = counts.get(cat, 0) + 1
        total = len(matches)
        return {"total": total, "counts": counts,
                "percentages": {k: round(v / total * 100.0, 1) for k, v in counts.items()} if total else {}}

    @staticmethod
    def route_speeds(matches: List[Dict[str, Any]], route_distances: Dict[str, float]) -> List[Dict[str, Any]]:
        """Average journey speed per OD pair, only where the route distance is configured (never guessed)."""
        groups: Dict[str, List[float]] = {}
        for m in matches:
            groups.setdefault(f"{m['entry_point_code']}->{m['exit_point_code']}", []).append(float(m["travel_time_seconds"]))
        out = []
        for key, ts in sorted(groups.items()):
            dist = route_distances.get(key)
            if not dist or dist <= 0:
                continue
            mean_t = statistics.mean(ts)
            out.append({"route": key, "distance_m": float(dist), "journeys": len(ts), "mean_travel_time_sec": round(mean_t, 1),
                        "mean_journey_speed_kmh": round(dist / mean_t * 3.6, 1) if mean_t > 0 else None})
        return out

    @staticmethod
    def counts(observations: List[Observation], interval_minutes: int = 15) -> Dict[str, Any]:
        """Entry/exit totals, by point, by category and by time interval (bins are UTC-aligned; the UI shows them in
        the study time zone)."""
        step = max(1, int(interval_minutes)) * 60
        entries = sum(1 for o in observations if o.point_type.upper() == "ENTRY")
        exits = sum(1 for o in observations if o.point_type.upper() == "EXIT")
        by_point: Dict[str, int] = {}
        by_cat: Dict[str, int] = {}
        bins: Dict[int, Dict[str, int]] = {}
        for o in observations:
            by_point[o.point_code] = by_point.get(o.point_code, 0) + 1
            cat = _norm_cat(o.vehicle_category) or "UNKNOWN"
            by_cat[cat] = by_cat.get(cat, 0) + 1
            b = int(o.observation_timestamp // step) * step
            slot = bins.setdefault(b, {"entries": 0, "exits": 0})
            slot["entries" if o.point_type.upper() == "ENTRY" else "exits"] += 1
        total = len(observations)
        return {
            "interval_minutes": step // 60, "total": total, "entries": entries, "exits": exits,
            "by_point": dict(sorted(by_point.items())),
            "by_category": dict(sorted(by_cat.items())),
            "category_percent": {k: round(v / total * 100.0, 1) for k, v in sorted(by_cat.items())} if total else {},
            "by_interval": [{"start": format_epoch_iso(b), **v, "total": v["entries"] + v["exits"]} for b, v in sorted(bins.items())],
        }


def _safe_cell(value: Any) -> Any:
    """Neutralise spreadsheet formula injection: text starting with = + - @ tab or CR is prefixed with '."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


class ReportExporter:
    @staticmethod
    def export_csv(matches: List[Dict[str, Any]], od_matrix: Dict[str, Any],
                   ambiguous: Optional[List[Dict[str, Any]]] = None) -> str:
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(["# TrafficLab matched journeys (probable matches; match_score is a heuristic, not a probability)"])
        w.writerow(["match_id", "plate_suffix", "entry_point", "exit_point", "entry_time_utc", "exit_time_utc",
                    "travel_time_sec", "avg_journey_speed_kmh", "match_score", "vehicle_category", "status"])
        for m in matches:
            w.writerow([_safe_cell(v) for v in (
                m.get("id"), m.get("plate_suffix"), m.get("entry_point_code"), m.get("exit_point_code"),
                m.get("entry_timestamp"), m.get("exit_timestamp"), m.get("travel_time_seconds"),
                m.get("estimated_speed_kmh") if m.get("estimated_speed_kmh") is not None else "",
                m.get("match_score"), m.get("vehicle_category"), m.get("match_status"))])
        w.writerow([])
        w.writerow(["# Ambiguous cases (not matched, need supervisor review)"])
        w.writerow(["plate_suffix", "entry_point", "exit_point", "entry_time_utc", "exit_time_utc", "travel_time_sec", "match_score"])
        for case in ambiguous or []:
            for cp in case.get("candidate_pairs", []):
                w.writerow([_safe_cell(v) for v in (case.get("plate_suffix"), cp.get("entry_point"), cp.get("exit_point"),
                                                    cp.get("entry_time"), cp.get("exit_time"), cp.get("travel_time_sec"), cp.get("match_score"))])
        w.writerow([])
        w.writerow(["# Origin-Destination matrix (counts of matched + reviewed journeys)"])
        dests = od_matrix.get("destinations", [])
        w.writerow(["origin", *[_safe_cell(d) for d in dests], "total"])
        for o in od_matrix.get("origins", []):
            w.writerow([_safe_cell(o), *[od_matrix["counts"][o].get(d, 0) for d in dests], od_matrix["row_totals"].get(o, 0)])
        w.writerow(["total", *[od_matrix["col_totals"].get(d, 0) for d in dests], od_matrix.get("grand_total", 0)])
        return buf.getvalue()


def _observations_from_payload(raw: List[Dict[str, Any]]) -> List[Observation]:
    out = []
    for o in raw:
        out.append(Observation(
            id=str(o["id"]), study_id=str(o.get("study_id", "")), point_code=str(o["point_code"]),
            point_type=str(o["point_type"]).upper(), plate_suffix=str(o["plate_suffix"]).zfill(3),
            observation_timestamp=parse_iso_or_epoch(o["observation_timestamp"]),
            vehicle_category=str(o.get("vehicle_category") or "UNKNOWN"), vehicle_color=o.get("vehicle_color"),
            observer_id=o.get("observer_id")))
    return out


def apply_filters(obs: List[Observation], filters: Optional[Dict[str, Any]]) -> List[Observation]:
    """Optional filters (spec 10B): time window [from, to], vehicle categories, observation points.
    Note: filtering by point removes the counterpart observations too; this is documented in the UI."""
    if not filters:
        return obs
    t_from = parse_iso_or_epoch(filters["from"]) if filters.get("from") else None
    t_to = parse_iso_or_epoch(filters["to"]) if filters.get("to") else None
    cats = {_norm_cat(c) for c in filters.get("categories") or []}
    pts = {str(p) for p in filters.get("points") or []}
    keep = []
    for o in obs:
        if t_from is not None and o.observation_timestamp < t_from:
            continue
        if t_to is not None and o.observation_timestamp > t_to:
            continue
        if cats and _norm_cat(o.vehicle_category) not in cats:
            continue
        if pts and o.point_code not in pts:
            continue
        keep.append(o)
    return keep


def build_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    obs = apply_filters(_observations_from_payload(payload.get("observations", [])), payload.get("filters"))
    routes = payload.get("route_distances", {}) or {}
    matcher = PartialPlateMatcher(
        min_travel_time_sec=payload.get("min_travel_time_sec", 30.0),
        max_travel_time_sec=payload.get("max_travel_time_sec", 900.0),
        strict_category_match=payload.get("strict_category_match", False),
        route_distances=routes)
    result = matcher.match_observations(obs, payload.get("reviews"))
    ms = result["matches"]
    result["analytics"] = {
        "od_matrix": TrafficAnalytics.calculate_od_matrix(ms),
        "travel_time_stats": TrafficAnalytics.calculate_travel_time_stats(ms),
        "vehicle_category_split": TrafficAnalytics.calculate_vehicle_category_split(ms),
        "route_speeds": TrafficAnalytics.route_speeds(ms, routes),
        "counts": TrafficAnalytics.counts(obs, int(payload.get("interval_minutes", 15))),
    }
    return result


def run_cli() -> None:
    """CLI used by the Node server: `python trafficlab_engine.py <report|export_csv|match|analytics>`, JSON on stdin."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)
    action = sys.argv[1].lower()
    raw = sys.stdin.buffer.read().decode("utf-8").strip()
    if not raw:
        print(json.dumps({"error": "Empty input payload"}))
        sys.exit(1)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON payload: {exc}"}))
        sys.exit(1)
    try:
        if action == "report":
            out = build_report(payload)
        elif action == "match":
            obs = apply_filters(_observations_from_payload(payload.get("observations", [])), payload.get("filters"))
            out = PartialPlateMatcher(
                payload.get("min_travel_time_sec", 30.0), payload.get("max_travel_time_sec", 900.0),
                payload.get("strict_category_match", False), payload.get("route_distances", {})
            ).match_observations(obs, payload.get("reviews"))
        elif action == "analytics":
            ms = payload.get("matches", [])
            out = {"od_matrix": TrafficAnalytics.calculate_od_matrix(ms),
                   "travel_time_stats": TrafficAnalytics.calculate_travel_time_stats(ms),
                   "vehicle_category_split": TrafficAnalytics.calculate_vehicle_category_split(ms)}
        elif action == "export_csv":
            rep = build_report(payload)
            out = {"csv": ReportExporter.export_csv(rep["matches"], rep["analytics"]["od_matrix"], rep["ambiguous"])}
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))
            sys.exit(1)
    except (KeyError, ValueError, TypeError) as exc:
        print(json.dumps({"error": f"Invalid input: {exc}"}))
        sys.exit(2)
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    run_cli()
