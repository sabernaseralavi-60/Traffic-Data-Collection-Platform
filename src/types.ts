export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OBSERVER';
export type PointType = 'ENTRY' | 'EXIT';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
}

export interface Assignment {
  study_id: string;
  study_name: string;
  study_status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  timezone: string;
  is_demo: boolean;
  point_code: string;
  point_type: PointType;
  description: string;
  period_start: string | null;
  period_end: string | null;
}

export interface AccountRow extends User {
  active: boolean;
  created_at: string;
  assignments: { study_id: string; study_name: string; point_code: string }[];
}

export interface ObservationPoint {
  id?: string;
  code: string;
  map_id?: string | null;
  point_type: PointType;
  description: string;
  x_percent: number;
  y_percent: number;
}

export interface RouteDistance {
  origin_code: string;
  destination_code: string;
  distance_meters: number;
}

export interface StudyAssignment {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  point_code: string;
  period_start: string | null;
  period_end: string | null;
}

export interface StudySummary {
  id: string;
  name: string;
  description: string;
  study_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  supervisor_name: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  is_demo: boolean;
  observation_count: number;
  created_at: string;
}

export interface MapSection { id: string; name: string; sort_order: number; image_url: string | null }

export interface Study extends StudySummary {
  maps: MapSection[];
  audio_enabled: boolean;
  retention_days: number | null;
  points: ObservationPoint[];
  routes: RouteDistance[];
  assignments: StudyAssignment[];
}

export interface Category {
  code: string;
  label_en: string;
  label_fa: string;
  sort_order: number;
  active: boolean;
}

export interface VehicleObservation {
  id: string;
  study_id: string;
  point_code: string;
  point_type: PointType;
  plate_suffix: string | null; // null = voice-only passage: the digits are added later
  vehicle_category: string;
  vehicle_color?: string | null;
  observation_timestamp: string;
  observer_id: string;
  observer_name?: string;
  idempotency_key: string;
  created_at?: string;
  has_audio?: boolean;
  audio_ms?: number | null;
  suffix_source?: 'TYPED' | 'VOICE' | 'SUPERVISOR' | 'SUGGESTION';
  suggested_suffix?: string | null;
  suggested_source?: string | null;
  suggested_conf?: number | null;
  /** local only: queued on this device and not yet accepted by the server */
  pending?: boolean;
}

export type MatchStatus = 'MATCHED' | 'REVIEWED';

export interface MatchResult {
  id: string;
  study_id: string;
  plate_suffix: string;
  entry_observation_id: string;
  exit_observation_id: string;
  entry_point_code: string;
  exit_point_code: string;
  entry_timestamp: string;
  exit_timestamp: string;
  travel_time_seconds: number;
  estimated_speed_kmh?: number | null;
  match_score: number;
  match_status: MatchStatus;
  vehicle_category: string;
  notes?: string;
}

export interface AmbiguousPair {
  entry_id: string;
  exit_id: string;
  entry_point: string;
  exit_point: string;
  entry_time: string;
  exit_time: string;
  travel_time_sec: number;
  match_score: number;
  speed_kmh?: number | null;
  vehicle_category: string;
}

export interface AmbiguousCase {
  plate_suffix: string;
  status: string;
  entries_count: number;
  exits_count: number;
  candidate_pairs: AmbiguousPair[];
  notes?: string;
}

export interface MatchingSummary {
  total_observations: number;
  total_entries: number;
  total_exits: number;
  matched_journeys: number;
  reviewed_journeys: number;
  rejected_pairs: number;
  ambiguous_cases: number;
  ambiguous_entries: number;
  ambiguous_exits: number;
  unmatched_entries: number;
  unmatched_exits: number;
  pending_voice_entries?: number;
  pending_voice_exits?: number;
  matching_rate_percent: number;
  mean_travel_time_sec: number;
  median_travel_time_sec: number;
  method_note: string;
}

export interface ODMatrixData {
  origins: string[];
  destinations: string[];
  counts: Record<string, Record<string, number>>;
  percentages: Record<string, Record<string, number>>;
  row_totals: Record<string, number>;
  col_totals: Record<string, number>;
  grand_total: number;
}

export interface TravelTimeStats {
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  p15: number;
  p50: number;
  p85: number;
  p95: number;
  histogram: Array<{ bin_start: number; bin_end: number; label: string; count: number }>;
}

export interface CategorySplit {
  total: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
}

export interface RouteSpeed {
  route: string;
  distance_m: number;
  journeys: number;
  mean_travel_time_sec: number;
  mean_journey_speed_kmh: number | null;
}

export interface CountsData {
  interval_minutes: number;
  total: number;
  entries: number;
  exits: number;
  by_point: Record<string, number>;
  by_category: Record<string, number>;
  category_percent: Record<string, number>;
  by_interval: { start: string; entries: number; exits: number; total: number }[];
}

export interface Report {
  summary: MatchingSummary;
  matches: MatchResult[];
  ambiguous: AmbiguousCase[];
  unmatched_entries: { id: string; plate_suffix: string; point_code: string; timestamp: string; vehicle_category: string }[];
  unmatched_exits: { id: string; plate_suffix: string; point_code: string; timestamp: string; vehicle_category: string }[];
  analytics: {
    od_matrix: ODMatrixData;
    travel_time_stats: TravelTimeStats;
    vehicle_category_split: CategorySplit;
    route_speeds: RouteSpeed[];
    counts: CountsData;
  };
}
