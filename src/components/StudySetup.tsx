import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, MapPin, Plus, Printer, Save, Trash2, UserPlus, X } from 'lucide-react';
import { api, errorText } from '../api';
import { AccountRow, ObservationPoint, PointType, RouteDistance, Study, StudyAssignment, StudySummary } from '../types';
import { Language, pick } from '../i18n';
import { prepareMapImage } from '../utils/image';
import { zonedToUtcIso } from '../utils/time';

interface Props {
  lang: Language;
  study: Study | null;
  studies: StudySummary[];
  onChanged: (selectId?: string) => Promise<void>;
}

interface AsgRow { user_id: string; point_code: string; period_start: string; period_end: string }

const inputCls = 'w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60';

export const StudySetup: React.FC<Props> = ({ lang, study, onChanged }) => {
  const [points, setPoints] = useState<ObservationPoint[]>([]);
  const [routes, setRoutes] = useState<RouteDistance[]>([]);
  const [asg, setAsg] = useState<AsgRow[]>([]);
  const [observers, setObservers] = useState<AccountRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // bump to reload the local edit state from the server
  const [newMapName, setNewMapName] = useState('');
  const [person, setPerson] = useState({ full_name: '', username: '', password: '', point: '' });
  const canvas = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<Record<string, number>>({}); // width/height of each map image: markers are % of the IMAGE, so the frame must have its shape
  const [form, setForm] = useState({ name: '', study_date: new Date().toISOString().slice(0, 10), start_time: '08:00', end_time: '12:00', timezone: 'Asia/Tehran', supervisor_name: '' });
  const tz = study?.timezone || 'Asia/Tehran';

  const loadObservers = () => api<AccountRow[]>('GET', '/users').then((u) => setObservers(u.filter((x) => x.role === 'OBSERVER' && x.active))).catch(() => {});
  useEffect(() => { void loadObservers(); }, []);

  const toLocal = (iso: string | null) => (iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(' ', 'T') : '');
  useEffect(() => {
    setPoints(study?.points ?? []);
    setRoutes(study?.routes ?? []);
    setAsg((study?.assignments ?? []).map((a: StudyAssignment) => ({ user_id: a.user_id, point_code: a.point_code, period_start: toLocal(a.period_start), period_end: toLocal(a.period_end) })));
    setMapId((cur) => (study?.maps.some((m) => m.id === cur) ? cur : study?.maps[0]?.id ?? null));
  }, [study?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const maps = study?.maps ?? [];
  const firstMap = maps[0]?.id ?? null;
  const activeMap = maps.find((m) => m.id === mapId) ?? maps[0] ?? null;
  const onMap = (p: ObservationPoint, id: string | null) => (p.map_id ?? firstMap) === id;
  const nameOf = (uid: string) => observers.find((o) => o.id === uid);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: okText }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  const createStudy = () => run(async () => {
    const s = await api<Study>('POST', '/studies', { ...form, status: 'DRAFT' });
    setForm({ ...form, name: '' });
    await onChanged(s.id);
  }, pick(lang, 'Study created (DRAFT). Add map sections, mark entries/exits, assign people, then set it ACTIVE.', 'طرح ساخته شد (پیش‌نویس). بخش‌های نقشه را اضافه کنید، ورودی/خروجی‌ها را مشخص کنید، افراد را تخصیص دهید و فعال کنید.'));

  const patch = (body: object, okText = pick(lang, 'Saved', 'ذخیره شد')) => run(async () => { await api('PATCH', `/studies/${study!.id}`, body); await onChanged(study!.id); }, okText);

  // ----- map sections
  const addMap = (file?: File) => run(async () => {
    const image = file ? await prepareMapImage(file).catch((e) => { throw new Error(e.message === 'size' ? pick(lang, 'The image is still larger than 1 MB after scaling; use a smaller one.', 'تصویر پس از کوچک‌سازی هنوز بیش از ۱ مگابایت است.') : pick(lang, 'Use a PNG, JPG or SVG image.', 'تصویر PNG، JPG یا SVG انتخاب کنید.')); }) : null;
    await api('POST', `/studies/${study!.id}/maps`, { name: newMapName.trim() || `Map ${maps.length + 1}`, image });
    setNewMapName('');
    await onChanged(study!.id);
  }, pick(lang, 'Map section added', 'بخش نقشه اضافه شد'));

  const replaceImage = (m: { id: string }, file?: File) => file && run(async () => {
    const image = await prepareMapImage(file).catch((e) => { throw new Error(e.message === 'size' ? pick(lang, 'The image is still larger than 1 MB after scaling.', 'تصویر پس از کوچک‌سازی هنوز بیش از ۱ مگابایت است.') : pick(lang, 'Use a PNG, JPG or SVG image.', 'تصویر PNG، JPG یا SVG انتخاب کنید.')); });
    await api('PATCH', `/studies/${study!.id}/maps/${m.id}`, { image });
    await onChanged(study!.id);
  }, pick(lang, 'Map image uploaded', 'تصویر نقشه بارگذاری شد'));

  // ----- points
  const move = (e: React.PointerEvent) => {
    if (!drag || !canvas.current) return;
    const b = canvas.current.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((e.clientX - b.left) / b.width) * 100));
    const y = Math.min(98, Math.max(2, ((e.clientY - b.top) / b.height) * 100));
    setPoints((ps) => ps.map((p) => (p.code === drag ? { ...p, x_percent: Math.round(x * 10) / 10, y_percent: Math.round(y * 10) / 10 } : p)));
  };
  const addPoint = (type: PointType) => {
    let n = points.filter((p) => p.point_type === type).length + 1;
    const mk = (k: number) => `${type === 'ENTRY' ? 'E' : 'X'}${String(k).padStart(2, '0')}`;
    while (points.some((p) => p.code === mk(n))) n++;
    setPoints([...points, { code: mk(n), map_id: activeMap?.id ?? null, point_type: type, description: '', x_percent: type === 'ENTRY' ? 15 : 85, y_percent: 20 + ((n * 17) % 60) }]);
  };
  const setPoint = (i: number, patchP: Partial<ObservationPoint>) => {
    const old = points[i].code;
    setPoints((ps) => ps.map((p, k) => (k === i ? { ...p, ...patchP } : p)));
    if (patchP.code && patchP.code !== old) { // keep people and distances attached when a code is renamed (before saving)
      setAsg((a) => a.map((r) => (r.point_code === old ? { ...r, point_code: patchP.code! } : r)));
      setRoutes((rs) => rs.map((r) => ({ ...r, origin_code: r.origin_code === old ? patchP.code! : r.origin_code, destination_code: r.destination_code === old ? patchP.code! : r.destination_code })));
    }
  };
  const removePoint = (i: number) => {
    const code = points[i].code;
    setPoints(points.filter((_, k) => k !== i));
    setAsg((a) => a.filter((r) => r.point_code !== code));
    setRoutes((rs) => rs.filter((r) => r.origin_code !== code && r.destination_code !== code));
  };

  const entries = points.filter((p) => p.point_type === 'ENTRY');
  const exits = points.filter((p) => p.point_type === 'EXIT');
  const dist = (o: string, d: string) => routes.find((r) => r.origin_code === o && r.destination_code === d)?.distance_meters ?? '';
  const setDist = (o: string, d: string, v: string) => setRoutes((rs) => {
    const rest = rs.filter((r) => !(r.origin_code === o && r.destination_code === d));
    const n = Number(v);
    return v !== '' && n > 0 ? [...rest, { origin_code: o, destination_code: d, distance_meters: n }] : rest;
  });

  // ----- people per point
  const peopleOf = (code: string) => asg.map((r, i) => ({ r, i })).filter((x) => x.r.point_code === code);
  const addPerson = (code: string, userId: string) => userId && !asg.some((r) => r.point_code === code && r.user_id === userId) && setAsg([...asg, { user_id: userId, point_code: code, period_start: '', period_end: '' }]);

  const createPerson = () => run(async () => {
    if (!person.point) throw new Error(pick(lang, 'Choose the point this person will count at.', 'ایستگاهی را که این فرد در آن شمارش می‌کند انتخاب کنید.'));
    const u = await api<{ id: string }>('POST', '/users', { username: person.username.trim().toLowerCase(), full_name: person.full_name.trim(), role: 'OBSERVER', password: person.password });
    setAsg((a) => [...a, { user_id: u.id, point_code: person.point, period_start: '', period_end: '' }]);
    setPerson({ full_name: '', username: '', password: '', point: person.point });
    await loadObservers();
  }, pick(lang, 'Account created and placed at the point. Press "Save everything" to confirm the assignment.', 'حساب ساخته شد و در ایستگاه قرار گرفت. برای نهایی‌شدن «ذخیرهٔ همه» را بزنید.'));

  const saveAll = () => run(async () => {
    const codes = new Set(points.map((p) => p.code));
    await api('PUT', `/studies/${study!.id}/points`, {
      points: points.map((p) => ({ code: p.code.trim().toUpperCase(), map_id: p.map_id ?? firstMap, point_type: p.point_type, description: p.description, x_percent: p.x_percent, y_percent: p.y_percent })),
      routes: routes.filter((r) => codes.has(r.origin_code) && codes.has(r.destination_code)),
    });
    await api('PUT', `/studies/${study!.id}/assignments`, { assignments: asg.filter((a) => a.user_id && codes.has(a.point_code)).map((a) => ({ user_id: a.user_id, point_code: a.point_code, period_start: a.period_start ? zonedToUtcIso(a.period_start, tz) ?? null : null, period_end: a.period_end ? zonedToUtcIso(a.period_end, tz) ?? null : null })) });
    await onChanged(study!.id);
    setTick((t) => t + 1); // reload the local edit state only AFTER the fresh study has arrived (same render)
    await loadObservers();
  }, pick(lang, 'Saved: points, distances and people', 'ذخیره شد: ایستگاه‌ها، مسافت‌ها و افراد'));

  const sheetRows = useMemo(() => points.map((p) => ({ p, people: peopleOf(p.code).map((x) => nameOf(x.r.user_id)).filter(Boolean) as AccountRow[] })), [points, asg, observers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="study-setup">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 print:hidden">
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
              <div className="flex flex-wrap items-end gap-4 text-xs">
                <label className="space-y-1"><span className="text-slate-400 block">{pick(lang, 'Status', 'وضعیت')}</span>
                  <select value={study.status} onChange={(e) => patch({ status: e.target.value })} className={inputCls} data-testid="study-status">{['DRAFT', 'ACTIVE', 'COMPLETED'].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="space-y-1"><span className="text-slate-400 block">{pick(lang, 'Retention (days after study date; empty = keep)', 'نگهداری (روز پس از تاریخ طرح؛ خالی = دائم)')}</span>
                  <input type="number" min={1} defaultValue={study.retention_days ?? ''} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== study.retention_days) void patch({ retention_days: v }); }} className={`${inputCls} w-40`} /></label>
                <label className="flex items-center gap-2 text-slate-200 pb-2"><input type="checkbox" checked={study.audio_enabled} onChange={(e) => patch({ audio_enabled: e.target.checked })} data-testid="audio-toggle" />
                  {pick(lang, 'Voice clip for every passage (evidence the supervisor can replay)', 'کلیپ صوتی برای هر تردد (مدرکی که سرپرست می‌تواند دوباره بشنود)')}</label>
              </div>
            </section>

            <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3" data-testid="maps-panel">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-teal-400" />{pick(lang, '1. Road-map sections', '۱. بخش‌های نقشهٔ راه')}</h3>
              <p className="text-[11px] text-slate-400">{pick(lang, 'Upload one image per part of the road network (PNG, JPG or SVG; large images are scaled down automatically). Then mark the entries and exits of each part below.', 'برای هر بخش از شبکهٔ راه یک تصویر بارگذاری کنید (PNG، JPG یا SVG؛ تصویرهای بزرگ خودکار کوچک می‌شوند). سپس ورودی‌ها و خروجی‌های هر بخش را پایین‌تر مشخص کنید.')}</p>
              <div className="flex flex-wrap gap-2" role="tablist">
                {maps.map((m) => (
                  <button key={m.id} role="tab" aria-selected={m.id === activeMap?.id} onClick={() => setMapId(m.id)} data-testid={`map-tab-${m.name}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${m.id === activeMap?.id ? 'bg-teal-500 text-slate-950 border-teal-400' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>{m.name}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <input aria-label="New section name" placeholder={pick(lang, 'New section name', 'نام بخش جدید')} value={newMapName} onChange={(e) => setNewMapName(e.target.value)} className={`${inputCls} w-48`} data-testid="new-map-name" />
                <button onClick={() => addMap()} disabled={busy || maps.length >= 8} className={`${btn} bg-slate-800 border border-slate-700 text-slate-200`} data-testid="add-map"><Plus className="w-4 h-4" />{pick(lang, 'Add section', 'افزودن بخش')}</button>
                <label className={`${btn} bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer`}><ImagePlus className="w-4 h-4 text-teal-400" />{pick(lang, 'Add section with image', 'افزودن بخش با تصویر')}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => { void addMap(e.target.files?.[0]); e.target.value = ''; }} data-testid="map-add-upload" /></label>
                {activeMap && <>
                  <label className={`${btn} bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer`}><ImagePlus className="w-4 h-4 text-teal-400" />{pick(lang, 'Upload / replace image of this section', 'بارگذاری / جایگزینی تصویر این بخش')}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={(e) => { void replaceImage(activeMap, e.target.files?.[0]); e.target.value = ''; }} data-testid="map-upload" /></label>
                  {activeMap.image_url && <button onClick={() => run(async () => { await api('PATCH', `/studies/${study.id}/maps/${activeMap.id}`, { image: null }); await onChanged(study.id); }, pick(lang, 'Image removed (grid shown)', 'تصویر حذف شد (شبکه نمایش داده می‌شود)'))} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300`}>{pick(lang, 'Use grid instead', 'استفاده از شبکه')}</button>}
                  {maps.length > 1 && <button onClick={() => { if (window.confirm(pick(lang, 'Delete this section? Its points move to the first remaining section.', 'این بخش حذف شود؟ ایستگاه‌هایش به اولین بخش باقی‌مانده منتقل می‌شوند.'))) void run(async () => { await api('DELETE', `/studies/${study.id}/maps/${activeMap.id}`); await onChanged(study.id); setTick((t) => t + 1); }, pick(lang, 'Section deleted', 'بخش حذف شد')); }} className={`${btn} bg-rose-900/60 border border-rose-800 text-rose-100`}><Trash2 className="w-4 h-4" />{pick(lang, 'Delete section', 'حذف بخش')}</button>}
                </>}
              </div>
              {activeMap && <label className="text-xs text-slate-400 flex items-center gap-2">{pick(lang, 'Section name', 'نام بخش')}
                <input key={activeMap.id} defaultValue={activeMap.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== activeMap.name) void run(async () => { await api('PATCH', `/studies/${study.id}/maps/${activeMap.id}`, { name: v }); await onChanged(study.id); }, pick(lang, 'Renamed', 'نام تغییر کرد')); }} className={`${inputCls} w-48`} /></label>}

              <div ref={canvas} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} className="relative mx-auto bg-slate-950 rounded-2xl border-2 border-slate-800 overflow-hidden touch-none select-none" data-testid="map-canvas"
                style={(() => { const r = activeMap?.image_url ? ratios[activeMap.id] ?? 16 / 9 : 16 / 9; return { aspectRatio: String(r), width: `min(100%, ${Math.round(70 * r)}vh)` }; })()}>
                {activeMap?.image_url ? <img src={activeMap.image_url} alt={activeMap.name} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatios((r) => ({ ...r, [activeMap.id]: i.naturalWidth / i.naturalHeight })); }} className="absolute inset-0 w-full h-full object-fill pointer-events-none" /> : (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" aria-hidden>
                    <defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern></defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#334155" strokeWidth="24" /><line x1="0" y1="50%" x2="100%" y2="50%" stroke="#334155" strokeWidth="24" />
                  </svg>
                )}
                {points.filter((p) => onMap(p, activeMap?.id ?? null)).map((p) => (
                  <button key={p.code} type="button" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(p.code); }} aria-label={`${p.code} ${p.point_type}`} data-testid={`marker-${p.code}`}
                    style={{ left: `${p.x_percent}%`, top: `${p.y_percent}%` }} className="absolute -translate-x-1/2 -translate-y-[12px] flex flex-col items-center cursor-grab active:cursor-grabbing">
                    <span className={`w-6 h-6 border-2 border-white shadow-lg ${p.point_type === 'ENTRY' ? 'rounded-full bg-emerald-500' : 'rotate-45 bg-indigo-500'}`} />
                    <span className="mt-1 text-[10px] font-mono font-black bg-slate-900/90 px-1.5 rounded text-white whitespace-nowrap">{p.code}{peopleOf(p.code)[0] ? ` · ${nameOf(peopleOf(p.code)[0].r.user_id)?.full_name.split(' ')[0] ?? ''}` : ''}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-4"><span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-full bg-emerald-400" />{pick(lang, 'Entry', 'ورودی')}</span><span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rotate-45 bg-indigo-400" />{pick(lang, 'Exit', 'خروجی')}</span><span>{pick(lang, 'Drag a marker to place it on the map.', 'نشانگر را بکشید تا روی نقشه جابه‌جا شود.')}</span></p>
            </section>

            <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3" data-testid="points-panel">
              <h3 className="text-sm font-bold text-white">{pick(lang, '2. Entries and exits, and the person counting at each', '۲. ورودی‌ها و خروجی‌ها و فرد شمارشگر هر کدام')}</h3>
              <div className="flex gap-2">
                <button onClick={() => addPoint('ENTRY')} className={`${btn} bg-emerald-600 text-white`} data-testid="add-entry"><Plus className="w-3.5 h-3.5" />{pick(lang, 'Entry on this section', 'ورودی در این بخش')}</button>
                <button onClick={() => addPoint('EXIT')} className={`${btn} bg-indigo-600 text-white`} data-testid="add-exit"><Plus className="w-3.5 h-3.5" />{pick(lang, 'Exit on this section', 'خروجی در این بخش')}</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {points.map((p, i) => (
                  <div key={i} className="rounded-2xl bg-slate-950 border border-slate-800 p-3 space-y-2" data-testid={`point-card-${p.code}`}>
                    <div className="grid grid-cols-[4.5rem_1fr_auto] gap-2 items-center">
                      <input aria-label="Code" value={p.code} maxLength={12} onChange={(e) => setPoint(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} className={`${inputCls} font-mono`} data-testid={`point-code-${i}`} />
                      <input aria-label="Description" placeholder={pick(lang, 'Description (e.g. north entrance)', 'توضیح (مثلاً ورودی شمالی)')} value={p.description} onChange={(e) => setPoint(i, { description: e.target.value })} className={inputCls} />
                      <button onClick={() => removePoint(i)} aria-label="Remove" className="p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select aria-label="Type" value={p.point_type} onChange={(e) => setPoint(i, { point_type: e.target.value as PointType })} className={inputCls}><option value="ENTRY">{pick(lang, 'ENTRY', 'ورودی (ENTRY)')}</option><option value="EXIT">{pick(lang, 'EXIT', 'خروجی (EXIT)')}</option></select>
                      <select aria-label="Section" value={p.map_id ?? firstMap ?? ''} onChange={(e) => setPoint(i, { map_id: e.target.value })} className={inputCls}>{maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                    </div>
                    <div className="space-y-1.5">
                      {peopleOf(p.code).map(({ r, i: ai }) => (
                        <div key={ai} className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-200 flex-1 truncate" data-testid={`person-${p.code}`}>{nameOf(r.user_id)?.full_name ?? '?'} <span className="font-mono text-slate-400">@{nameOf(r.user_id)?.username}</span></span>
                          <details className="text-[10px] text-slate-400"><summary className="cursor-pointer">{pick(lang, 'shift', 'شیفت')}</summary>
                            <div className="grid gap-1 mt-1"><input type="datetime-local" aria-label="From" value={r.period_start} onChange={(e) => setAsg(asg.map((x, k) => (k === ai ? { ...x, period_start: e.target.value } : x)))} className={inputCls} /><input type="datetime-local" aria-label="To" value={r.period_end} onChange={(e) => setAsg(asg.map((x, k) => (k === ai ? { ...x, period_end: e.target.value } : x)))} className={inputCls} /></div></details>
                          <button onClick={() => setAsg(asg.filter((_, k) => k !== ai))} aria-label="Remove person" className="text-slate-500 hover:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <select aria-label={`Add person at ${p.code}`} value="" onChange={(e) => addPerson(p.code, e.target.value)} className={inputCls} data-testid={`add-person-${p.code}`}>
                        <option value="">{peopleOf(p.code).length ? pick(lang, '+ another person (shift)', '+ فرد دیگر (شیفت)') : pick(lang, '+ choose the person counting here', '+ فرد شمارشگر این ایستگاه را انتخاب کنید')}</option>
                        {observers.filter((o) => !peopleOf(p.code).some((x) => x.r.user_id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.full_name} (@{o.username})</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 space-y-2" data-testid="quick-person">
                <h4 className="text-xs font-bold text-white flex items-center gap-2"><UserPlus className="w-4 h-4 text-teal-400" />{pick(lang, 'New person: create an account and place them at a point', 'فرد جدید: ساخت حساب و قراردادن در یک ایستگاه')}</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <input aria-label="Full name" placeholder={pick(lang, 'Full name', 'نام و نام خانوادگی')} value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} className={inputCls} data-testid="qp-name" />
                  <input aria-label="Username" placeholder={pick(lang, 'username (a-z, 0-9)', 'نام کاربری (لاتین)')} value={person.username} onChange={(e) => setPerson({ ...person, username: e.target.value.toLowerCase() })} className={inputCls} data-testid="qp-username" />
                  <input aria-label="Password" type="password" autoComplete="new-password" placeholder={pick(lang, 'password (min 8)', 'گذرواژه (حداقل ۸)')} value={person.password} onChange={(e) => setPerson({ ...person, password: e.target.value })} className={inputCls} data-testid="qp-password" />
                  <select aria-label="Point" value={person.point} onChange={(e) => setPerson({ ...person, point: e.target.value })} className={inputCls} data-testid="qp-point"><option value="">{pick(lang, 'Point…', 'ایستگاه…')}</option>{points.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}</select>
                  <button onClick={createPerson} disabled={busy || !person.full_name || !person.username || person.password.length < 8} className={`${btn} bg-slate-800 border border-slate-700 text-slate-200 justify-center`} data-testid="qp-create"><UserPlus className="w-4 h-4" />{pick(lang, 'Create', 'ساخت')}</button>
                </div>
              </div>
            </section>

            <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white">{pick(lang, '3. Route distances (metres, optional: needed only for journey speed)', '۳. مسافت مسیرها (متر، اختیاری: فقط برای سرعت سیر)')}</h3>
              {entries.length === 0 || exits.length === 0 ? <p className="text-xs text-slate-500">{pick(lang, 'Add at least one entry and one exit.', 'حداقل یک ورودی و یک خروجی اضافه کنید.')}</p> : (
                <div className="overflow-x-auto"><table className="text-xs"><thead><tr><th className="p-2" />{exits.map((x) => <th key={x.code} className="p-2 font-mono text-indigo-400">{x.code}</th>)}</tr></thead>
                  <tbody>{entries.map((e) => <tr key={e.code}><td className="p-2 font-mono text-emerald-400">{e.code}</td>{exits.map((x) => <td key={x.code} className="p-1"><input type="number" min={1} aria-label={`${e.code} to ${x.code}`} value={dist(e.code, x.code)} onChange={(ev) => setDist(e.code, x.code, ev.target.value)} className={`${inputCls} w-24`} data-testid={`dist-${e.code}-${x.code}`} /></td>)}</tr>)}</tbody></table></div>
              )}
            </section>

            <div className="sticky bottom-3 flex flex-wrap items-center gap-3 bg-slate-900/95 border border-slate-700 rounded-2xl p-3 shadow-2xl">
              <button onClick={saveAll} disabled={busy} className={`${btn} bg-teal-500 text-slate-950`} data-testid="save-all"><Save className="w-4 h-4" />{pick(lang, 'Save everything (points, distances, people)', 'ذخیرهٔ همه (ایستگاه‌ها، مسافت‌ها، افراد)')}</button>
              <button onClick={() => window.print()} className={`${btn} bg-slate-800 border border-slate-700 text-slate-200`} data-testid="print-sheet"><Printer className="w-4 h-4" />{pick(lang, 'Print team sheet', 'چاپ برگهٔ تیم میدانی')}</button>
              <span className="text-[11px] text-slate-400">{pick(lang, 'Set the study ACTIVE (above) when everyone is in place.', 'وقتی همه در جای خود هستند، طرح را ACTIVE کنید (بالا).')}</span>
            </div>
          </>
        )}
      </div>

      {study && (
        <section className="hidden print:block bg-white text-black p-8" data-testid="team-sheet" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
          <h1 className="text-xl font-black">{pick(lang, 'Field team sheet', 'برگهٔ تیم میدانی')} - {study.name}</h1>
          <p className="text-sm">{study.study_date} · {study.start_time}-{study.end_time} · {study.timezone}</p>
          <p className="text-sm mb-3">{pick(lang, 'Sign in at', 'ورود از نشانی')}: <b>{window.location.origin}</b> · {pick(lang, 'Open the "Field Collector" tab; your station is pinned at the top. Passwords are handed over separately.', 'تب «ثبت میدانی» را باز کنید؛ ایستگاه شما بالای صفحه قفل است. گذرواژه‌ها جداگانه تحویل داده می‌شوند.')}</p>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-gray-200">{[pick(lang, 'Point', 'ایستگاه'), pick(lang, 'Type', 'نوع'), pick(lang, 'Description', 'توضیح'), pick(lang, 'Map section', 'بخش نقشه'), pick(lang, 'Person (username)', 'فرد (نام کاربری)'), pick(lang, 'Signature', 'امضا')].map((h) => <th key={h} className="border border-black p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{sheetRows.map(({ p, people }) => (
              <tr key={p.code}><td className="border border-black p-2 font-mono font-bold">{p.code}</td><td className="border border-black p-2">{p.point_type === 'ENTRY' ? pick(lang, 'Entry', 'ورودی') : pick(lang, 'Exit', 'خروجی')}</td><td className="border border-black p-2">{p.description}</td>
                <td className="border border-black p-2">{maps.find((m) => m.id === (p.map_id ?? firstMap))?.name}</td><td className="border border-black p-2">{people.length ? people.map((u) => `${u.full_name} (${u.username})`).join('، ') : '—'}</td><td className="border border-black p-2 w-32" /></tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
};
