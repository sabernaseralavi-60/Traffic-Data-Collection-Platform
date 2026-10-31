import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ListChecks, Mic, Search, Trash2 } from 'lucide-react';
import { api, errorText } from '../api';
import { Study, VehicleObservation } from '../types';
import { Language, pick } from '../i18n';
import { normalizePlateDigits } from '../utils/plateNormalization';
import { fmtTime } from '../utils/time';

interface Props { study: Study | null; lang: Language; onChanged: () => Promise<void> }

const inputCls = 'px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none';

/** Every recorded passage with its voice clip: listen, correct a mistyped suffix, or undo an entry. */
export const ObservationsView: React.FC<Props> = ({ study, lang, onChanged }) => {
  const [rows, setRows] = useState<VehicleObservation[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [point, setPoint] = useState('ALL');
  const [search, setSearch] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false); // passages that still need digits, or whose digits disagree with the offline suggestion
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!study) return;
    try { setRows(await api<VehicleObservation[]>('GET', `/studies/${study.id}/observations?limit=2000`)); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }, [study]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => rows.filter((o) => (point === 'ALL' || o.point_code === point) && (!search || (o.plate_suffix ?? '').includes(search)) && (!audioOnly || o.has_audio) && (!onlyOpen || o.plate_suffix == null || (!!o.suggested_suffix && o.suggested_suffix !== o.plate_suffix))), [rows, point, search, audioOnly, onlyOpen]);
  const needDigits = rows.filter((o) => o.plate_suffix == null).length;
  if (!study) return null;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg({ ok: true, text: ok }); setEditing(null); await load(); await onChanged(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4" data-testid="observations-view">
      <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><ListChecks className="w-5 h-5 text-teal-400" />{pick(lang, 'Recorded passages', 'تردهای ثبت‌شده')} <span className="text-xs font-mono text-slate-400">({shown.length}/{rows.length})</span></h2>
        <p className="text-xs text-slate-400">{pick(lang, 'Listen to the voice clip of a passage to check the digits. A wrong suffix is corrected (the old entry is kept as undone, with the reason); an entry made by mistake can be undone.', 'برای بررسی رقم‌ها، صدای هر تردد را بشنوید. رقم اشتباه اصلاح می‌شود (ثبت قبلی به‌عنوان لغوشده با دلیل نگه داشته می‌شود)؛ ثبت اشتباه را می‌توان لغو کرد.')}</p>
        <div className="flex flex-wrap gap-3 items-center text-xs">
          <select aria-label="Point" value={point} onChange={(e) => setPoint(e.target.value)} className={inputCls}><option value="ALL">{pick(lang, 'All points', 'همهٔ ایستگاه‌ها')}</option>{study.points.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}</select>
          <div className="relative"><Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input aria-label="Suffix" value={search} onChange={(e) => setSearch(normalizePlateDigits(e.target.value).slice(0, 3))} placeholder={pick(lang, 'Suffix…', 'رقم‌ها…')} className={`${inputCls} ps-8 w-28`} /></div>
          <label className="flex items-center gap-1.5 text-slate-300"><input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} />{pick(lang, 'only with voice clip', 'فقط دارای صدا')}</label>
          <label className="flex items-center gap-1.5 text-amber-200"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} data-testid="only-open" />{pick(lang, 'needs attention (no digits yet / differs from suggestion)', 'نیازمند توجه (بدون رقم / ناهمخوان با پیشنهاد)')}</label>
          {needDigits > 0 && <span className="px-2 py-0.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200" data-testid="need-digits">{needDigits} {pick(lang, 'voice-only passages still need digits', 'تردد صوتی هنوز رقم ندارد')}</span>}
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} data-testid="obs-msg" className={`text-xs rounded-xl p-2.5 border ${msg.ok ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300' : 'bg-rose-950/50 border-rose-800/60 text-rose-200'}`}>{msg.text}</p>}
      </div>

      <div className="bg-slate-900 rounded-3xl p-4 border border-slate-800 overflow-x-auto">
        <table className="w-full text-xs text-start" data-testid="obs-table">
          <thead><tr className="text-slate-400 border-b border-slate-800">{[pick(lang, 'Time', 'زمان'), pick(lang, 'Point', 'ایستگاه'), pick(lang, 'Suffix', 'رقم‌ها'), pick(lang, 'Category', 'نوع'), pick(lang, 'Counted by', 'ثبت‌کننده'), pick(lang, 'Voice', 'صدا'), ''].map((h, i) => <th key={i} className="py-2 px-2 text-start">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800/60">
            {shown.map((o) => (
              <tr key={o.id} data-testid={`obs-row-${o.plate_suffix ?? 'voice'}`}>
                <td className="py-2 px-2 font-mono whitespace-nowrap">{fmtTime(o.observation_timestamp, study.timezone, true)}</td>
                <td className="px-2 font-mono"><span className={o.point_type === 'ENTRY' ? 'text-emerald-400' : 'text-indigo-400'}>{o.point_code}</span></td>
                <td className="px-2">
                  {editing?.id === o.id ? (
                    <span className="flex items-center gap-1"><input autoFocus aria-label="New suffix" value={editing.value} onChange={(e) => setEditing({ id: o.id, value: normalizePlateDigits(e.target.value).slice(0, 3) })} className={`${inputCls} w-16 font-mono`} data-testid="correct-input" />
                      <button onClick={() => act(() => api('POST', `/observations/${o.id}/correct`, { plate_suffix: editing.value }), o.plate_suffix == null ? pick(lang, 'Digits added', 'رقم‌ها اضافه شد') : pick(lang, 'Corrected', 'اصلاح شد'))} disabled={editing.value.length !== 3} className="p-1 rounded bg-teal-500 text-slate-950 disabled:opacity-40" data-testid="correct-save" aria-label="Save"><Check className="w-3.5 h-3.5" /></button></span>
                  ) : o.plate_suffix == null ? (
                    <button onClick={() => setEditing({ id: o.id, value: o.suggested_suffix ?? '' })} className="px-2 py-0.5 rounded border border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200 hover:border-fuchsia-300" data-testid="correct-open">{pick(lang, 'add digits', 'افزودن رقم')}</button>
                  ) : (
                    <button onClick={() => setEditing({ id: o.id, value: o.plate_suffix! })} className="font-mono font-extrabold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 hover:border-teal-400" title={pick(lang, 'Click to correct', 'برای اصلاح کلیک کنید')} data-testid="correct-open">{o.plate_suffix}</button>
                  )}
                  {o.suggested_suffix && o.suggested_suffix !== o.plate_suffix && editing?.id !== o.id && (
                    <div className={`mt-1 text-[11px] ${o.plate_suffix == null ? 'text-fuchsia-200' : 'text-amber-300'}`} data-testid="suggestion">
                      {o.plate_suffix == null ? pick(lang, 'suggested', 'پیشنهاد') : pick(lang, 'differs: suggested', 'ناهمخوان؛ پیشنهاد')} <b className="font-mono">{o.suggested_suffix}</b>
                      {o.suggested_conf != null && <span className="text-slate-400"> ({Math.round(o.suggested_conf * 100)}%)</span>}
                      <button onClick={() => act(() => api('POST', `/observations/${o.id}/correct`, { plate_suffix: o.suggested_suffix, source: 'SUGGESTION' }), pick(lang, 'Suggestion accepted', 'پیشنهاد پذیرفته شد'))} className="ms-1 px-1.5 rounded bg-teal-500 text-slate-950 font-bold" data-testid="accept-suggestion">{pick(lang, 'accept', 'پذیرش')}</button>
                    </div>
                  )}
                  {o.suggested_suffix && o.suggested_suffix === o.plate_suffix && <div className="mt-1 text-[11px] text-emerald-300">✓ {pick(lang, 'confirmed by the audio tool', 'مورد تأیید ابزار صوتی')}</div>}
                </td>
                <td className="px-2">{o.vehicle_category}</td>
                <td className="px-2">{o.observer_name}</td>
                <td className="px-2">{o.has_audio ? (playing === o.id
                  ? <audio controls autoPlay src={`/api/v1/observations/${o.id}/audio`} className="h-8 w-48" data-testid="audio-player" />
                  : <button onClick={() => setPlaying(o.id)} className="flex items-center gap-1 text-teal-300 hover:text-teal-200" data-testid={`play-${o.plate_suffix ?? 'voice'}`}><Mic className="w-3.5 h-3.5" />{pick(lang, 'play', 'پخش')} {o.audio_ms ? `(${(o.audio_ms / 1000).toFixed(1)}s)` : ''}</button>) : <span className="text-slate-600">-</span>}</td>
                <td className="px-2 text-end"><button onClick={() => { if (window.confirm(pick(lang, 'Undo this entry?', 'این ثبت لغو شود؟'))) void act(() => api('POST', `/observations/${o.id}/void`, { reason: 'undone by supervisor' }), pick(lang, 'Undone', 'لغو شد')); }} className="p-1.5 text-slate-500 hover:text-rose-400" aria-label={pick(lang, 'Undo entry', 'لغو ثبت')}><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="text-xs text-slate-500 text-center py-6">{pick(lang, 'No passages match.', 'ترددی یافت نشد.')}</p>}
      </div>
    </div>
  );
};
