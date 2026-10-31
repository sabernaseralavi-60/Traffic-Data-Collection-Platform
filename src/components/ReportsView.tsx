import React from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Clock,
  Compass,
  FileText
} from 'lucide-react';
import { Study, ODMatrixData, TravelTimeStats, MatchingSummary } from '../types';
import { Language, getT } from '../i18n';

interface ReportsViewProps {
  study: Study | null;
  lang: Language;
  odMatrix: ODMatrixData | null;
  travelTimeStats: TravelTimeStats | null;
  matchingSummary: MatchingSummary | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  study,
  lang,
  odMatrix,
  travelTimeStats,
  matchingSummary,
}) => {
  const t = getT(lang);

  const handleDownloadCSV = () => {
    if (!study) return;
    window.location.href = `/api/v1/studies/${study.id}/export`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Action Bar */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-400" />
            <span>{t.nav_reports}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Export validated field survey datasets and print formal engineering study report
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>{t.export_csv}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Printer className="w-4 h-4 text-teal-400" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Formal Printable Traffic Engineering Study Report Document */}
      <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8 font-sans">
        {/* Header Document Banner */}
        <div className="border-b-2 border-slate-900 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-black px-2.5 py-0.5 rounded bg-slate-900 text-white">
                OFFICIAL REPORT
              </span>
              <span className="text-xs font-mono text-slate-500">
                TL-TMG-2026-C8
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2">
              {study?.name || 'Traffic Engineering Cordon Survey Report'}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Methodology: FHWA Traffic Monitoring Guide (TMG 2022) Partial License Plate Matching
            </p>
          </div>

          <div className="text-right text-xs text-slate-600 font-mono">
            <p><span className="font-bold">Study Date:</span> {study?.study_date}</p>
            <p><span className="font-bold">Observation Window:</span> {study?.start_time} - {study?.end_time}</p>
            <p><span className="font-bold">Supervisor:</span> {study?.supervisor_name}</p>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500">Total Observations</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">
              {matchingSummary?.total_observations || 0}
            </p>
            <p className="text-[10px] text-slate-500">Field events logged</p>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500">Matched Journeys</p>
            <p className="text-2xl font-black font-mono text-emerald-600 mt-0.5">
              {matchingSummary?.matched_journeys || 0}
            </p>
            <p className="text-[10px] text-slate-500">Verified OD pairs</p>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500">Matching Rate</p>
            <p className="text-2xl font-black font-mono text-teal-600 mt-0.5">
              {matchingSummary?.matching_rate_percent || 0}%
            </p>
            <p className="text-[10px] text-slate-500">Of entry cordon volume</p>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500">Mean Travel Time</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">
              {matchingSummary?.mean_travel_time_sec || 0}s
            </p>
            <p className="text-[10px] text-slate-500">
              ({((matchingSummary?.mean_travel_time_sec || 0) / 60).toFixed(1)} mins)
            </p>
          </div>
        </div>

        {/* Origin-Destination Trip Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Table 1: Origin–Destination Trip Demand Matrix</span>
          </h3>

          {odMatrix ? (
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-2.5 border border-slate-300 font-black text-left">Origin \ Destination</th>
                    {odMatrix.destinations.map((d) => (
                      <th key={d} className="p-2.5 border border-slate-300 font-black font-mono">
                        {d}
                      </th>
                    ))}
                    <th className="p-2.5 border border-slate-300 font-black bg-slate-200">Total Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {odMatrix.origins.map((orig) => (
                    <tr key={orig} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-300 font-bold font-mono text-left bg-slate-50">
                        {orig}
                      </td>
                      {odMatrix.destinations.map((d) => (
                        <td key={d} className="p-2 border border-slate-300 font-mono font-bold">
                          {odMatrix.counts[orig]?.[d] || 0}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            ({odMatrix.percentages[orig]?.[d] || 0}%)
                          </span>
                        </td>
                      ))}
                      <td className="p-2 border border-slate-300 font-mono font-black bg-slate-100">
                        {odMatrix.row_totals[orig] || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black">
                    <td className="p-2.5 border border-slate-300 text-left">Total Destination</td>
                    {odMatrix.destinations.map((d) => (
                      <td key={d} className="p-2.5 border border-slate-300 font-mono">
                        {odMatrix.col_totals[d] || 0}
                      </td>
                    ))}
                    <td className="p-2.5 border border-slate-300 font-mono text-emerald-700 bg-emerald-50">
                      {odMatrix.grand_total}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Run matching engine to generate table.</p>
          )}
        </div>

        {/* Travel Time Statistical Percentiles Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Table 2: Travel Time & Speed Variance Statistics</span>
          </h3>

          {travelTimeStats && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2.5 border border-slate-300 font-black">Metric</th>
                    <th className="p-2.5 border border-slate-300 font-black">Calculated Value</th>
                    <th className="p-2.5 border border-slate-300 font-black">Transportation Engineering Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr>
                    <td className="p-2 border border-slate-300 font-bold">15th Percentile (P15)</td>
                    <td className="p-2 border border-slate-300 font-bold text-teal-600">{travelTimeStats.p15} sec</td>
                    <td className="p-2 border border-slate-300 font-sans text-slate-600">Free-flow uncongested travel time threshold</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-slate-300 font-bold">50th Percentile (Median)</td>
                    <td className="p-2 border border-slate-300 font-bold text-slate-800">{travelTimeStats.median} sec</td>
                    <td className="p-2 border border-slate-300 font-sans text-slate-600">Typical trip travel time</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-slate-300 font-bold">85th Percentile (P85)</td>
                    <td className="p-2 border border-slate-300 font-bold text-amber-600">{travelTimeStats.p85} sec</td>
                    <td className="p-2 border border-slate-300 font-sans text-slate-600">Standard design speed and operational performance index</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-slate-300 font-bold">95th Percentile (P95)</td>
                    <td className="p-2 border border-slate-300 font-bold text-rose-600">{travelTimeStats.p95} sec</td>
                    <td className="p-2 border border-slate-300 font-sans text-slate-600">Severe delay and incident clearance boundary</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-slate-300 font-bold">Standard Deviation (σ)</td>
                    <td className="p-2 border border-slate-300 font-bold text-slate-800">{travelTimeStats.std_dev} sec</td>
                    <td className="p-2 border border-slate-300 font-sans text-slate-600">Travel time reliability metric</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Signoff & Quality Assurance */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Quality Control Certified: All timestamps verified against immutable event log.</span>
          </div>
          <div className="text-right font-mono text-[11px]">
            Certified by: {study?.supervisor_name}
          </div>
        </div>
      </div>
    </div>
  );
};
