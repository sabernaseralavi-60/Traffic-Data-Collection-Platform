import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Car,
  Truck,
  Bus,
  Bike,
  HelpCircle,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { User, Study, VehicleObservation } from '../types';
import { Language, getT } from '../i18n';
import { normalizePlateDigits, parsePersianSpokenDigits } from '../utils/plateNormalization';
import { saveOfflineObservation, QueuedObservation } from '../utils/offlineQueue';

interface FieldCollectorProps {
  currentUser: User | null;
  activeStudy: Study | null;
  lang: Language;
  onObservationAdded: (obs: VehicleObservation) => void;
  recentObservations: VehicleObservation[];
  onDeleteObservation: (id: string) => void;
  isOnline: boolean;
  onRefreshQueue: () => void;
}

export const FieldCollector: React.FC<FieldCollectorProps> = ({
  currentUser,
  activeStudy,
  lang,
  onObservationAdded,
  recentObservations,
  onDeleteObservation,
  isOnline,
  onRefreshQueue,
}) => {
  const t = getT(lang);

  // Determine current observation point
  const assignedCode = currentUser?.assigned_point || 'E01';
  const currentPoint = activeStudy?.points.find((p) => p.code === assignedCode) || {
    id: 'p1',
    code: assignedCode,
    point_type: assignedCode.startsWith('E') ? 'ENTRY' : 'EXIT',
    description: assignedCode.startsWith('E') ? 'Inbound Arterial Gate' : 'Outbound Gate',
    x_percent: 50,
    y_percent: 50,
  };

  const [plateSuffix, setPlateSuffix] = useState<string>('');
  const [vehicleCategory, setVehicleCategory] = useState<string>('CAR');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [lastSubmissionTime, setLastSubmissionTime] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Time ticker
  const [currentTime, setCurrentTime] = useState<string>('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lang]);

  // Keep input focused for quick typing
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Web Speech API for Persian spoken digits
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'fa-IR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
          setIsListening(true);
          setSpeechError(null);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          const parsed = parsePersianSpokenDigits(transcript);
          if (parsed) {
            setPlateSuffix(parsed);
            setSuccessNotice(`Heard: "${transcript}" → ${parsed}`);
            setTimeout(() => setSuccessNotice(null), 3000);
          } else {
            setSpeechError(`Could not identify digits from: "${transcript}"`);
          }
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech error:', event.error);
          setIsListening(false);
          setSpeechError(`Speech error: ${event.error}`);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert(t.voice_unsupported);
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setSpeechError(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start speech:', err);
      }
    }
  };

  // Numpad key press
  const handleNumpadPress = (digit: string) => {
    if (plateSuffix.length < 3) {
      setPlateSuffix((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPlateSuffix((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPlateSuffix('');
    setWarningMessage(null);
  };

  // Submission logic with 1-2s speed, duplicate guard & offline fallback
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const normalized = normalizePlateDigits(plateSuffix);
    if (!normalized || normalized.length === 0) {
      setWarningMessage(t.plate_suffix_placeholder);
      return;
    }

    // Pad or trim to exactly 3 digits
    const finalSuffix = normalized.padStart(3, '0').slice(-3);
    const now = Date.now();
    const exactTimestampIso = new Date().toISOString();
    const idempotencyKey = `obs-${currentPoint.code}-${finalSuffix}-${now}`;

    // Duplicate prevention check: if exact same suffix was submitted within 10 seconds at this station
    const recentDuplicate = recentObservations.find(
      (o) =>
        o.point_code === currentPoint.code &&
        o.plate_suffix === finalSuffix &&
        now - new Date(o.observation_timestamp).getTime() < 12000
    );

    if (recentDuplicate) {
      setWarningMessage(t.duplicate_warning);
      setTimeout(() => setWarningMessage(null), 4000);
    } else {
      setWarningMessage(null);
    }

    setIsSubmitting(true);
    setLastSubmissionTime(now);

    const observationPayload: Partial<VehicleObservation> = {
      study_id: activeStudy?.id || 'study-01',
      point_code: currentPoint.code,
      point_type: currentPoint.point_type,
      plate_suffix: finalSuffix,
      vehicle_category: vehicleCategory,
      observation_timestamp: exactTimestampIso,
      observer_id: currentUser?.id || 'u-anon',
      idempotency_key: idempotencyKey,
    };

    if (isOnline) {
      try {
        const res = await fetch('/api/v1/observations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(observationPayload),
        });

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        onObservationAdded(data.observation);
        setSuccessNotice(`Recorded #${finalSuffix} [${currentPoint.code}]`);
      } catch (err) {
        console.warn('Network submission failed, routing to offline queue:', err);
        // Fallback to IndexedDB queue
        const offlineItem: QueuedObservation = {
          id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          study_id: activeStudy?.id || 'study-01',
          point_code: currentPoint.code,
          point_type: currentPoint.point_type,
          plate_suffix: finalSuffix,
          vehicle_category: vehicleCategory,
          observation_timestamp: exactTimestampIso,
          observer_id: currentUser?.id || 'u-anon',
          idempotency_key: idempotencyKey,
          sync_status: 'PENDING',
          queued_at: Date.now(),
        };

        await saveOfflineObservation(offlineItem);
        onRefreshQueue();
        onObservationAdded({
          ...offlineItem,
          observer_name: currentUser?.full_name,
        });
        setSuccessNotice(`Saved offline #${finalSuffix}`);
      }
    } else {
      // Offline mode direct queue
      const offlineItem: QueuedObservation = {
        id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        study_id: activeStudy?.id || 'study-01',
        point_code: currentPoint.code,
        point_type: currentPoint.point_type,
        plate_suffix: finalSuffix,
        vehicle_category: vehicleCategory,
        observation_timestamp: exactTimestampIso,
        observer_id: currentUser?.id || 'u-anon',
        idempotency_key: idempotencyKey,
        sync_status: 'PENDING',
        queued_at: Date.now(),
      };

      await saveOfflineObservation(offlineItem);
      onRefreshQueue();
      onObservationAdded({
        ...offlineItem,
        observer_name: currentUser?.full_name,
      });
      setSuccessNotice(`Saved locally (Offline) #${finalSuffix}`);
    }

    // Reset plate input for next vehicle
    setPlateSuffix('');
    setIsSubmitting(false);
    inputRef.current?.focus();
    setTimeout(() => setSuccessNotice(null), 2500);
  };

  const categories = [
    { id: 'CAR', label: t.category_car, icon: Car, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    { id: 'TAXI', label: t.category_taxi, icon: Car, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    { id: 'PICKUP', label: t.category_pickup, icon: Truck, color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
    { id: 'MOTORCYCLE', label: t.category_motorcycle, icon: Bike, color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
    { id: 'BUS', label: t.category_bus, icon: Bus, color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
    { id: 'HEAVY TRUCK', label: t.category_heavy_truck, icon: Truck, color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
    { id: 'OTHER', label: t.category_other, icon: HelpCircle, color: 'bg-slate-700/50 text-slate-300 border-slate-600' },
  ];

  const stationFilteredRecent = recentObservations
    .filter((o) => o.point_code === currentPoint.code)
    .slice(0, 8);

  const isEntry = currentPoint.point_type === 'ENTRY';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Station Context Banner */}
      <div
        className={`rounded-2xl p-4 shadow-lg border transition-all ${
          isEntry
            ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-emerald-900/40 border-emerald-600/40'
            : 'bg-gradient-to-br from-indigo-950/80 via-slate-900 to-indigo-900/40 border-indigo-600/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs uppercase font-extrabold px-3 py-1 rounded-full tracking-wider border shadow-sm ${
                  isEntry
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                    : 'bg-indigo-500 text-white border-indigo-400 font-black'
                }`}
              >
                {isEntry ? t.station_type_entry : t.station_type_exit}
              </span>
              <span className="text-xl font-black font-mono tracking-tight text-white">
                {currentPoint.code}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              {currentPoint.description}
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-bold text-sm text-teal-300">{currentTime}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {currentUser?.full_name || 'Field Observer'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Entry Card */}
      <div className="bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-800 space-y-4">
        {/* Plate Display Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{t.plate_suffix_label}</span>
            </label>
            {successNotice && (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{successNotice}</span>
              </span>
            )}
          </div>

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={plateSuffix}
              onChange={(e) => {
                const norm = normalizePlateDigits(e.target.value);
                setPlateSuffix(norm.slice(0, 3));
              }}
              placeholder="387"
              className="w-full h-20 text-center font-mono text-5xl font-black tracking-widest bg-slate-950 border-2 border-slate-700 focus:border-teal-400 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20 shadow-inner transition"
              autoFocus
            />

            {/* Clear Button */}
            {plateSuffix && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>

          {/* Voice Input Button (Persian Speech Recognition) */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition border ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700/80 text-teal-300 border-teal-500/30'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>{t.listening}</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-teal-400" />
                  <span>{t.voice_input}</span>
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !plateSuffix}
              className={`flex-2 flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm tracking-wide transition shadow-lg ${
                plateSuffix
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>{t.submit_button}</span>
            </button>
          </div>

          {speechError && (
            <p className="text-[11px] text-amber-400 bg-amber-950/40 p-2 rounded-lg border border-amber-800/40">
              {speechError}
            </p>
          )}

          {warningMessage && (
            <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{warningMessage}</span>
            </div>
          )}
        </form>

        {/* Rapid Touch Numpad (Optimized for 1-2s Field Entry) */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            {lang === 'fa' ? 'صفحه کلید سریع اعداد (لمسی)' : 'Rapid Touch Numpad'}
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumpadPress(digit)}
                className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-teal-600 active:text-white text-slate-100 font-mono text-2xl font-bold border border-slate-700/80 shadow-md transition transform active:scale-95 flex items-center justify-center"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-2xl bg-slate-800 hover:bg-rose-950/40 text-rose-400 font-bold text-xs uppercase tracking-wider border border-slate-700 transition active:scale-95 flex items-center justify-center"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleNumpadPress('0')}
              className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-teal-600 active:text-white text-slate-100 font-mono text-2xl font-bold border border-slate-700/80 shadow-md transition transform active:scale-95 flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-lg border border-slate-700 transition active:scale-95 flex items-center justify-center"
            >
              ⌫
            </button>
          </div>
        </div>

        {/* Vehicle Classification Selector */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            {t.vehicle_category}
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = vehicleCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setVehicleCategory(cat.id)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
                    isSelected
                      ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold shadow-md shadow-teal-500/20'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Observations at This Station */}
      <div className="bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{t.recent_records}</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {stationFilteredRecent.length} logged
          </span>
        </div>

        {stationFilteredRecent.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">{t.no_recent}</p>
        ) : (
          <div className="space-y-1.5">
            {stationFilteredRecent.map((obs) => {
              const timeStr = new Date(obs.observation_timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              });

              return (
                <div
                  key={obs.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-xs transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-extrabold text-white tracking-widest bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                      {obs.plate_suffix}
                    </span>
                    <div>
                      <span className="font-semibold text-teal-400">{obs.vehicle_category}</span>
                      <span className="text-slate-500 text-[11px] ml-2 font-mono">{timeStr}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteObservation(obs.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                    title={t.undo_delete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
