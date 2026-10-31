import React from 'react';
import { Car, GitCompare, Layers, MapPin, RotateCcw } from 'lucide-react';
import { Report, Study, User } from '../types';
import { Language, getT, pick } from '../i18n';
import { fmtDuration, fmtTime } from '../utils/time';

interface Props {
  study: Study | null;
  lang: Language;
  user: User;
  report: Report | null;
  observationCount: number;
  setActiveTab: (tab: any) => void;
  onDemoReset: () => Promise<void>;
}

const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string; id: string }> = ({ label, value, hint, tone = 'text-white', id }) => (
  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800" data-testid={`kpi-${id}`}>
    <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
    <p className={`text-3xl font-black font-mono mt-1.5 ${tone}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
  </div>
);

/** Horizontal bars drawn with plain SVG/CSS (no chart dependency). Values come from the engine, never typed in. */
const Bars: React.FC<{ title: string; rows: { label: string; value: number; color?: string }[]; empty: string }> = ({ title, rows, empty }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-slate-500">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-xs">
              <div className="flex justify-between text-slate-300 mb-0.5"><span>{r.label}</span><span className="font-mono">{r.value}</span></div>
              <div className="h-2 rounded bg-slate-800 overflow-hidden"><div className={`h-full ${r.color ?? 'bg-teal-500'}`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const DashboardView: React.FC<Props> = ({ study, lang, user, report, observationCount, setActiveTab, onDemoReset }) => {
  const t = getT(lang);
  const [resetting, setResetting] = React.useState(false);
  if (!study) return <p className="p-8 text-center text-slate-400">{pick(lang, 'No study yet. An administrator can create one under "Studies & Map".', 'هنوز طرحی وجود ندارد. مدیر می‌تواند در «طرح‌ها و نقشه» بسازد.')}</p>;
  const s = report?.summary;
  const c = report?.analytics.counts;
  const tz = study.timezone;
  const empty = pick(lang, 'No data yet.', 'هنوز داده‌ای نیست.');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 rounded-3xl p-6 border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-mono">{study.study_date} • {study.start_time}-{study.end_time} • {tz} • {study.status}</p>
          <h1 className="text-2xl font-extrabold text-white" data-testid="study-title">{study.name}</h1>
          {study.description && <p className="text-sm text-slate-300 max-w-2xl">{study.description}</p>}
        </div>
        {study.is_demo && user.role === 'ADMIN' && (
          <button disabled={resetting} onClick={async () => { setResetting(true); try { await onDemoReset(); } finally { setResetting(false); } }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-fuchsia-200 text-xs font-semibold">
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />{t.reset_seed_data}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi id="total" label={pick(lang, 'Total observations', 'کل مشاهدات')} value={observationCount} hint={pick(lang, 'recorded events (undone entries excluded)', 'رویدادهای ثبت‌شده (بدون موارد لغوشده)')} />
        <Kpi id="entries" label={pick(lang, 'Entries', 'ورودی‌ها')} value={c?.entries ?? '-'} tone="text-emerald-400" />
        <Kpi id="exits" label={pick(lang, 'Exits', 'خروجی‌ها')} value={c?.exits ?? '-'} tone="text-indigo-400" />
        <Kpi id="points" label={pick(lang, 'Observation points', 'ایستگاه‌ها')} value={study.points.length} tone="text-teal-300" />
        <Kpi id="matched" label={t.stat_matched} value={s ? s.matched_journeys + 0 : '-'} tone="text-emerald-400" hint={s ? `${pick(lang, 'of which supervisor-confirmed', 'که تأییدشدهٔ سرپرست')}: ${s.reviewed_journeys}` : undefined} />
        <Kpi id="rate" label={t.stat_matching_rate} value={s ? `${s.matching_rate_percent}%` : '-'} tone="text-teal-300" hint={pick(lang, 'matched ÷ entries; probable, not certain', 'منطبق ÷ ورودی؛ محتمل، نه قطعی')} />
        <Kpi id="ambiguous" label={t.stat_ambiguous} value={s?.ambiguous_cases ?? '-'} tone="text-amber-400" hint={pick(lang, 'need supervisor review', 'نیازمند بررسی سرپرست')} />
        <Kpi id="unmatched" label={pick(lang, 'Unmatched entries / exits', 'ورودی / خروجی بدون جفت')} value={s ? `${s.unmatched_entries} / ${s.unmatched_exits}` : '-'} tone="text-rose-400" />
        <Kpi id="pending-voice" label={pick(lang, 'Voice-only passages awaiting digits', 'تردهای صوتیِ منتظر رقم')} value={s ? (s.pending_voice_entries ?? 0) + (s.pending_voice_exits ?? 0) : '-'} tone="text-fuchsia-300" hint={pick(lang, 'counted in volumes, not yet matched', 'در حجم شمرده می‌شوند، هنوز جفت نشده‌اند')} />
        <Kpi id="mean-tt" label={t.stat_mean_tt} value={s && s.matched_journeys ? fmtDuration(s.mean_travel_time_sec) : '-'} hint={s && s.matched_journeys ? `${pick(lang, 'median', 'میانه')} ${fmtDuration(s.median_travel_time_sec)}` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Bars title={pick(lang, `Traffic volume per ${c?.interval_minutes ?? 15} min (${tz})`, `حجم ترافیک در هر ${c?.interval_minutes ?? 15} دقیقه (${tz})`)} empty={empty}
          rows={(c?.by_interval ?? []).map((b) => ({ label: fmtTime(b.start, tz).slice(0, 5), value: b.total }))} />
        <Bars title={pick(lang, 'Vehicle category distribution', 'توزیع نوع وسیله نقلیه')} empty={empty}
          rows={Object.entries(c?.by_category ?? {}).map(([k, v]) => ({ label: `${k} (${c?.category_percent[k]}%)`, value: v, color: 'bg-amber-500' }))} />
        <Bars title={pick(lang, 'Observations by point', 'مشاهدات به تفکیک ایستگاه')} empty={empty}
          rows={Object.entries(c?.by_point ?? {}).map(([k, v]) => ({ label: `${k} ${study.points.find((p) => p.code === k)?.point_type === 'EXIT' ? '(EXIT)' : '(ENTRY)'}`, value: v, color: study.points.find((p) => p.code === k)?.point_type === 'EXIT' ? 'bg-indigo-500' : 'bg-emerald-500' }))} />
        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white">{pick(lang, 'Go to', 'برو به')}</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[['studies', MapPin, pick(lang, 'Map & points', 'نقشه و ایستگاه‌ها')], ['matching', GitCompare, t.nav_matching], ['od_matrix', Layers, 'OD'], ['collector', Car, t.nav_field_collector]].filter(([id]) => id !== 'studies' || user.role === 'ADMIN').filter(([id]) => id !== 'collector' || user.role === 'OBSERVER').map(([id, Icon, label]: any) => (
              <button key={id} onClick={() => setActiveTab(id)} className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-teal-500/50 flex flex-col items-center gap-1.5"><Icon className="w-5 h-5 text-teal-400" /><span>{label}</span></button>
            ))}
          </div>
          {s && <p className="text-[11px] text-slate-500 leading-relaxed">{s.method_note}</p>}
        </div>
      </div>
    </div>
  );
};
