import React, { useState } from 'react';
import {
  GitCompare,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Sliders,
  Filter,
  Search,
  Check,
  HelpCircle,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { Study, MatchResult, AmbiguousCase, MatchingSummary } from '../types';
import { Language, getT } from '../i18n';

interface MatchingViewProps {
  study: Study | null;
  lang: Language;
  onMatchesComputed?: (data: any) => void;
  onExportReport?: () => void;
}

export const MatchingView: React.FC<MatchingViewProps> = ({
  study,
  lang,
  onMatchesComputed,
  onExportReport,
}) => {
  const t = getT(lang);

  const [minTravelTime, setMinTravelTime] = useState<number>(30);
  const [maxTravelTime, setMaxTravelTime] = useState<number>(900);
  const [strictCategory, setStrictCategory] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const [summary, setSummary] = useState<MatchingSummary | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [ambiguousCases, setAmbiguousCases] = useState<AmbiguousCase[]>([]);
  const [searchSuffix, setSearchSuffix] = useState<string>('');
  const [filterOrigin, setFilterOrigin] = useState<string>('ALL');

  const executeMatching = async () => {
    if (!study) return;
    setIsRunning(true);
    try {
      const res = await fetch(`/api/v1/studies/${study.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_travel_time_sec: minTravelTime,
          max_travel_time_sec: maxTravelTime,
          strict_category_match: strictCategory,
        }),
      });

      if (!res.ok) throw new Error('Matching API error');
      const data = await res.json();
      setSummary(data.summary);
      setMatches(data.matches || []);
      setAmbiguousCases(data.ambiguous || []);
      if (onMatchesComputed) onMatchesComputed(data);
    } catch (err) {
      console.error('Failed to run matching:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Run on mount once
  React.useEffect(() => {
    executeMatching();
  }, [study?.id]);

  // Ambiguity manual resolution
  const handleResolveCandidate = (plateSuffix: string, candidatePair: any) => {
    const resolvedMatch: MatchResult = {
      id: `match-resolved-${candidatePair.entry_id}-${candidatePair.exit_id}`,
      study_id: study?.id || 'study-01',
      plate_suffix: plateSuffix,
      entry_observation_id: candidatePair.entry_id,
      exit_observation_id: candidatePair.exit_id,
      entry_point_code: candidatePair.entry_point,
      exit_point_code: candidatePair.exit_point,
      entry_timestamp: candidatePair.entry_time,
      exit_timestamp: candidatePair.exit_time,
      travel_time_seconds: candidatePair.travel_time_sec,
      estimated_speed_kmh: candidatePair.speed_kmh,
      confidence_score: candidatePair.confidence_score,
      match_status: 'REVIEWED',
      vehicle_category: 'CAR',
      notes: 'Manually verified and approved by survey supervisor',
    };

    setMatches((prev) => [resolvedMatch, ...prev]);
    setAmbiguousCases((prev) => prev.filter((c) => c.plate_suffix !== plateSuffix));
  };

  const filteredMatches = matches.filter((m) => {
    const matchesSearch = !searchSuffix || m.plate_suffix.includes(searchSuffix);
    const matchesOrigin = filterOrigin === 'ALL' || m.entry_point_code === filterOrigin;
    return matchesSearch && matchesOrigin;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Matching Controls */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-teal-400" />
              <span>{t.matching_title}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">{t.matching_subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={executeMatching}
              disabled={isRunning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              <Play className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? t.matching_in_progress : t.run_matching}</span>
            </button>

            {onExportReport && (
              <button
                onClick={onExportReport}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>{t.export_csv}</span>
              </button>
            )}
          </div>
        </div>

        {/* Algorithm Parameters Drawer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs">
          <div>
            <div className="flex justify-between text-slate-300 font-semibold mb-1">
              <span>{t.min_travel_time}</span>
              <span className="font-mono text-teal-400">{minTravelTime}s</span>
            </div>
            <input
              type="range"
              min="10"
              max="300"
              step="5"
              value={minTravelTime}
              onChange={(e) => setMinTravelTime(Number(e.target.value))}
              className="w-full accent-teal-400"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 font-semibold mb-1">
              <span>{t.max_travel_time}</span>
              <span className="font-mono text-teal-400">{maxTravelTime}s ({(maxTravelTime / 60).toFixed(1)}m)</span>
            </div>
            <input
              type="range"
              min="300"
              max="2400"
              step="30"
              value={maxTravelTime}
              onChange={(e) => setMaxTravelTime(Number(e.target.value))}
              className="w-full accent-teal-400"
            />
          </div>

          <div className="flex items-center gap-3 md:justify-end">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={strictCategory}
                onChange={(e) => setStrictCategory(e.target.checked)}
                className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400 focus:ring-offset-slate-900 bg-slate-950 border-slate-700"
              />
              <span className="font-medium">{t.strict_category}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Analytics Summary Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_matched}</p>
            <p className="text-2xl font-black font-mono text-emerald-400 mt-1">{summary.matched_journeys}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">of {summary.total_entries} entries</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_matching_rate}</p>
            <p className="text-2xl font-black font-mono text-teal-300 mt-1">{summary.matching_rate_percent}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Partial 3-digit</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_ambiguous}</p>
            <p className="text-2xl font-black font-mono text-amber-400 mt-1">{summary.ambiguous_cases}</p>
            <p className="text-[10px] text-amber-500/80 mt-0.5">Needs review</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_mean_tt}</p>
            <p className="text-2xl font-black font-mono text-white mt-1">{summary.mean_travel_time_sec}s</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{(summary.mean_travel_time_sec / 60).toFixed(1)} mins</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_median_tt}</p>
            <p className="text-2xl font-black font-mono text-white mt-1">{summary.median_travel_time_sec}s</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Median (P50)</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
            <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.stat_unmatched_entries}</p>
            <p className="text-2xl font-black font-mono text-rose-400 mt-1">{summary.unmatched_entries}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Exits unobserved: {summary.unmatched_exits}</p>
          </div>
        </div>
      )}

      {/* Ambiguous Cases Review Inspector */}
      {ambiguousCases.length > 0 && (
        <div className="bg-amber-950/40 rounded-3xl p-6 border-2 border-amber-600/50 shadow-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-300 uppercase tracking-wide">
                {t.ambiguous_banner} ({ambiguousCases.length})
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5">{t.ambiguous_desc}</p>
            </div>
          </div>

          <div className="space-y-4">
            {ambiguousCases.map((ac) => (
              <div
                key={ac.plate_suffix}
                className="bg-slate-900/90 rounded-2xl p-4 border border-amber-500/30 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-black bg-amber-500/20 text-amber-300 px-3 py-0.5 rounded-lg border border-amber-500/40">
                      Suffix #{ac.plate_suffix}
                    </span>
                    <span className="text-xs text-slate-400">
                      {ac.entries_count} entries vs {ac.exits_count} exits detected
                    </span>
                  </div>
                </div>

                {/* Candidate Options Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="py-1.5 px-3">Origin</th>
                        <th className="py-1.5 px-3">Destination</th>
                        <th className="py-1.5 px-3">Entry Time</th>
                        <th className="py-1.5 px-3">Exit Time</th>
                        <th className="py-1.5 px-3">Travel Time</th>
                        <th className="py-1.5 px-3">Speed</th>
                        <th className="py-1.5 px-3">Confidence</th>
                        <th className="py-1.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {ac.candidate_pairs.map((cp, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-emerald-400 font-bold">{cp.entry_point}</td>
                          <td className="py-2 px-3 text-indigo-400 font-bold">{cp.exit_point}</td>
                          <td className="py-2 px-3 text-slate-300">
                            {new Date(cp.entry_time).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {new Date(cp.exit_time).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 text-white font-bold">{cp.travel_time_sec}s</td>
                          <td className="py-2 px-3 text-teal-300">
                            {cp.speed_kmh ? `${cp.speed_kmh} km/h` : 'N/A'}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold">
                              {cp.confidence_score}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleResolveCandidate(ac.plate_suffix, cp)}
                              className="px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] transition"
                            >
                              {t.resolve_candidate}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched Records Table */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>{t.matched_table_title}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono">
              {filteredMatches.length} journeys
            </span>
          </h3>

          {/* Table Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filter suffix..."
                value={searchSuffix}
                onChange={(e) => setSearchSuffix(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400"
              />
            </div>

            <select
              value={filterOrigin}
              onChange={(e) => setFilterOrigin(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-teal-400"
            >
              <option value="ALL">All Origins</option>
              {study?.points.filter((p) => p.point_type === 'ENTRY').map((p) => (
                <option key={p.code} value={p.code}>{p.code}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                <th className="py-2.5 px-3">{t.table_suffix}</th>
                <th className="py-2.5 px-3">{t.table_origin}</th>
                <th className="py-2.5 px-3">{t.table_destination}</th>
                <th className="py-2.5 px-3">{t.table_entry_time}</th>
                <th className="py-2.5 px-3">{t.table_exit_time}</th>
                <th className="py-2.5 px-3">{t.table_travel_time}</th>
                <th className="py-2.5 px-3">{t.table_speed}</th>
                <th className="py-2.5 px-3">{t.table_confidence}</th>
                <th className="py-2.5 px-3">{t.table_category}</th>
                <th className="py-2.5 px-3">{t.table_status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredMatches.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-3">
                    <span className="font-extrabold text-white text-sm bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      {m.plate_suffix}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">{m.entry_point_code}</td>
                  <td className="py-2.5 px-3 text-indigo-400 font-bold">{m.exit_point_code}</td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {new Date(m.entry_timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {new Date(m.exit_timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 text-white font-bold">
                    {m.travel_time_seconds}s
                    <span className="text-[10px] text-slate-500 ml-1">
                      ({(m.travel_time_seconds / 60).toFixed(1)}m)
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-teal-300 font-bold">
                    {m.estimated_speed_kmh ? `${m.estimated_speed_kmh} km/h` : 'N/A'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        m.confidence_score >= 85
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : m.confidence_score >= 60
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {m.confidence_score}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{m.vehicle_category}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        m.match_status === 'REVIEWED'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {m.match_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
