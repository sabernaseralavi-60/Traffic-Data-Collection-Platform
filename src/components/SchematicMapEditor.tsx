import React, { useState } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Save,
  Route,
  ArrowRight,
  Info,
  CheckCircle2,
  Compass
} from 'lucide-react';
import { Study, ObservationPoint, RouteDistance } from '../types';
import { Language, getT } from '../i18n';

interface SchematicMapEditorProps {
  study: Study | null;
  lang: Language;
  onUpdateStudy: (updated: Study) => void;
}

export const SchematicMapEditor: React.FC<SchematicMapEditorProps> = ({
  study,
  lang,
  onUpdateStudy,
}) => {
  const t = getT(lang);

  const [points, setPoints] = useState<ObservationPoint[]>(study?.points || []);
  const [routes, setRoutes] = useState<RouteDistance[]>(study?.routes || []);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Point Form Modal/State
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const [newDesc, setNewDesc] = useState('');

  if (!study) {
    return <div className="p-8 text-center text-slate-400">No active study selected.</div>;
  }

  const handleAddPoint = () => {
    if (!newCode.trim()) return;
    const cleanCode = newCode.trim().toUpperCase();
    if (points.some((p) => p.code === cleanCode)) {
      alert(`Point code ${cleanCode} already exists!`);
      return;
    }

    const newPoint: ObservationPoint = {
      id: `p-${Date.now()}`,
      code: cleanCode,
      point_type: newType,
      description: newDesc.trim() || `${newType === 'ENTRY' ? 'Inbound' : 'Outbound'} Cordon Gate`,
      x_percent: newType === 'ENTRY' ? 20 : 80,
      y_percent: Math.floor(Math.random() * 60) + 20,
    };

    const updated = [...points, newPoint];
    setPoints(updated);
    setNewCode('');
    setNewDesc('');
  };

  const handleDeletePoint = (id: string) => {
    setPoints(points.filter((p) => p.id !== id));
    if (selectedPointId === id) setSelectedPointId(null);
  };

  const handleUpdateCoordinate = (id: string, x: number, y: number) => {
    setPoints(
      points.map((p) =>
        p.id === id
          ? {
              ...p,
              x_percent: Math.max(5, Math.min(95, x)),
              y_percent: Math.max(5, Math.min(95, y)),
            }
          : p
      )
    );
  };

  const handleUpdateDistance = (origin: string, dest: string, distMeters: number) => {
    const existingIdx = routes.findIndex(
      (r) => r.origin_code === origin && r.destination_code === dest
    );
    if (existingIdx !== -1) {
      const copy = [...routes];
      copy[existingIdx].distance_meters = distMeters;
      setRoutes(copy);
    } else {
      setRoutes([...routes, { origin_code: origin, destination_code: dest, distance_meters: distMeters }]);
    }
  };

  const handleSaveToServer = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/studies/${study.id}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, routes }),
      });
      if (res.ok) {
        const updatedStudy = await res.json();
        onUpdateStudy(updatedStudy);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save study points:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const entryPoints = points.filter((p) => p.point_type === 'ENTRY');
  const exitPoints = points.filter((p) => p.point_type === 'EXIT');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-teal-400" />
            <span>{t.map_title}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.map_subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
              <CheckCircle2 className="w-4 h-4" />
              <span>Configuration saved</span>
            </span>
          )}
          <button
            onClick={handleSaveToServer}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-lg shadow-teal-500/20 active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schematic Canvas (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-5 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">
              Schematic Intersection Cordon Network
            </span>
            <span className="text-[11px] text-slate-500">
              Click node or use sliders below to position
            </span>
          </div>

          {/* Interactive SVG Schematic Surface */}
          <div className="relative w-full h-96 bg-slate-950 rounded-2xl border-2 border-slate-800 overflow-hidden shadow-inner flex items-center justify-center">
            {/* Background Road Schematic Grid & Arteries */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
              <defs>
                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* Arterial Corridors Layout */}
              <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="#334155" strokeWidth="24" strokeLinecap="round" />
              <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="#334155" strokeWidth="24" strokeLinecap="round" />
              <circle cx="50%" cy="50%" r="48" fill="#1e293b" stroke="#475569" strokeWidth="3" />
              <circle cx="50%" cy="50%" r="20" fill="#0f172a" />

              {/* Connecting flight paths from entries to exits */}
              {entryPoints.map((ent) =>
                exitPoints.map((ext) => (
                  <line
                    key={`${ent.code}-${ext.code}`}
                    x1={`${ent.x_percent}%`}
                    y1={`${ent.y_percent}%`}
                    x2={`${ext.x_percent}%`}
                    y2={`${ext.y_percent}%`}
                    stroke="#14b8a6"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.3"
                  />
                ))
              )}
            </svg>

            {/* Render Observation Nodes */}
            {points.map((pt) => {
              const isEntry = pt.point_type === 'ENTRY';
              const isSelected = selectedPointId === pt.id;

              return (
                <div
                  key={pt.id}
                  onClick={() => setSelectedPointId(pt.id)}
                  style={{ left: `${pt.x_percent}%`, top: `${pt.y_percent}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110 z-10 ${
                    isSelected ? 'scale-115 ring-4 ring-white' : ''
                  }`}
                >
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-xl border ${
                      isEntry
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-mono'
                        : 'bg-indigo-600 text-white border-indigo-400 font-mono'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                    <span>{pt.code}</span>
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-slate-900/90 text-[10px] text-slate-200 px-2 py-0.5 rounded border border-slate-700 shadow pointer-events-none">
                    {pt.point_type}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Node Coordinate Adjuster */}
          {selectedPointId && (
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-3">
              {(() => {
                const pt = points.find((p) => p.id === selectedPointId);
                if (!pt) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                      <span>Adjust Coordinates: {pt.code} ({pt.point_type})</span>
                      <span className="font-mono text-teal-400">
                        X: {pt.x_percent}% | Y: {pt.y_percent}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">X Position (%)</label>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          value={pt.x_percent}
                          onChange={(e) =>
                            handleUpdateCoordinate(pt.id, Number(e.target.value), pt.y_percent)
                          }
                          className="w-full accent-teal-400"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Y Position (%)</label>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          value={pt.y_percent}
                          onChange={(e) =>
                            handleUpdateCoordinate(pt.id, pt.x_percent, Number(e.target.value))
                          }
                          className="w-full accent-teal-400"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Sidebar: Add Point & Points List */}
        <div className="space-y-4">
          {/* Add Point Form */}
          <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-teal-400" />
              <span>Add Observation Point</span>
            </h3>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Code</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. E03"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono font-bold focus:border-teal-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'ENTRY' | 'EXIT')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:border-teal-400 focus:outline-none"
                  >
                    <option value="ENTRY">ENTRY (Inbound)</option>
                    <option value="EXIT">EXIT (Outbound)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. South Gateway"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleAddPoint}
                className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition active:scale-95"
              >
                + Register Observation Station
              </button>
            </div>
          </div>

          {/* Current Points List */}
          <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Configured Points ({points.length})</span>
              <span className="text-[10px] text-teal-400 font-mono">
                {entryPoints.length} IN / {exitPoints.length} OUT
              </span>
            </h3>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {points.map((p) => {
                const isEntry = p.point_type === 'ENTRY';
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPointId(p.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      selectedPointId === p.id
                        ? 'bg-slate-800 border-teal-400'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                          isEntry ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'
                        }`}
                      >
                        {p.code}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-200">{p.description}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {p.point_type} • ({p.x_percent}%, {p.y_percent}%)
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePoint(p.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                      title="Delete point"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Route Distances Configuration for Journey Speed Estimation */}
      <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Route className="w-4 h-4 text-teal-400" />
              <span>{t.route_distances_title}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Distances between entry and exit points are used to derive average journey speeds: v = d / Δt.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {entryPoints.flatMap((ent) =>
            exitPoints.map((ext) => {
              const currentRoute = routes.find(
                (r) => r.origin_code === ent.code && r.destination_code === ext.code
              );
              const dist = currentRoute ? currentRoute.distance_meters : 2000;

              return (
                <div
                  key={`${ent.code}-${ext.code}`}
                  className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-200">
                    <span className="text-emerald-400">{ent.code}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-indigo-400">{ext.code}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="50"
                      min="100"
                      max="20000"
                      value={dist}
                      onChange={(e) =>
                        handleUpdateDistance(ent.code, ext.code, Number(e.target.value))
                      }
                      className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono font-semibold focus:border-teal-400 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400 font-mono">meters</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
