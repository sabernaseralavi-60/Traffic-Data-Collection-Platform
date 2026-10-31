import React, { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, GitCompare, Play, Search } from 'lucide-react';
import { api, download, errorText } from '../api';
import { AmbiguousPair, Category, Report, Study } from '../types';
import { Language, getT, pick } from '../i18n';
import { fmtDuration, fmtTime, zonedToUtcIso } from '../utils/time';

interface Props {
  study: Study | null;
  lang: Language;
  categories: Category[];
  initial: Report | null;
  onReport: (r: Report) => void;
}

export const MatchingView: React.FC<Props> = ({ study, lang, categories, initial, onReport }) => {
  const t = getT(lang);
  const [minT, setMinT] = useState(30);
  const [maxT, setMaxT] = useState(900);
  const [strict, setStrict] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);
  if (!study) return null;
  const tz = study.timezone;

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const filters = { from: from ? zonedToUtcIso(from, tz) : undefined, to: to ? zonedToUtcIso(to, tz) : undefined, categories: cats.length ? cats : undefined };
      const r = await api<Report>('POST', `/studies/${study.id}/match`, { min_travel_time_sec: minT, max_travel_time_sec: maxT, strict_category_match: strict, filters });
      setReport(r); onReport(r);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const review = async (p: AmbiguousPair, decision: 'REVIEWED' | 'REJECTED' | 'CLEAR') => {
    try {
      await api('POST', `/studies/${study.id}/reviews`, { entry_observation_id: p.entry_id, exit_observation_id: p.exit_id, decision });
      await run();
    } catch (e) { setError(errorText(e)); }
  };
  const undoReview = async (entry: string, exit: string) => {
    try { await api('POST', `/studies/${study.id}/reviews`, { entry_observation_id: entry, exit_observation_id: exit, decision: 'CLEAR' }); await run(); } catch (e) { setError(errorText(e)); }
  };

  const s = report?.summary;
  const matches = (report?.matches ?? []).filter((m) => !search || m.plate_suffix.includes(search));
  const label = (c: Category) => (lang === 'fa' ? c.label_fa : c.label_en);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-testid="matching-view">
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><GitCompare className="w-5 h-5 text-teal-400" />{t.matching_title}</h2>
            <p className="text-xs text-slate-400 mt-1">{t.matching_subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={run} disabled={busy} data-testid="run-matching" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950">
              <Play className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />{busy ? t.matching_in_progress : t.run_matching}
            </button>
            <button onClick={() => download(`/studies/${study.id}/export.csv?min=${minT}&max=${maxT}&strict=${strict ? 1 : 0}`)} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200"><FileSpreadsheet className="w-4 h-4 text-emerald-400" />{t.export_csv}</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
          <label className="block"><span className="flex justify-between text-slate-300 font-semibold mb-1"><span>{t.min_travel_time}</span><span className="font-mono text-teal-400">{minT}s</span></span><input type="range" min={10} max={300} step={5} value={minT} onChange={(e) => setMinT(Number(e.target.value))} className="w-full accent-teal-400" /></label>
          <label className="block"><span className="flex justify-between text-slate-300 font-semibold mb-1"><span>{t.max_travel_time}</span><span className="font-mono text-teal-400">{maxT}s</span></span><input type="range" min={300} max={2400} step={30} value={maxT} onChange={(e) => setMaxT(Number(e.target.value))} className="w-full accent-teal-400" /></label>
          <label className="flex items-center gap-2 text-slate-300 select-none"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="w-4 h-4" />{t.strict_category}</label>
          <label className="block"><span className="text-slate-400">{pick(lang, `From (${tz})`, `از (${tz})`)}</span><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" /></label>
          <label className="block"><span className="text-slate-400">{pick(lang, `To (${tz})`, `تا (${tz})`)}</span><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" /></label>
          <fieldset className="flex flex-wrap gap-1.5 items-start"><legend className="text-slate-400 mb-1">{pick(lang, 'Only these categories', 'فقط این دسته‌ها')}</legend>
            {categories.map((c) => <button key={c.code} type="button" aria-pressed={cats.includes(c.code)} onClick={() => setCats((p) => (p.includes(c.code) ? p.filter((x) => x !== c.code) : [...p, c.code]))} className={`px-2 py-0.5 rounded-md border ${cats.includes(c.code) ? 'bg-teal-500 text-slate-950 border-teal-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{label(c)}</button>)}
          </fieldset>
        </div>
        {error && <p role="alert" className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-2.5">{error}</p>}
      </div>

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="match-summary">
          {[
            [t.stat_matched, s.matched_journeys, 'text-emerald-400', `${pick(lang, 'of', 'از')} ${s.total_entries} ${pick(lang, 'entries', 'ورودی')}`],
            [t.stat_matching_rate, `${s.matching_rate_percent}%`, 'text-teal-300', pick(lang, 'probable, not certain', 'محتمل، نه قطعی')],
            [t.stat_ambiguous, s.ambiguous_cases, 'text-amber-400', pick(lang, 'need review', 'نیازمند بررسی')],
            [t.stat_mean_tt, s.matched_journeys ? fmtDuration(s.mean_travel_time_sec) : '-', 'text-white', ''],
            [t.stat_median_tt, s.matched_journeys ? fmtDuration(s.median_travel_time_sec) : '-', 'text-white', ''],
            [t.stat_unmatched_entries, s.unmatched_entries, 'text-rose-400', `${pick(lang, 'exits without entry', 'خروجی بدون ورود')}: ${s.unmatched_exits}`],
          ].map(([k, v, c, h]) => <div key={String(k)} className="p-4 rounded-2xl bg-slate-900 border border-slate-800"><p className="text-[11px] text-slate-400 uppercase font-semibold">{k}</p><p className={`text-2xl font-black font-mono mt-1 ${c}`}>{v}</p><p className="text-[10px] text-slate-500 mt-0.5">{h}</p></div>)}
        </div>
      )}

      {report && report.ambiguous.length > 0 && (
        <div className="bg-amber-950/40 rounded-3xl p-6 border-2 border-amber-600/50 space-y-4" data-testid="ambiguous-box">
          <div className="flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-amber-400" /><div><h3 className="text-sm font-black text-amber-300 uppercase">{t.ambiguous_banner} ({report.ambiguous.length})</h3><p className="text-xs text-amber-200/80">{t.ambiguous_desc}</p></div></div>
          {report.ambiguous.map((ac) => (
            <div key={ac.plate_suffix} className="bg-slate-900/90 rounded-2xl p-4 border border-amber-500/30 space-y-2" data-testid={`ambiguous-${ac.plate_suffix}`}>
              <div className="flex items-center gap-2"><span className="font-mono text-lg font-black bg-amber-500/20 text-amber-300 px-3 py-0.5 rounded-lg">#{ac.plate_suffix}</span><span className="text-xs text-slate-400">{ac.entries_count} {pick(lang, 'entries vs', 'ورودی در برابر')} {ac.exits_count} {pick(lang, 'exits', 'خروجی')}</span></div>
              <div className="overflow-x-auto"><table className="w-full text-xs text-start"><thead><tr className="text-slate-400 border-b border-slate-800"><th className="py-1.5 px-2 text-start">{t.table_origin}</th><th className="px-2 text-start">{t.table_destination}</th><th className="px-2 text-start">{t.table_entry_time}</th><th className="px-2 text-start">{t.table_exit_time}</th><th className="px-2 text-start">{t.table_travel_time}</th><th className="px-2 text-start">{t.table_speed}</th><th className="px-2 text-start">{t.table_confidence}</th><th /></tr></thead>
                <tbody className="font-mono divide-y divide-slate-800/60">{ac.candidate_pairs.map((cp) => (
                  <tr key={cp.entry_id + cp.exit_id}>
                    <td className="py-2 px-2 text-emerald-400 font-bold">{cp.entry_point}</td><td className="px-2 text-indigo-400 font-bold">{cp.exit_point}</td>
                    <td className="px-2">{fmtTime(cp.entry_time, tz)}</td><td className="px-2">{fmtTime(cp.exit_time, tz)}</td><td className="px-2 font-bold text-white">{fmtDuration(cp.travel_time_sec)}</td>
                    <td className="px-2 text-teal-300">{cp.speed_kmh ? `${cp.speed_kmh} km/h` : 'N/A'}</td><td className="px-2">{cp.match_score}</td>
                    <td className="px-2 text-end whitespace-nowrap">
                      <button onClick={() => review(cp, 'REVIEWED')} data-testid="confirm-pair" className="px-3 py-1 rounded-lg bg-teal-500 text-slate-950 font-bold text-[11px] me-1">{t.resolve_candidate}</button>
                      <button onClick={() => review(cp, 'REJECTED')} data-testid="reject-pair" className="px-3 py-1 rounded-lg bg-slate-700 text-slate-100 font-bold text-[11px]">{pick(lang, 'Reject', 'رد')}</button>
                    </td>
                  </tr>))}</tbody></table></div>
            </div>
          ))}
        </div>
      )}

      {report && (
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-base font-bold text-white">{t.matched_table_title} <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono">{matches.length}</span></h3>
            <div className="relative"><Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={pick(lang, 'Filter suffix…', 'فیلتر پلاک…')} className="ps-8 pe-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white w-40" /></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs text-start" data-testid="matches-table"><thead><tr className="text-slate-400 border-b border-slate-800">{[t.table_suffix, t.table_origin, t.table_destination, t.table_entry_time, t.table_exit_time, t.table_travel_time, t.table_speed, t.table_confidence, t.table_category, t.table_status].map((h) => <th key={h} className="py-2.5 px-3 text-start">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">{matches.map((m) => (
              <tr key={m.id}>
                <td className="py-2.5 px-3"><span className="font-extrabold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{m.plate_suffix}</span></td>
                <td className="px-3 text-emerald-400 font-bold">{m.entry_point_code}</td><td className="px-3 text-indigo-400 font-bold">{m.exit_point_code}</td>
                <td className="px-3">{fmtTime(m.entry_timestamp, tz)}</td><td className="px-3">{fmtTime(m.exit_timestamp, tz)}</td><td className="px-3 font-bold text-white">{fmtDuration(m.travel_time_seconds)}</td>
                <td className="px-3 text-teal-300">{m.estimated_speed_kmh ? `${m.estimated_speed_kmh} km/h` : 'N/A'}</td><td className="px-3">{m.match_score}</td><td className="px-3">{m.vehicle_category}</td>
                <td className="px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${m.match_status === 'REVIEWED' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{m.match_status}</span>
                  {m.match_status === 'REVIEWED' && <button onClick={() => undoReview(m.entry_observation_id, m.exit_observation_id)} className="ms-2 text-[10px] text-slate-400 underline">{pick(lang, 'undo', 'لغو')}</button>}</td>
              </tr>))}</tbody></table></div>
          <p className="text-[11px] text-slate-500">* {pick(lang, 'Match score is a heuristic ranking (5-95) from the suffix, category agreement and plausible speed/time. It is not a probability that the match is correct.', 'امتیاز تطبیق یک رتبه‌بندی ابتکاری (۵ تا ۹۵) بر پایهٔ ۳ رقم پلاک، هم‌خوانی نوع خودرو و سرعت/زمان معقول است؛ احتمال درستی تطبیق نیست.')}</p>
          <button type="button" onClick={() => setShowUnmatched((v) => !v)} className="text-xs text-slate-300 underline">{showUnmatched ? pick(lang, 'Hide', 'پنهان') : pick(lang, 'Show', 'نمایش')} {pick(lang, 'unmatched observations', 'مشاهدات بدون جفت')} ({report.unmatched_entries.length + report.unmatched_exits.length})</button>
          {showUnmatched && (
            <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
              {([['ENTRY', report.unmatched_entries], ['EXIT', report.unmatched_exits]] as const).map(([k, list]) => (
                <div key={k}><p className="text-slate-400 mb-1">{k}</p><ul className="space-y-1">{list.map((u) => <li key={u.id} className="flex justify-between bg-slate-950 rounded px-2 py-1"><span>{u.plate_suffix} @ {u.point_code}</span><span className="text-slate-500">{fmtTime(u.timestamp, tz)}</span></li>)}</ul></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
