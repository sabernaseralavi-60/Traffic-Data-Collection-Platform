import React, { useState } from 'react';
import { FileSpreadsheet, Layers } from 'lucide-react';
import { download } from '../api';
import { Report, Study } from '../types';
import { Language, getT, pick } from '../i18n';
import { fmtDuration } from '../utils/time';

interface Props { study: Study | null; lang: Language; report: Report | null }

const cell = (n: number, max: number) => {
  if (n === 0) return 'bg-slate-950/40 text-slate-600';
  const r = max > 0 ? n / max : 0;
  return r > 0.6 ? 'bg-emerald-500/30 text-emerald-300 font-extrabold border border-emerald-500/40' : r > 0.3 ? 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30' : 'bg-slate-800/80 text-slate-200 border border-slate-700/60';
};

export const ODMatrixView: React.FC<Props> = ({ study, lang, report }) => {
  const t = getT(lang);
  const [mode, setMode] = useState<'COUNTS' | 'PERCENT'>('COUNTS');
  if (!study) return null;
  const od = report?.analytics.od_matrix;
  if (!report || !od) return <p className="p-12 text-center text-slate-400">{pick(lang, 'No matching results yet.', 'هنوز نتیجهٔ انطباقی وجود ندارد.')}</p>;
  const st = report.analytics.travel_time_stats;
  const split = report.analytics.vehicle_category_split;
  let max = 1;
  od.origins.forEach((o) => od.destinations.forEach((d) => { max = Math.max(max, od.counts[o]?.[d] ?? 0); }));
  const pct = (o: string, d: string) => od.percentages[o]?.[d] ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-testid="od-view">
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-5 h-5 text-teal-400" />{t.od_title}</h2>
          <p className="text-xs text-slate-400 mt-1">{pick(lang, 'Counts of probable journeys (matched + supervisor-confirmed), not a census of all traffic.', 'تعداد سفرهای محتمل (منطبق + تأییدشدهٔ سرپرست)؛ سرشماری همهٔ ترافیک نیست.')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            {(['COUNTS', 'PERCENT'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`px-3 py-1.5 rounded-lg ${mode === m ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400'}`}>{m === 'COUNTS' ? pick(lang, 'Vehicles', 'تعداد') : pick(lang, 'Share (%)', 'سهم (٪)')}</button>
            ))}
          </div>
          <button onClick={() => download(`/studies/${study.id}/export.xlsx`)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"><FileSpreadsheet className="w-4 h-4" />{t.export_excel}</button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-white">{pick(lang, 'Origin–Destination matrix', 'ماتریس مبدا-مقصد')}</h3>
          <span className="text-xs font-mono font-bold text-teal-300" data-testid="od-total">{od.grand_total} {pick(lang, 'journeys', 'سفر')}</span>
        </div>
        {od.origins.length === 0 ? <p className="text-xs text-slate-500">{pick(lang, 'No matched journeys yet.', 'هنوز سفر منطبقی نیست.')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse" data-testid="od-table">
              <thead>
                <tr>
                  <th className="p-3 text-xs text-slate-400 bg-slate-950 border border-slate-800 text-start">{pick(lang, 'Origin \\ Destination', 'مبدا \\ مقصد')}</th>
                  {od.destinations.map((d) => <th key={d} className="p-3 text-xs font-mono text-indigo-400 bg-slate-950/80 border border-slate-800 min-w-[90px]">{d}</th>)}
                  <th className="p-3 text-xs font-mono text-white bg-slate-950 border border-slate-800">{pick(lang, 'Total', 'جمع')}</th>
                </tr>
              </thead>
              <tbody>
                {od.origins.map((o) => (
                  <tr key={o}>
                    <td className="p-3 font-mono font-black text-xs text-emerald-400 bg-slate-950/60 border border-slate-800 text-start">{o}</td>
                    {od.destinations.map((d) => { const n = od.counts[o]?.[d] ?? 0; return <td key={d} className={`p-3 font-mono text-sm ${cell(n, max)}`}>{mode === 'COUNTS' ? n : `${pct(o, d)}%`}</td>; })}
                    <td className="p-3 font-mono font-bold text-white bg-slate-950/60 border border-slate-800">{mode === 'COUNTS' ? od.row_totals[o] : `${od.grand_total ? Math.round((od.row_totals[o] / od.grand_total) * 1000) / 10 : 0}%`}</td>
                  </tr>
                ))}
                <tr>
                  <td className="p-3 font-mono text-xs text-white bg-slate-950 border border-slate-800 text-start">{pick(lang, 'Total', 'جمع')}</td>
                  {od.destinations.map((d) => <td key={d} className="p-3 font-mono font-bold text-white bg-slate-950/60 border border-slate-800">{mode === 'COUNTS' ? od.col_totals[d] : `${od.grand_total ? Math.round((od.col_totals[d] / od.grand_total) * 1000) / 10 : 0}%`}</td>)}
                  <td className="p-3 font-mono font-black text-teal-300 bg-slate-950 border border-slate-800">{od.grand_total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white">{t.travel_time_percentiles}</h3>
          {st.count === 0 ? <p className="text-xs text-slate-500">{pick(lang, 'No travel times yet.', 'هنوز زمان سفری نیست.')}</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" data-testid="tt-stats">
                {[[pick(lang, 'Mean', 'میانگین'), st.mean], [pick(lang, 'Median', 'میانه'), st.median], [t.std_dev, st.std_dev], ['Min', st.min], ['Max', st.max], ['P15', st.p15], ['P85', st.p85], ['P95', st.p95]].map(([k, v]) => (
                  <div key={String(k)} className="p-3 rounded-xl bg-slate-950 border border-slate-800"><p className="text-slate-400">{k}</p><p className="font-mono font-bold text-white text-lg">{fmtDuration(Number(v))}</p></div>
                ))}
              </div>
              <ul className="space-y-1.5 pt-2">
                {st.histogram.map((b) => (
                  <li key={b.label} className="flex items-center gap-2 text-[11px]"><span className="w-28 font-mono text-slate-400">{b.label}</span><div className="flex-1 h-2 bg-slate-800 rounded"><div className="h-full bg-teal-500 rounded" style={{ width: `${st.count ? (b.count / st.count) * 100 : 0}%` }} /></div><span className="font-mono w-6 text-end">{b.count}</span></li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500">{pick(lang, 'Percentiles are of observed journey times between the two points (linear interpolation).', 'صدک‌ها از زمان‌های سفر مشاهده‌شده بین دو ایستگاه است (درون‌یابی خطی).')}</p>
            </>
          )}
        </div>
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white">{t.modal_split}</h3>
          {split.total === 0 ? <p className="text-xs text-slate-500">-</p> : (
            <ul className="space-y-2 text-xs">{Object.entries(split.counts).map(([k, v]) => (
              <li key={k}><div className="flex justify-between text-slate-300"><span>{k}</span><span className="font-mono">{v} ({split.percentages[k]}%)</span></div><div className="h-2 bg-slate-800 rounded mt-0.5"><div className="h-full bg-amber-500 rounded" style={{ width: `${split.percentages[k]}%` }} /></div></li>
            ))}</ul>
          )}
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white">{pick(lang, 'Average journey speed (estimated from travel time and the configured route distance)', 'سرعت متوسط سیر (برآورد از زمان سفر و مسافت تنظیم‌شدهٔ مسیر)')}</h3>
        {report.analytics.route_speeds.length === 0 ? (
          <p className="text-xs text-slate-500">{pick(lang, 'No speed is shown where the route distance is not configured (it is never guessed).', 'جایی که مسافت مسیر تنظیم نشده سرعتی نمایش داده نمی‌شود (هرگز حدس زده نمی‌شود).')}</p>
        ) : (
          <table className="w-full text-xs text-start" data-testid="speed-table"><thead><tr className="text-slate-400 border-b border-slate-800"><th className="py-2 text-start">{pick(lang, 'Route', 'مسیر')}</th><th>{pick(lang, 'Distance (m)', 'مسافت (m)')}</th><th>{pick(lang, 'Journeys', 'سفرها')}</th><th>{pick(lang, 'Mean time', 'میانگین زمان')}</th><th>{pick(lang, 'Mean speed', 'سرعت متوسط')}</th></tr></thead>
            <tbody className="font-mono">{report.analytics.route_speeds.map((r) => (
              <tr key={r.route} className="border-b border-slate-800/60"><td className="py-2 text-teal-300">{r.route}</td><td className="text-center">{r.distance_m}</td><td className="text-center">{r.journeys}</td><td className="text-center">{fmtDuration(r.mean_travel_time_sec)}</td><td className="text-center font-bold">{r.mean_journey_speed_kmh} km/h</td></tr>
            ))}</tbody></table>
        )}
        <p className="text-[11px] text-slate-500">{pick(lang, 'This is an average journey speed between two points, not an instantaneous vehicle speed.', 'این سرعت متوسط سیر بین دو نقطه است، نه سرعت لحظه‌ای خودرو.')}</p>
      </div>
    </div>
  );
};
