import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { api, errorText } from '../api';
import { AccountRow, ObservationPoint, PointType, RouteDistance, Study, StudyAssignment, StudySummary } from '../types';
import { Language, pick } from '../i18n';
import { zonedToUtcIso } from '../utils/time';

interface Props {
  lang: Language;
  study: Study | null;
  studies: StudySummary[];
  onChanged: (selectId?: string) => Promise<void>;
}

const inputCls = 'w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60';
const MAX_IMAGE = 1_000_000;

export const StudySetup: React.FC<Props> = ({ lang, study, onChanged }) => {
  const [points, setPoints] = useState<ObservationPoint[]>([]);
  const [routes, setRoutes] = useState<RouteDistance[]>([]);
  const [asg, setAsg] = useState<{ user_id: string; point_code: string; period_start: string; period_end: string }[]>([]);
  const [observers, setObservers] = useState<AccountRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: '', study_date: new Date().toISOString().slice(0, 10), start_time: '08:00', end_time: '12:00', timezone: 'Asia/Tehran', supervisor_name: '' });
  const tz = study?.timezone || 'Asia/Tehran';

  useEffect(() => {
    api<AccountRow[]>('GET', '/users').then((u) => setObservers(u.filter((x) => x.role === 'OBSERVER' && x.active))).catch(() => {});
  }, []);
  const toLocal = (iso: string | null) => (iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(' ', 'T') : '');
  useEffect(() => {
    setPoints(study?.points ?? []);
    setRoutes(study?.routes ?? []);
    setAsg((study?.assignments ?? []).map((a: StudyAssignment) => ({ user_id: a.user_id, point_code: a.point_code, period_start: toLocal(a.period_start), period_end: toLocal(a.period_end) })));
  }, [study]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: okText }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  const createStudy = () => run(async () => {
    const s = await api<Study>('POST', '/studies', { ...form, status: 'DRAFT' });
    setForm({ ...form, name: '' });
    await onChanged(s.id);
  }, pick(lang, 'Study created (DRAFT). Add points, assign observers, then set it ACTIVE.', 'طرح ساخته شد (پیش‌نویس). ایستگاه‌ها را بسازید، آمارگیران را تخصیص دهید و فعال کنید.'));

  const patch = (body: object, okText = pick(lang, 'Saved', 'ذخیره شد')) => run(async () => { await api('PATCH', `/studies/${study!.id}`, body); await onChanged(study!.id); }, okText);

  const onImage = (file?: File) => {
    if (!file || !study) return;
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) return setMsg({ ok: false, text: pick(lang, 'Use a PNG, JPG or SVG image.', 'تصویر PNG، JPG یا SVG انتخاب کنید.') });
    if (file.size > MAX_IMAGE) return setMsg({ ok: false, text: pick(lang, 'The image is larger than 1 MB.', 'حجم تصویر بیش از ۱ مگابایت است.') });
    const r = new FileReader();
    r.onload = () => void patch({ schematic_image: r.result as string }, pick(lang, 'Schematic map uploaded', 'نقشه شماتیک بارگذاری شد'));
    r.readAsDataURL(file);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag || !canvas.current) return;
    const b = canvas.current.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((e.clientX - b.left) / b.width) * 100));
    const y = Math.min(98, Math.max(2, ((e.clientY - b.top) / b.height) * 100));
    setPoints((ps) => ps.map((p) => (p.code === drag ? { ...p, x_percent: Math.round(x * 10) / 10, y_percent: Math.round(y * 10) / 10 } : p)));
  };

  const addPoint = (type: PointType) => {
    const n = points.filter((p) => p.point_type === type).length + 1;
    const code = `${type === 'ENTRY' ? 'E' : 'X'}${String(n).padStart(2, '0')}`;
    if (points.some((p) => p.code === code)) return setMsg({ ok: false, text: pick(lang, `Code ${code} exists; rename a point first.`, `کد ${code} وجود دارد؛ ابتدا نام یکی را تغییر دهید.`) });
    setPoints([...points, { code, point_type: type, description: '', x_percent: type === 'ENTRY' ? 15 : 85, y_percent: 20 + ((n * 17) % 60) }]);
  };
  const setPoint = (i: number, patchP: Partial<ObservationPoint>) => setPoints((ps) => ps.map((p, k) => (k === i ? { ...p, ...patchP } : p)));
  const entries = points.filter((p) => p.point_type === 'ENTRY');
  const exits = points.filter((p) => p.point_type === 'EXIT');
  const dist = (o: string, d: string) => routes.find((r) => r.origin_code === o && r.destination_code === d)?.distance_meters ?? '';
  const setDist = (o: string, d: string, v: string) => setRoutes((rs) => {
    const rest = rs.filter((r) => !(r.origin_code === o && r.destination_code === d));
    const n = Number(v);
    return v !== '' && n > 0 ? [...rest, { origin_code: o, destination_code: d, distance_meters: n }] : rest;
  });

  const savePoints = () => run(async () => {
    const codes = new Set(points.map((p) => p.code));
    await api('PUT', `/studies/${study!.id}/points`, {
      points: points.map((p) => ({ code: p.code.trim().toUpperCase(), point_type: p.point_type, description: p.description, x_percent: p.x_percent, y_percent: p.y_percent })),
      routes: routes.filter((r) => codes.has(r.origin_code) && codes.has(r.destination_code)),
    });
    await onChanged(study!.id);
  }, pick(lang, 'Points and route distances saved', 'ایستگاه‌ها و مسافت مسیرها ذخیره شد'));

  const saveAssignments = () => run(async () => {
    await api('PUT', `/studies/${study!.id}/assignments`, { assignments: asg.filter((a) => a.user_id && a.point_code).map((a) => ({ user_id: a.user_id, point_code: a.point_code, period_start: a.period_start ? zonedToUtcIso(a.period_start, tz) ?? null : null, period_end: a.period_end ? zonedToUtcIso(a.period_end, tz) ?? null : null })) });
    await onChanged(study!.id);
  }, pick(lang, 'Assignments saved', 'تخصیص‌ها ذخیره شد'));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-testid="study-setup">
      {msg && <p role={msg.ok ? 'status' : 'alert'} data-testid="setup-msg" className={`text-xs rounded-xl p-3 border flex items-center gap-2 ${msg.ok ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300' : 'bg-rose-950/50 border-rose-800/60 text-rose-200'}`}>{msg.ok && <CheckCircle2 className="w-4 h-4" />}{msg.text}</p>}

      <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4 text-teal-400" />{pick(lang, 'New study', 'طرح جدید')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <input aria-label="Study name" placeholder={pick(lang, 'Study name', 'نام طرح')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} col-span-2`} data-testid="new-study-name" />
          <input type="date" aria-label="Date" value={form.study_date} onChange={(e) => setForm({ ...form, study_date: e.target.value })} className={inputCls} />
          <input type="time" aria-label="Start" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={inputCls} />
          <input type="time" aria-label="End" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={inputCls} />
          <input aria-label="Supervisor" placeholder={pick(lang, 'Supervisor', 'سرپرست')} value={form.supervisor_name} onChange={(e) => setForm({ ...form, supervisor_name: e.target.value })} className={inputCls} />
        </div>
        <button onClick={createStudy} disabled={busy || !form.name.trim()} className={`${btn} bg-teal-500 text-slate-950`} data-testid="create-study"><Plus className="w-4 h-4" />{pick(lang, 'Create study', 'ساخت طرح')}</button>
      </section>

      {!study ? <p className="text-center text-slate-400 text-sm">{pick(lang, 'Create or select a study.', 'یک طرح بسازید یا انتخاب کنید.')}</p> : (
        <>
          <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
            <h2 className="text-sm font-bold text-white">{study.name}</h2>
            <div className="flex flex-wrap items-end gap-3 text-xs">
              <label className="space-y-1"><span className="text-slate-400 block">{pick(lang, 'Status', 'وضعیت')}</span>
                <select value={study.status} onChange={(e) => patch({ status: e.target.value })} className={inputCls} data-testid="study-status">{['DRAFT', 'ACTIVE', 'COMPLETED'].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="space-y-1"><span className="text-slate-400 block">{pick(lang, 'Retention (days after study date; empty = keep)', 'نگهداری (روز پس از تاریخ طرح؛ خالی = دائم)')}</span>
                <input type="number" min={1} defaultValue={study.retention_days ?? ''} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== study.retention_days) void patch({ retention_days: v }); }} className={`${inputCls} w-40`} /></label>
              <label className={`${btn} bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer`}><ImagePlus className="w-4 h-4 text-teal-400" />{pick(lang, 'Upload schematic map (PNG/JPG/SVG, ≤ 1 MB)', 'بارگذاری نقشه شماتیک (PNG/JPG/SVG، حداکثر ۱ مگابایت)')}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} data-testid="map-upload" /></label>
              {study.schematic_image_url && <button onClick={() => patch({ schematic_image: null })} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300`}>{pick(lang, 'Use the grid instead', 'استفاده از شبکهٔ پیش‌فرض')}</button>}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400"><span className="font-semibold uppercase flex items-center gap-1.5"><MapPin className="w-4 h-4 text-teal-400" />{pick(lang, 'Study area (drag the markers)', 'محدودهٔ مطالعه (نشانگرها را بکشید)')}</span>
                <span className="flex items-center gap-3"><span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-full bg-emerald-400" />ENTRY</span><span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rotate-45 bg-indigo-400" />EXIT</span></span></div>
              <div ref={canvas} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} className="relative w-full h-96 bg-slate-950 rounded-2xl border-2 border-slate-800 overflow-hidden touch-none select-none" data-testid="map-canvas">
                {study.schematic_image_url ? <img src={study.schematic_image_url} alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" /> : (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" aria-hidden>
                    <defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern></defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#334155" strokeWidth="24" /><line x1="0" y1="50%" x2="100%" y2="50%" stroke="#334155" strokeWidth="24" />
                  </svg>
                )}
                {points.map((p) => (
                  <button key={p.code} type="button" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(p.code); }} aria-label={`${p.code} ${p.point_type}`} data-testid={`marker-${p.code}`}
                    style={{ left: `${p.x_percent}%`, top: `${p.y_percent}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing">
                    <span className={`w-6 h-6 border-2 border-white shadow-lg ${p.point_type === 'ENTRY' ? 'rounded-full bg-emerald-500' : 'rotate-45 bg-indigo-500'}`} />
                    <span className="mt-1 text-[10px] font-mono font-black bg-slate-900/90 px-1.5 rounded text-white">{p.code}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white">{pick(lang, 'Observation points', 'ایستگاه‌های مشاهده')}</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {points.map((p, i) => (
                  <div key={i} className="grid grid-cols-[4.5rem_1fr_auto] gap-2 items-center">
                    <input aria-label="Code" value={p.code} maxLength={12} onChange={(e) => setPoint(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} className={`${inputCls} font-mono`} data-testid={`point-code-${i}`} />
                    <input aria-label="Description" placeholder={pick(lang, 'Description', 'توضیح')} value={p.description} onChange={(e) => setPoint(i, { description: e.target.value })} className={inputCls} />
                    <button onClick={() => setPoints(points.filter((_, k) => k !== i))} aria-label="Remove" className="p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                    <select aria-label="Type" value={p.point_type} onChange={(e) => setPoint(i, { point_type: e.target.value as PointType })} className={`${inputCls} col-span-3`}><option value="ENTRY">ENTRY</option><option value="EXIT">EXIT</option></select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2"><button onClick={() => addPoint('ENTRY')} className={`${btn} bg-emerald-600 text-white`} data-testid="add-entry"><Plus className="w-3.5 h-3.5" />ENTRY</button><button onClick={() => addPoint('EXIT')} className={`${btn} bg-indigo-600 text-white`} data-testid="add-exit"><Plus className="w-3.5 h-3.5" />EXIT</button></div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white">{pick(lang, 'Route distances (metres) - needed for journey speed; empty = no speed shown', 'مسافت مسیرها (متر) - برای سرعت سیر؛ خالی = سرعت نمایش داده نمی‌شود')}</h3>
            {entries.length === 0 || exits.length === 0 ? <p className="text-xs text-slate-500">{pick(lang, 'Add at least one ENTRY and one EXIT point.', 'حداقل یک ایستگاه ورودی و یک خروجی اضافه کنید.')}</p> : (
              <div className="overflow-x-auto"><table className="text-xs"><thead><tr><th className="p-2" />{exits.map((x) => <th key={x.code} className="p-2 font-mono text-indigo-400">{x.code}</th>)}</tr></thead>
                <tbody>{entries.map((e) => <tr key={e.code}><td className="p-2 font-mono text-emerald-400">{e.code}</td>{exits.map((x) => <td key={x.code} className="p-1"><input type="number" min={1} aria-label={`${e.code} to ${x.code}`} value={dist(e.code, x.code)} onChange={(ev) => setDist(e.code, x.code, ev.target.value)} className={`${inputCls} w-24`} data-testid={`dist-${e.code}-${x.code}`} /></td>)}</tr>)}</tbody></table></div>
            )}
            <button onClick={savePoints} disabled={busy} className={`${btn} bg-teal-500 text-slate-950`} data-testid="save-points"><Save className="w-4 h-4" />{pick(lang, 'Save points & distances', 'ذخیرهٔ ایستگاه‌ها و مسافت‌ها')}</button>
          </section>

          <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white">{pick(lang, `Observer assignments (times in ${tz}; empty = whole study)`, `تخصیص آمارگیران (زمان‌ها به وقت ${tz}؛ خالی = کل طرح)`)}</h3>
            <p className="text-[11px] text-slate-500">{pick(lang, 'Save the points first so they can be chosen here.', 'ابتدا ایستگاه‌ها را ذخیره کنید تا اینجا قابل انتخاب باشند.')}</p>
            <div className="space-y-2">
              {asg.map((a, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_7rem_1fr_1fr_auto] gap-2 items-center">
                  <select aria-label="Observer" value={a.user_id} onChange={(e) => setAsg(asg.map((x, k) => (k === i ? { ...x, user_id: e.target.value } : x)))} className={inputCls} data-testid={`asg-user-${i}`}><option value="">{pick(lang, 'Observer…', 'آمارگیر…')}</option>{observers.map((o) => <option key={o.id} value={o.id}>{o.full_name} (@{o.username})</option>)}</select>
                  <select aria-label="Point" value={a.point_code} onChange={(e) => setAsg(asg.map((x, k) => (k === i ? { ...x, point_code: e.target.value } : x)))} className={inputCls} data-testid={`asg-point-${i}`}><option value="">{pick(lang, 'Point…', 'ایستگاه…')}</option>{(study.points).map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}</select>
                  <input type="datetime-local" aria-label="From" value={a.period_start} onChange={(e) => setAsg(asg.map((x, k) => (k === i ? { ...x, period_start: e.target.value } : x)))} className={inputCls} />
                  <input type="datetime-local" aria-label="To" value={a.period_end} onChange={(e) => setAsg(asg.map((x, k) => (k === i ? { ...x, period_end: e.target.value } : x)))} className={inputCls} />
                  <button onClick={() => setAsg(asg.filter((_, k) => k !== i))} aria-label="Remove" className="p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2"><button onClick={() => setAsg([...asg, { user_id: '', point_code: '', period_start: '', period_end: '' }])} className={`${btn} bg-slate-800 border border-slate-700 text-slate-200`} data-testid="add-assignment"><Plus className="w-4 h-4" />{pick(lang, 'Add assignment', 'افزودن تخصیص')}</button>
              <button onClick={saveAssignments} disabled={busy} className={`${btn} bg-teal-500 text-slate-950`} data-testid="save-assignments"><Save className="w-4 h-4" />{pick(lang, 'Save assignments', 'ذخیرهٔ تخصیص‌ها')}</button></div>
          </section>
        </>
      )}
    </div>
  );
};
