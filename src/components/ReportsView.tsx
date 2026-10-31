import React from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { download } from '../api';
import { Report, Study } from '../types';
import { Language, getT, pick } from '../i18n';
import { fmtDuration } from '../utils/time';

interface Props { study: Study | null; lang: Language; report: Report | null }

/** Printable report: every number comes from the matching engine's result for the stored observations. */
export const ReportsView: React.FC<Props> = ({ study, lang, report }) => {
  const t = getT(lang);
  if (!study) return null;
  const s = report?.summary;
  const od = report?.analytics.od_matrix;
  const st = report?.analytics.travel_time_stats;
  const generated = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-teal-400" />{t.nav_reports}</h2>
          <p className="text-xs text-slate-400 mt-1">{pick(lang, 'Reports are generated from the stored, validated records. PDF = your browser\'s "Save as PDF" of the report below.', 'گزارش‌ها از رکوردهای ذخیره‌شده و اعتبارسنجی‌شده ساخته می‌شوند. PDF = «ذخیره به‌صورت PDF» مرورگر برای گزارش زیر.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => download(`/studies/${study.id}/export.xlsx`)} data-testid="export-xlsx" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"><Download className="w-4 h-4" />Excel (.xlsx)</button>
          <button onClick={() => download(`/studies/${study.id}/export.csv`)} data-testid="export-csv" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200"><Printer className="w-4 h-4 text-teal-400" />{pick(lang, 'Print / PDF', 'چاپ / PDF')}</button>
        </div>
      </div>

      <article className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 border border-slate-200 space-y-7" data-testid="report-article">
        <header className="border-b-2 border-slate-900 pb-5 space-y-1">
          {study.is_demo && <p className="text-xs font-black text-fuchsia-700">DEMO — {pick(lang, 'synthetic data, not real observations', 'داده‌های ساختگی، نه مشاهدات واقعی')}</p>}
          <h1 className="text-2xl font-black">{study.name}</h1>
          <p className="text-xs text-slate-600 font-mono">{study.study_date} • {study.start_time}-{study.end_time} • {study.timezone} • {pick(lang, 'Supervisor', 'سرپرست')}: {study.supervisor_name || '-'} • {pick(lang, 'Generated', 'تهیه')}: {generated}</p>
          <p className="text-xs text-slate-600">{pick(lang, 'Method: partial (3-digit) plate-suffix matching with a feasible travel-time window. Results are probable journeys; the score is a heuristic, not a probability.', 'روش: انطباق ۳ رقم انتهای پلاک با بازهٔ زمان سفر مجاز. نتایج، سفرهای محتمل‌اند؛ امتیاز ابتکاری است، نه احتمال.')}</p>
        </header>

        {!report || !s || !od || !st ? <p className="text-sm text-slate-500">{pick(lang, 'No results yet.', 'هنوز نتیجه‌ای نیست.')}</p> : (
          <>
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 text-sm">
              {[
                [pick(lang, 'Observations', 'مشاهدات'), s.total_observations], [pick(lang, 'Entries / exits', 'ورودی / خروجی'), `${s.total_entries} / ${s.total_exits}`],
                [pick(lang, 'Matched journeys', 'سفرهای منطبق'), s.matched_journeys], [pick(lang, 'Match rate (of entries)', 'نرخ انطباق (از ورودی‌ها)'), `${s.matching_rate_percent}%`],
                [pick(lang, 'Ambiguous cases', 'موارد مبهم'), s.ambiguous_cases], [pick(lang, 'Unmatched entries / exits', 'ورودی / خروجی بدون جفت'), `${s.unmatched_entries} / ${s.unmatched_exits}`],
                [pick(lang, 'Mean travel time', 'میانگین زمان سفر'), s.matched_journeys ? fmtDuration(s.mean_travel_time_sec) : '-'], [pick(lang, 'Supervisor-confirmed', 'تأییدشدهٔ سرپرست'), s.reviewed_journeys],
              ].map(([k, v]) => <div key={String(k)}><p className="text-[11px] font-bold uppercase text-slate-500">{k}</p><p className="text-xl font-black font-mono">{v}</p></div>)}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-black uppercase tracking-wider">{pick(lang, 'Table 1: Origin–Destination matrix (journeys)', 'جدول ۱: ماتریس مبدا-مقصد (سفر)')}</h2>
              {od.origins.length === 0 ? <p className="text-xs text-slate-500">-</p> : (
                <table className="w-full text-center border-collapse border border-slate-300 text-xs">
                  <thead><tr className="bg-slate-100"><th className="border border-slate-300 p-2">O \ D</th>{od.destinations.map((d) => <th key={d} className="border border-slate-300 p-2 font-mono">{d}</th>)}<th className="border border-slate-300 p-2">{pick(lang, 'Total', 'جمع')}</th></tr></thead>
                  <tbody>
                    {od.origins.map((o) => <tr key={o}><td className="border border-slate-300 p-2 font-mono font-bold bg-slate-50">{o}</td>{od.destinations.map((d) => <td key={d} className="border border-slate-300 p-2 font-mono">{od.counts[o][d]}</td>)}<td className="border border-slate-300 p-2 font-mono font-bold">{od.row_totals[o]}</td></tr>)}
                    <tr className="bg-slate-100"><td className="border border-slate-300 p-2 font-bold">{pick(lang, 'Total', 'جمع')}</td>{od.destinations.map((d) => <td key={d} className="border border-slate-300 p-2 font-mono font-bold">{od.col_totals[d]}</td>)}<td className="border border-slate-300 p-2 font-mono font-black">{od.grand_total}</td></tr>
                  </tbody>
                </table>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-black uppercase tracking-wider">{pick(lang, 'Table 2: Travel time statistics (seconds)', 'جدول ۲: آمار زمان سفر (ثانیه)')}</h2>
              {st.count === 0 ? <p className="text-xs text-slate-500">-</p> : (
                <table className="w-full text-center border-collapse border border-slate-300 text-xs">
                  <thead><tr className="bg-slate-100">{['n', 'Mean', 'Median', 'Std dev', 'Min', 'Max', 'P15', 'P85', 'P95'].map((h) => <th key={h} className="border border-slate-300 p-2">{h}</th>)}</tr></thead>
                  <tbody><tr className="font-mono">{[st.count, st.mean, st.median, st.std_dev, st.min, st.max, st.p15, st.p85, st.p95].map((v, i) => <td key={i} className="border border-slate-300 p-2">{v}</td>)}</tr></tbody>
                </table>
              )}
            </section>

            {report.analytics.route_speeds.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-black uppercase tracking-wider">{pick(lang, 'Table 3: Average journey speed by route', 'جدول ۳: سرعت متوسط سیر به تفکیک مسیر')}</h2>
                <table className="w-full text-center border-collapse border border-slate-300 text-xs">
                  <thead><tr className="bg-slate-100"><th className="border border-slate-300 p-2">Route</th><th className="border border-slate-300 p-2">m</th><th className="border border-slate-300 p-2">n</th><th className="border border-slate-300 p-2">km/h</th></tr></thead>
                  <tbody>{report.analytics.route_speeds.map((r) => <tr key={r.route} className="font-mono"><td className="border border-slate-300 p-2">{r.route}</td><td className="border border-slate-300 p-2">{r.distance_m}</td><td className="border border-slate-300 p-2">{r.journeys}</td><td className="border border-slate-300 p-2">{r.mean_journey_speed_kmh}</td></tr>)}</tbody>
                </table>
              </section>
            )}
            <p className="text-[11px] text-slate-500 border-t pt-3">{s.method_note}</p>
          </>
        )}
      </article>
    </div>
  );
};
