import ExcelJS from 'exceljs';

/** Spreadsheet formula-injection guard (text starting with = + - @ tab CR). */
export const safeCell = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export const localTime = (iso: string, tz: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
};

interface Input {
  study: { name: string; study_date: string; timezone: string; is_demo: boolean };
  report: any;
  observations: any[];
}

export async function buildWorkbook({ study, report, observations }: Input): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TrafficLab';
  wb.created = new Date();
  const tz = study.timezone;
  const bold = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };

  const sum = wb.addWorksheet('Summary');
  sum.addRows([
    ['Study', safeCell(study.name)],
    ['Study date', study.study_date],
    ['Time zone', tz],
    ['Data', study.is_demo ? 'DEMO (synthetic) data' : 'Field observations'],
    ['Method note', report.summary.method_note],
    [],
    ...Object.entries(report.summary).filter(([k]) => k !== 'method_note').map(([k, v]) => [k, v as any]),
  ]);
  sum.getColumn(1).width = 28; sum.getColumn(2).width = 90;
  sum.getColumn(1).font = { bold: true };

  const m = wb.addWorksheet('Matches');
  m.addRow(['Match ID', 'Plate suffix', 'Entry point', 'Exit point', 'Entry time (local)', 'Exit time (local)', 'Entry time (UTC)', 'Exit time (UTC)', 'Travel time (s)', 'Avg journey speed (km/h)', 'Match score (heuristic)', 'Category', 'Status']);
  for (const x of report.matches) {
    m.addRow([x.id, String(x.plate_suffix), safeCell(x.entry_point_code), safeCell(x.exit_point_code), localTime(x.entry_timestamp, tz), localTime(x.exit_timestamp, tz),
      x.entry_timestamp, x.exit_timestamp, x.travel_time_seconds, x.estimated_speed_kmh ?? null, x.match_score, safeCell(x.vehicle_category), x.match_status]);
  }
  m.getColumn(2).numFmt = '@';
  bold(m);
  m.columns.forEach((c) => { c.width = 18; });

  const a = wb.addWorksheet('Ambiguous');
  a.addRow(['Plate suffix', 'Entry point', 'Exit point', 'Entry time (local)', 'Exit time (local)', 'Travel time (s)', 'Match score (heuristic)']);
  for (const c of report.ambiguous) {
    for (const p of c.candidate_pairs) a.addRow([String(c.plate_suffix), safeCell(p.entry_point), safeCell(p.exit_point), localTime(p.entry_time, tz), localTime(p.exit_time, tz), p.travel_time_sec, p.match_score]);
  }
  bold(a);
  a.columns.forEach((c) => { c.width = 18; });

  const od = report.analytics.od_matrix;
  const o = wb.addWorksheet('OD matrix');
  o.addRow(['Origin \\ Destination', ...od.destinations, 'Total']);
  for (const org of od.origins) o.addRow([org, ...od.destinations.map((d: string) => od.counts[org][d]), od.row_totals[org]]);
  o.addRow(['Total', ...od.destinations.map((d: string) => od.col_totals[d]), od.grand_total]);
  bold(o);

  const c = wb.addWorksheet('Counts');
  const k = report.analytics.counts;
  c.addRow(['Interval start (local)', 'Entries', 'Exits', 'Total']);
  for (const b of k.by_interval) c.addRow([localTime(b.start, tz), b.entries, b.exits, b.total]);
  c.addRow([]);
  c.addRow(['By point']);
  for (const [p, n] of Object.entries(k.by_point)) c.addRow([p, n as number]);
  c.addRow([]);
  c.addRow(['By category']);
  for (const [p, n] of Object.entries(k.by_category)) c.addRow([safeCell(p), n as number, `${k.category_percent[p]}%`]);
  c.getColumn(1).width = 26;

  const t = report.analytics.travel_time_stats;
  const s = wb.addWorksheet('Travel time');
  s.addRows([['Statistic', 'Seconds'], ['Count', t.count], ['Mean', t.mean], ['Median', t.median], ['Std dev', t.std_dev], ['Min', t.min], ['Max', t.max], ['P15', t.p15], ['P85', t.p85], ['P95', t.p95]]);
  bold(s);
  if (report.analytics.route_speeds.length) {
    s.addRow([]);
    s.addRow(['Route', 'Distance (m)', 'Journeys', 'Mean travel time (s)', 'Mean journey speed (km/h)']);
    for (const r of report.analytics.route_speeds) s.addRow([r.route, r.distance_m, r.journeys, r.mean_travel_time_sec, r.mean_journey_speed_kmh]);
  }
  s.getColumn(1).width = 22;

  const raw = wb.addWorksheet('Observations');
  raw.addRow(['Observation ID', 'Point', 'Type', 'Plate suffix', 'Category', 'Observed (local)', 'Observed (UTC)', 'Observer']);
  for (const x of observations) raw.addRow([x.id, safeCell(x.point_code), x.point_type, String(x.plate_suffix), safeCell(x.vehicle_category), localTime(x.observed_at, tz), x.observed_at, safeCell(x.observer_name)]);
  raw.getColumn(4).numFmt = '@';
  bold(raw);
  raw.columns.forEach((col) => { col.width = 20; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
