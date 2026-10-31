import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bike, Bus, Car, CheckCircle2, Clock, CloudOff, HelpCircle, Mic, MicOff, RotateCcw, Send, ShieldCheck, Trash2, Truck, Zap } from 'lucide-react';
import { api, ApiError, errorText } from '../api';
import { Assignment, Category, Study, User, VehicleObservation } from '../types';
import { Language, getT, pick } from '../i18n';
import { normalizePlateDigits, parsePersianSpokenDigits } from '../utils/plateNormalization';
import { discardQueued, QueuedObservation, retryErrors, saveOfflineObservation } from '../utils/offlineQueue';
import { blobToBase64, canRecordAudio, Clip, ClipRecorder, startClip } from '../utils/audio';
import { fmtTime } from '../utils/time';

interface Props {
  user: User;
  study: Study | null;
  assignments: Assignment[]; // this user's assignments in the active study
  categories: Category[];
  lang: Language;
  isOnline: boolean;
  serverObservations: VehicleObservation[]; // this user's accepted observations
  queued: QueuedObservation[]; // this device: pending + error items of this user
  onChanged: () => void; // refresh server list + queue status
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CAR: Car, TAXI: Car, PICKUP: Truck, VAN: Truck, LIGHT_TRUCK: Truck, HEAVY_TRUCK: Truck, BUS: Bus, MINIBUS: Bus, MOTORCYCLE: Bike,
};

export const FieldCollector: React.FC<Props> = ({ user, study, assignments, categories, lang, isOnline, serverObservations, queued, onChanged }) => {
  const t = getT(lang);
  const [pointCode, setPointCode] = useState<string>(() => localStorage.getItem('tl_point') || '');
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<string>(() => localStorage.getItem('tl_default_cat') || 'CAR');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const recorderRef = useRef<ClipRecorder | null>(null);
  const srFailedRef = useRef(false);
  const audioOn = !!study?.audio_enabled && canRecordAudio();
  const [clock, setClock] = useState('');
  const recognitionRef = useRef<any>(null);
  const lockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tz = study?.timezone || 'Asia/Tehran';

  const point = assignments.find((a) => a.point_code === pointCode) ?? assignments[0];
  useEffect(() => { if (point && point.point_code !== pointCode) setPointCode(point.point_code); }, [point, pointCode]);
  useEffect(() => { if (pointCode) localStorage.setItem('tl_point', pointCode); }, [pointCode]);

  useEffect(() => {
    const tick = () => setClock(fmtTime(new Date().toISOString(), tz, false, 'en'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  useEffect(() => { inputRef.current?.focus(); }, [pointCode]);
  useEffect(() => {
    if (!clip) { setClipUrl(null); return; }
    const u = URL.createObjectURL(clip.blob);
    setClipUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);

  const speechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  useEffect(() => {
    if (!speechSupported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'fa-IR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    // the recogniser ends by itself after the speech; the clip is closed with it. If recognition failed, recording continues until the observer stops it
    rec.onend = () => { if (!srFailedRef.current) void finishClip(); else setListening(!!recorderRef.current); };
    rec.onerror = (ev: any) => { srFailedRef.current = true; setListening(!!recorderRef.current); setNotice({ kind: 'warn', text: pick(lang, `Speech error: ${ev.error}. Use the keypad.`, `خطای تشخیص گفتار: ${ev.error}. از صفحه‌کلید استفاده کنید.`) }); };
    rec.onresult = (ev: any) => {
      const heard = ev.results[0][0].transcript as string;
      const digits = parsePersianSpokenDigits(heard);
      if (digits) { setPlate(digits.slice(-3)); setNotice({ kind: 'ok', text: pick(lang, `Heard "${heard}" → ${digits.slice(-3)} (check, then record)`, `شنیده شد «${heard}» ← ${digits.slice(-3)} (بررسی کنید و ثبت بزنید)`) }); }
      else setNotice({ kind: 'warn', text: pick(lang, `No digits found in "${heard}"`, `رقمی در «${heard}» پیدا نشد`) });
    };
    recognitionRef.current = rec;
    return () => { try { rec.abort(); } catch { /* ignore */ } };
  }, [speechSupported, lang]);

  const finishClip = async () => {
    const r = recorderRef.current;
    recorderRef.current = null;
    setListening(false);
    if (r) setClip(await r.stop());
  };

  const toggleVoice = async () => {
    const rec = recognitionRef.current;
    if (listening) {
      try { rec?.stop(); } catch { /* not running */ }
      await finishClip();
      return;
    }
    srFailedRef.current = false;
    setClip(null);
    if (audioOn) {
      try {
        recorderRef.current = await startClip((c) => { recorderRef.current = null; setListening(false); setClip(c); try { rec?.stop(); } catch { /* done */ } });
        setListening(true);
      } catch {
        setNotice({ kind: 'warn', text: pick(lang, 'The microphone is not available for recording; you can still type the digits.', 'میکروفن برای ضبط در دسترس نیست؛ همچنان می‌توانید رقم‌ها را تایپ کنید.') });
      }
    }
    if (rec) { try { rec.start(); } catch { /* already started */ } }
  };

  const press = (d: string) => setPlate((p) => (p.length < 3 ? p + d : p));
  const labelOf = (code: string) => { const c = categories.find((x) => x.code === code); return c ? (lang === 'fa' ? c.label_fa : c.label_en) : code; };

  const canRecord = !!study && !!point && study.status === 'ACTIVE';

  const record = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (lockRef.current || !study || !point) return; // client-side submission lock
    const suffix = normalizePlateDigits(plate);
    if (suffix.length !== 3) { setNotice({ kind: 'warn', text: pick(lang, 'Enter exactly 3 digits (e.g. 042).', 'دقیقاً ۳ رقم وارد کنید (مثلاً ۰۴۲).') }); return; }
    lockRef.current = true;
    setBusy(true);
    const now = Date.now();
    const dup = [...serverObservations, ...queued].some((o) => o.point_code === point.point_code && o.plate_suffix === suffix && now - new Date(o.observation_timestamp).getTime() < 12_000);
    const clipB64 = clip ? await blobToBase64(clip.blob).catch(() => '') : '';
    const item: QueuedObservation = {
      id: crypto.randomUUID(), owner_user_id: user.id, study_id: study.id, point_code: point.point_code, point_type: point.point_type,
      plate_suffix: suffix, vehicle_category: category, observation_timestamp: new Date(now).toISOString(), idempotency_key: crypto.randomUUID(),
      ...(clipB64 ? { audio_b64: clipB64, audio_mime: clip!.mime, audio_ms: clip!.ms } : {}),
      sync_status: 'PENDING', queued_at: now,
    };
    try {
      if (!isOnline) throw new ApiError(0, 'offline', 'network');
      await api('POST', '/observations', { study_id: item.study_id, point_code: item.point_code, plate_suffix: suffix, vehicle_category: category, observed_at: item.observation_timestamp, idempotency_key: item.idempotency_key, ...(clipB64 ? { audio_b64: clipB64, audio_mime: clip!.mime, audio_ms: clip!.ms } : {}) });
      setNotice({ kind: dup ? 'warn' : 'ok', text: (dup ? t.duplicate_warning + ' ' : '') + pick(lang, `Recorded #${suffix} at ${point.point_code}`, `ثبت شد #${suffix} در ${point.point_code}`) });
    } catch (err) {
      const transient = err instanceof ApiError && (err.status === 0 || err.status >= 500 || err.status === 401 || err.status === 429);
      if (transient) {
        await saveOfflineObservation(item); // never lose a sighting to a connectivity problem
        setNotice({ kind: 'warn', text: pick(lang, `Saved on this device #${suffix}; it will upload when the connection returns.`, `روی همین دستگاه ذخیره شد #${suffix}؛ با برگشت اتصال ارسال می‌شود.`) });
      } else {
        setNotice({ kind: 'error', text: pick(lang, 'Not recorded: ', 'ثبت نشد: ') + errorText(err) });
        lockRef.current = false;
        setBusy(false);
        return;
      }
    }
    setPlate('');
    setClip(null);
    onChanged();
    lockRef.current = false;
    setBusy(false);
    inputRef.current?.focus();
  };

  const undo = async (o: { id: string; pending?: boolean }) => {
    try {
      if (o.pending) await discardQueued(user.id, o.id);
      else await api('POST', `/observations/${o.id}/void`, { reason: 'undo by observer' });
      onChanged();
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    }
  };

  const recent = useMemo(() => {
    const q = queued.map((i) => ({ id: i.id, point_code: i.point_code, plate_suffix: i.plate_suffix, vehicle_category: i.vehicle_category, observation_timestamp: i.observation_timestamp, pending: true, error: i.sync_status === 'ERROR' ? i.error || 'rejected' : undefined }));
    const s = serverObservations.map((o) => ({ id: o.id, point_code: o.point_code, plate_suffix: o.plate_suffix, vehicle_category: o.vehicle_category, observation_timestamp: o.observation_timestamp, pending: false, error: undefined as string | undefined }));
    return [...q, ...s].filter((o) => !point || o.point_code === point.point_code).sort((a, b) => b.observation_timestamp.localeCompare(a.observation_timestamp)).slice(0, 10);
  }, [queued, serverObservations, point]);

  if (!study) return <p className="p-8 text-center text-slate-400">{pick(lang, 'No study selected.', 'طرحی انتخاب نشده است.')}</p>;
  if (!assignments.length) {
    return (
      <div className="max-w-xl mx-auto p-6" data-testid="no-assignment">
        <div className="rounded-2xl border border-amber-700/50 bg-amber-950/40 p-5 text-amber-200 text-sm space-y-1">
          <p className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{pick(lang, 'You are not assigned to an observation point in this study.', 'شما در این طرح به هیچ ایستگاهی اختصاص داده نشده‌اید.')}</p>
          <p className="text-xs text-amber-200/80">{pick(lang, 'Recording is disabled so that nothing is saved under the wrong location. Ask your administrator to assign you.', 'ثبت غیرفعال است تا چیزی در مکان اشتباه ذخیره نشود. از مدیر بخواهید شما را تخصیص دهد.')}</p>
        </div>
      </div>
    );
  }
  const isEntry = point!.point_type === 'ENTRY';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4" data-testid="collector">
      <div className={`rounded-2xl p-4 border ${isEntry ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-emerald-900/40 border-emerald-600/40' : 'bg-gradient-to-br from-indigo-950/80 via-slate-900 to-indigo-900/40 border-indigo-600/40'}`} data-testid="station-banner">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-black px-3 py-1 rounded-full ${isEntry ? 'bg-emerald-500 text-slate-950' : 'bg-indigo-500 text-white'}`}>{isEntry ? t.station_type_entry : t.station_type_exit}</span>
              <span className="text-2xl font-black font-mono text-white" data-testid="station-code">{point!.point_code}</span>
              {study.is_demo && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40">DEMO</span>}
            </div>
            <p className="text-xs text-slate-300 mt-1">{point!.description}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{study.name}</p>
          </div>
          <div className="text-end shrink-0">
            <div className="flex items-center justify-end gap-1.5 text-teal-300 font-mono font-bold text-sm"><Clock className="w-3.5 h-3.5 text-slate-400" />{clock}</div>
            <p className="text-[11px] text-slate-400">{user.full_name}</p>
            <p className={`text-[11px] font-semibold ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>{isOnline ? t.online : t.offline}</p>
          </div>
        </div>
        {assignments.length > 1 && (
          <div className="mt-3 flex gap-2 flex-wrap" role="group" aria-label={pick(lang, 'Your points', 'ایستگاه‌های شما')}>
            {assignments.map((a) => (
              <button key={a.point_code} type="button" onClick={() => setPointCode(a.point_code)} aria-pressed={a.point_code === point!.point_code}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${a.point_code === point!.point_code ? 'bg-teal-500 text-slate-950 border-teal-400' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>{a.point_code}</button>
            ))}
          </div>
        )}
      </div>

      {study.status !== 'ACTIVE' && (
        <p className="rounded-xl border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-200" data-testid="study-not-active">{pick(lang, `This study is ${study.status}: recording is disabled.`, `این طرح در وضعیت ${study.status} است؛ ثبت غیرفعال است.`)}</p>
      )}

      <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-4">
        <form onSubmit={record} className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-400" />{t.plate_suffix_label}</label>
          <input
            ref={inputRef} value={plate} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="387" autoComplete="off" dir="ltr" data-testid="plate-input" aria-label={t.plate_suffix_label}
            onChange={(e) => setPlate(normalizePlateDigits(e.target.value).slice(0, 3))}
            className="w-full h-20 text-center font-mono text-5xl font-black tracking-widest bg-slate-950 border-2 border-slate-700 focus:border-teal-400 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void toggleVoice()} disabled={(!speechSupported && !audioOn) || !canRecord} title={speechSupported || audioOn ? '' : t.voice_unsupported} data-testid="voice-button"
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold border disabled:opacity-40 ${listening ? 'bg-rose-600 text-white border-rose-500 animate-pulse' : 'bg-slate-800 text-teal-300 border-teal-500/30'}`}>
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}<span>{listening ? (audioOn ? pick(lang, 'Recording… say the digits, tap to stop', 'در حال ضبط… رقم‌ها را بگویید، برای پایان لمس کنید') : t.listening) : audioOn ? pick(lang, 'Say digits (records this passage)', 'گفتن رقم‌ها (ضبط صدا)') : t.voice_input}</span>
            </button>
            <button type="submit" disabled={busy || plate.length !== 3 || !canRecord} data-testid="record-button"
              className={`flex-[2] flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm ${plate.length === 3 && canRecord ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95' : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'}`}>
              <Send className="w-4 h-4" /><span>{t.submit_button}</span>
            </button>
          </div>
          {!speechSupported && !audioOn && <p className="text-[11px] text-slate-500">{t.voice_unsupported}</p>}
          {!speechSupported && audioOn && <p className="text-[11px] text-slate-500">{pick(lang, 'This browser cannot turn speech into digits: the clip is still recorded - type the digits yourself.', 'این مرورگر گفتار را به رقم تبدیل نمی‌کند: صدا همچنان ضبط می‌شود - رقم‌ها را خودتان تایپ کنید.')}</p>}
          {clip && clipUrl && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300" data-testid="clip-row">
              <audio src={clipUrl} controls className="h-8 flex-1 min-w-0" />
              <span className="font-mono">{(clip.ms / 1000).toFixed(1)}s</span>
              <button type="button" onClick={() => setClip(null)} className="text-slate-400 hover:text-rose-300" aria-label={pick(lang, 'Discard clip', 'حذف صدا')}>✕</button>
            </div>
          )}
          {notice && (
            <div role="status" data-testid="notice" className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${notice.kind === 'ok' ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300' : notice.kind === 'warn' ? 'bg-amber-950/60 border-amber-700/60 text-amber-300' : 'bg-rose-950/60 border-rose-700/60 text-rose-200'}`}>
              {notice.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}<span>{notice.text}</span>
            </div>
          )}
        </form>

        <div dir="ltr" className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-800" aria-label="Keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} disabled={!canRecord} data-testid={`key-${d}`} className="h-14 rounded-2xl bg-slate-800 active:bg-teal-600 text-slate-100 font-mono text-2xl font-bold border border-slate-700 disabled:opacity-40">{d}</button>
          ))}
          <button type="button" onClick={() => setPlate('')} aria-label="Clear" className="h-14 rounded-2xl bg-slate-800 text-rose-400 font-bold border border-slate-700">C</button>
          <button type="button" onClick={() => press('0')} disabled={!canRecord} data-testid="key-0" className="h-14 rounded-2xl bg-slate-800 active:bg-teal-600 text-slate-100 font-mono text-2xl font-bold border border-slate-700 disabled:opacity-40">0</button>
          <button type="button" onClick={() => setPlate((p) => p.slice(0, -1))} aria-label="Backspace" className="h-14 rounded-2xl bg-slate-800 text-amber-400 font-bold text-lg border border-slate-700">⌫</button>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">{t.vehicle_category} <span className="normal-case font-normal text-slate-500">({pick(lang, 'optional', 'اختیاری')})</span></label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {categories.map((c) => {
              const Icon = ICONS[c.code] ?? HelpCircle;
              const on = category === c.code;
              return (
                <button key={c.code} type="button" aria-pressed={on} data-testid={`cat-${c.code}`} onClick={() => { setCategory(c.code); localStorage.setItem('tl_default_cat', c.code); }}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border ${on ? 'bg-teal-500 text-slate-950 border-teal-400' : 'bg-slate-800/80 text-slate-300 border-slate-700'}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{lang === 'fa' ? c.label_fa : c.label_en}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" />{t.recent_records}</h3>
          {queued.some((q) => q.sync_status === 'ERROR') && (
            <button type="button" onClick={async () => { await retryErrors(user.id); onChanged(); }} className="text-xs text-amber-300 flex items-center gap-1"><RotateCcw className="w-3 h-3" />{pick(lang, 'Retry failed', 'تلاش دوباره')}</button>
          )}
        </div>
        {recent.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">{t.no_recent}</p> : (
          <ul className="space-y-1.5" data-testid="recent-list">
            {recent.map((o) => (
              <li key={o.id} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${o.error ? 'bg-rose-950/40 border-rose-800/60' : 'bg-slate-950/60 border-slate-800'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-base font-extrabold text-white tracking-widest bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">{o.plate_suffix}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-teal-400">{labelOf(o.vehicle_category)}</span>
                    <span className="text-slate-500 text-[11px] ms-2 font-mono">{fmtTime(o.observation_timestamp, tz)}</span>
                    {o.pending && !o.error && <span className="ms-2 inline-flex items-center gap-1 text-amber-300 text-[11px]"><CloudOff className="w-3 h-3" />{pick(lang, 'pending upload', 'در انتظار ارسال')}</span>}
                    {o.error && <p className="text-rose-300 text-[11px] truncate">{o.error}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => undo(o)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40" title={t.undo_delete} aria-label={t.undo_delete}><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
