export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OBSERVER';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  assigned_point?: string;
  assigned_study_id?: string;
}

export interface ObservationPoint {
  id: string;
  code: string;
  point_type: 'ENTRY' | 'EXIT';
  description: string;
  x_percent: number;
  y_percent: number;
}

export interface RouteDistance {
  origin_code: string;
  destination_code: string;
  distance_meters: number;
}

export interface Study {
  id: string;
  name: string;
  description: string;
  study_date: string;
  start_time: string;
  end_time: string;
  supervisor_name: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DRAFT';
  schematic_type: 'SCHEMATIC_GRID' | 'CUSTOM_IMAGE';
  schematic_image_url?: string;
  points: ObservationPoint[];
  routes: RouteDistance[];
  created_at: string;
  observation_count?: number;
}

export interface VehicleObservation {
  id: string;
  study_id: string;
  point_code: string;
  point_type: 'ENTRY' | 'EXIT';
  plate_suffix: string;
  vehicle_category: string;
  vehicle_color?: string;
  observation_timestamp: string;
  observer_id: string;
  observer_name?: string;
  idempotency_key: string;
  created_at?: string;
}

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
  confidence_score: number;
  match_status: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED' | 'REVIEWED' | 'REJECTED';
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
  confidence_score: number;
  speed_kmh?: number | null;
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
  ambiguous_cases: number;
  unmatched_entries: number;
  unmatched_exits: number;
  matching_rate_percent: number;
  mean_travel_time_sec: number;
  median_travel_time_sec: number;
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
  histogram: Array<{
    bin_start: number;
    bin_end: number;
    label: string;
    count: number;
  }>;
}

export interface CategorySplit {
  total: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
}
