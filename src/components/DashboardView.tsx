import React from 'react';
import {
  Car,
  TrendingUp,
  MapPin,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  GitCompare,
  Layers,
  Users
} from 'lucide-react';
import { Study, VehicleObservation, User } from '../types';
import { Language, getT } from '../i18n';

interface DashboardViewProps {
  study: Study | null;
  lang: Language;
  currentUser: User | null;
  observations: VehicleObservation[];
  setActiveTab: (tab: string) => void;
  onResetSeedData: () => void;
  isSeeding: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  study,
  lang,
  currentUser,
  observations,
  setActiveTab,
  onResetSeedData,
  isSeeding,
}) => {
  const t = getT(lang);

  const entryCount = observations.filter((o) => o.point_type === 'ENTRY').length;
  const exitCount = observations.filter((o) => o.point_type === 'EXIT').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Hero Welcome & Quick Scenario Loader */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Transportation Engineering Platform
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {study?.study_date} • {study?.start_time} - {study?.end_time}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {study?.name || t.app_title}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              {study?.description}
            </p>
          </div>

          {/* Quick Scenario & Collector Triggers */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setActiveTab('collector')}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-xl shadow-emerald-500/25 active:scale-95"
            >
              <Car className="w-4 h-4" />
              <span>Launch Field Collector</span>
            </button>

            <button
              onClick={onResetSeedData}
              disabled={isSeeding}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 font-semibold text-xs transition active:scale-95"
              title="Loads the required acceptance test scenario (Plate 387 at E01 & X01)"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
              <span>{t.reset_seed_data}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase font-bold tracking-wider">Total Sightings</span>
            <Car className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-3xl font-black font-mono text-white mt-2">{observations.length}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Recorded events</p>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase font-bold tracking-wider">Inbound Entries</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p className="text-3xl font-black font-mono text-emerald-400 mt-2">{entryCount}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Gates E01, E02...</p>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase font-bold tracking-wider">Outbound Exits</span>
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          </div>
          <p className="text-3xl font-black font-mono text-indigo-400 mt-2">{exitCount}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Gates X01, X02...</p>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs uppercase font-bold tracking-wider">Cordon Stations</span>
            <MapPin className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-black font-mono text-teal-300 mt-2">
            {study?.points.length || 4}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Active checkpoints</p>
        </div>
      </div>

      {/* Interactive Quick Action Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          onClick={() => setActiveTab('map')}
          className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl hover:border-teal-500/40 cursor-pointer transition group"
        >
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <MapPin className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-teal-300 transition flex items-center justify-between">
            <span>{t.nav_schematic_map}</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Configure cordon entry and exit gates (E01, E02, X01, X02) and set route distances for speed estimation.
          </p>
        </div>

        <div
          onClick={() => setActiveTab('matching')}
          className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl hover:border-emerald-500/40 cursor-pointer transition group"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <GitCompare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition flex items-center justify-between">
            <span>{t.nav_matching}</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Execute the Python 3.10 temporal matching engine, review journey speeds, and resolve ambiguous candidates.
          </p>
        </div>

        <div
          onClick={() => setActiveTab('od_matrix')}
          className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl hover:border-indigo-500/40 cursor-pointer transition group"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition flex items-center justify-between">
            <span>{t.nav_od_matrix}</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Explore the 2D Origin-Destination trip matrix heatmap, statistical percentiles (P15, P50, P85), and modal split.
          </p>
        </div>
      </div>

      {/* Live Stream of Observations */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            <span>Field Observations Stream</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {observations.length} total events recorded
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {observations.slice(0, 8).map((obs) => {
            const isEntry = obs.point_type === 'ENTRY';
            const time = new Date(obs.observation_timestamp).toLocaleTimeString();
            return (
              <div
                key={obs.id}
                className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-black text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {obs.plate_suffix}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                      isEntry ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    {obs.point_code} ({obs.point_type})
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{obs.vehicle_category}</span>
                  <span className="font-mono">{time}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
