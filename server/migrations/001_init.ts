export default `
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name     text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  role          text NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','OBSERVER')),
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE studies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  description     text NOT NULL DEFAULT '',
  study_date      date NOT NULL,
  start_time      text NOT NULL DEFAULT '08:00' CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time        text NOT NULL DEFAULT '12:00' CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  timezone        text NOT NULL DEFAULT 'Asia/Tehran',
  supervisor_name text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED')),
  schematic_type  text NOT NULL DEFAULT 'SCHEMATIC_GRID' CHECK (schematic_type IN ('SCHEMATIC_GRID','CUSTOM_IMAGE')),
  schematic_image text,
  is_demo         boolean NOT NULL DEFAULT false,
  retention_days  integer CHECK (retention_days IS NULL OR retention_days > 0),
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE observation_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{1,12}$'),
  point_type  text NOT NULL CHECK (point_type IN ('ENTRY','EXIT')),
  description text NOT NULL DEFAULT '',
  x_percent   numeric(5,2) NOT NULL DEFAULT 50 CHECK (x_percent BETWEEN 0 AND 100),
  y_percent   numeric(5,2) NOT NULL DEFAULT 50 CHECK (y_percent BETWEEN 0 AND 100),
  UNIQUE (study_id, code)
);

CREATE TABLE route_distances (
  study_id         uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  origin_code      text NOT NULL,
  destination_code text NOT NULL,
  distance_meters  numeric(10,1) NOT NULL CHECK (distance_meters > 0),
  PRIMARY KEY (study_id, origin_code, destination_code),
  FOREIGN KEY (study_id, origin_code) REFERENCES observation_points(study_id, code) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (study_id, destination_code) REFERENCES observation_points(study_id, code) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE study_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_code   text NOT NULL,
  period_start timestamptz,
  period_end   timestamptz,
  UNIQUE (study_id, user_id, point_code),
  FOREIGN KEY (study_id, point_code) REFERENCES observation_points(study_id, code) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end > period_start)
);

CREATE TABLE vehicle_categories (
  code       text PRIMARY KEY CHECK (code ~ '^[A-Z0-9_]{1,24}$'),
  label_en   text NOT NULL,
  label_fa   text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id        uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  point_code      text NOT NULL,
  point_type      text NOT NULL CHECK (point_type IN ('ENTRY','EXIT')),
  plate_suffix    char(3) NOT NULL CHECK (plate_suffix ~ '^[0-9]{3}$'),
  vehicle_category text NOT NULL REFERENCES vehicle_categories(code),
  vehicle_color   text CHECK (vehicle_color IS NULL OR length(vehicle_color) <= 20),
  observed_at     timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  observer_id     uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  voided_at       timestamptz,
  voided_by       uuid REFERENCES users(id),
  void_reason     text,
  UNIQUE (observer_id, idempotency_key),
  FOREIGN KEY (study_id, point_code) REFERENCES observation_points(study_id, code) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX observations_study_time ON observations (study_id, observed_at);
CREATE INDEX observations_study_suffix ON observations (study_id, plate_suffix);

CREATE TABLE match_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id             uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  entry_observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  exit_observation_id  uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  decision             text NOT NULL CHECK (decision IN ('REVIEWED','REJECTED')),
  note                 text,
  reviewer_id          uuid NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_observation_id, exit_observation_id)
);

CREATE TABLE audit_logs (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  user_id   uuid,
  username  text,
  action    text NOT NULL,
  entity    text,
  entity_id text,
  detail    text
);
CREATE INDEX audit_logs_at ON audit_logs (at DESC);
`;
