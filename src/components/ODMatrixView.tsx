import React, { useState } from 'react';
import {
  Layers,
  Clock,
  Gauge,
  TrendingUp,
  PieChart,
  Table,
  FileSpreadsheet,
  Route,
  Activity
} from 'lucide-react';
import { Study, ODMatrixData, TravelTimeStats, CategorySplit } from '../types';
import { Language, getT } from '../i18n';

interface ODMatrixViewProps {
  study: Study | null;
  lang: Language;
  odMatrix: ODMatrixData | null;
  travelTimeStats: TravelTimeStats | null;
  categorySplit: CategorySplit | null;
  onExportReport?: () => void;
}

export const ODMatrixView: React.FC<ODMatrixViewProps> = ({
  study,
  lang,
  odMatrix,
  travelTimeStats,
  categorySplit,
  onExportReport,
}) => {
  const t = getT(lang);
  const [viewMode, setViewMode] = useState<'COUNTS' | 'PERCENTAGES'>('COUNTS');

  if (!odMatrix) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center text-slate-400">
        Run vehicle matching engine to compute the Origin-Destination matrix.
      </div>
    );
  }

  // Helper for heatmap cell intensity
  const getCellColor = (count: number, maxVal: number) => {
    if (count === 0) return 'bg-slate-950/40 text-slate-600';
    const ratio = maxVal > 0 ? count / maxVal : 0;
    if (ratio > 0.6) return 'bg-emerald-500/30 text-emerald-300 font-extrabold border border-emerald-500/40';
    if (ratio > 0.3) return 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30';
    return 'bg-slate-800/80 text-slate-200 border border-slate-700/60';
  };

  // Find max cell count for scaling
  let maxCell = 1;
  odMatrix.origins.forEach((o) => {
    odMatrix.destinations.forEach((d) => {
      const val = odMatrix.counts[o]?.[d] || 0;
      if (val > maxCell) maxCell = val;
    });
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-400" />
            <span>{t.od_title}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.od_subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('COUNTS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'COUNTS'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vehicle Volumes (Veh)
            </button>
            <button
              onClick={() => setViewMode('PERCENTAGES')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'PERCENTAGES'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Share (%)
            </button>
          </div>

          {onExportReport && (
            <button
              onClick={onExportReport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t.export_excel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main OD Matrix Table Grid */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Table className="w-4 h-4 text-emerald-400" />
            <span>Origin–Destination Trip Matrix (Cordon Movement Counts)</span>
          </h3>
          <span className="text-xs font-mono font-bold text-teal-300">
            Grand Total: {odMatrix.grand_total} matched trips
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-xs font-black uppercase tracking-wider text-slate-400 bg-slate-950 border border-slate-800 rounded-tl-xl text-left">
                  Origin \ Destination
                </th>
                {odMatrix.destinations.map((d) => (
                  <th
                    key={d}
                    className="p-3 text-xs font-black font-mono text-indigo-400 bg-slate-950/80 border border-slate-800 min-w-[100px]"
                  >
                    <div>{d}</div>
                    <div className="text-[10px] text-slate-500 font-normal">EXIT</div>
                  </th>
                ))}
                <th className="p-3 text-xs font-black font-mono text-white bg-slate-950 border border-slate-800 rounded-tr-xl min-w-[100px]">
                  Row Total
                </th>
              </tr>
            </thead>
            <tbody>
              {odMatrix.origins.map((orig) => {
                const rowTot = odMatrix.row_totals[orig] || 0;
                return (
                  <tr key={orig}>
                    <td className="p-3 font-mono font-black text-xs text-emerald-400 bg-slate-950/60 border border-slate-800 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>{orig}</span>
                        <span className="text-[10px] text-slate-500 font-normal ml-1">(ENTRY)</span>
                      </div>
                    </td>

                    {odMatrix.destinations.map((dest) => {
                      const count = odMatrix.counts[orig]?.[dest] || 0;
                      const pct = odMatrix.percentages[orig]?.[dest] || 0;
                      return (
                        <td
                          key={dest}
                          className={`p-3 font-mono text-sm border border-slate-800/80 transition ${getCellColor(
                            count,
                            maxCell
                          )}`}
                        >
                          {viewMode === 'COUNTS' ? (
                            <div className="font-extrabold">{count}</div>
                          ) : (
                            <div className="font-extrabold">{pct}%</div>
                          )}
                          <div className="text-[10px] opacity-75">
                            {viewMode === 'COUNTS' ? `${pct}%` : `${count} veh`}
                          </div>
                        </td>
                      );
                    })}

                    <td className="p-3 font-mono font-black text-sm text-white bg-slate-950/80 border border-slate-800">
                      {rowTot}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="p-3 font-black text-xs text-white bg-slate-950 border border-slate-800 rounded-bl-xl text-left">
                  Column Total
                </td>
                {odMatrix.destinations.map((d) => (
                  <td
                    key={d}
                    className="p-3 font-mono font-black text-sm text-white bg-slate-950 border border-slate-800"
                  >
                    {odMatrix.col_totals[d] || 0}
                  </td>
                ))}
                <td className="p-3 font-mono font-black text-base text-teal-300 bg-slate-950 border-2 border-teal-500/40 rounded-br-xl">
                  {odMatrix.grand_total}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Travel Time Distribution & Statistical Percentiles */}
      {travelTimeStats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Statistical Percentiles Cards */}
          <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                <span>{t.travel_time_percentiles} (Statistical Variance)</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Sample Size N = {travelTimeStats.count}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.percentile_15}</p>
                <p className="text-2xl font-black font-mono text-teal-400 mt-1">{travelTimeStats.p15}s</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Free-flow conditions</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.percentile_50}</p>
                <p className="text-2xl font-black font-mono text-emerald-400 mt-1">{travelTimeStats.median}s</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Median traversal</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.percentile_85}</p>
                <p className="text-2xl font-black font-mono text-amber-400 mt-1">{travelTimeStats.p85}s</p>
                <p className="text-[10px] text-slate-500 mt-0.5">FHWA operational benchmark</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase font-semibold">{t.percentile_95}</p>
                <p className="text-2xl font-black font-mono text-rose-400 mt-1">{travelTimeStats.p95}s</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Heavy congestion threshold</p>
              </div>
            </div>

            {/* Travel Time Histogram Visualization */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-300">
                Travel Time Frequency Histogram
              </p>
              <div className="space-y-2">
                {travelTimeStats.histogram.map((bin, idx) => {
                  const maxBin = Math.max(...travelTimeStats.histogram.map((b) => b.count), 1);
                  const barWidth = `${(bin.count / maxBin) * 100}%`;
                  return (
                    <div key={idx} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-slate-400 font-mono text-[11px] shrink-0">
                        {bin.label}
                      </span>
                      <div className="flex-1 h-6 bg-slate-950 rounded-lg overflow-hidden p-0.5 border border-slate-800 flex items-center">
                        <div
                          style={{ width: barWidth }}
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded transition-all duration-500"
                        />
                      </div>
                      <span className="w-8 text-right font-mono font-bold text-slate-200 text-xs">
                        {bin.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Vehicle Category Split / Modal Distribution */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>{t.modal_split}</span>
            </h3>

            {categorySplit && (
              <div className="space-y-3">
                {Object.entries(categorySplit.counts).map(([cat, count]) => {
                  const pct = categorySplit.percentages[cat] || 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-300">{cat}</span>
                        <span className="font-mono text-teal-300">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-teal-400 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
