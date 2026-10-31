# Database Schema Specification
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** DB-2026-001  
**Target:** PostgreSQL (Neon Serverless) & SQLite Compatible  

---

## 1. Relational Entity-Relationship Model

```
+------------------+         +------------------+
|      users       |         |     studies      |
+------------------+         +------------------+
| id (PK, UUID)    |<----+   | id (PK, UUID)    |<-------------+
| username         |     |   | name             |              |
| password_hash    |     |   | description      |              |
| full_name        |     |   | study_date       |              |
| role             |     |   | start_time       |              |
| is_active        |     |   | end_time         |              |
| created_at       |     |   | supervisor_id(FK)|              |
+------------------+     |   | status           |              |
                         |   +------------------+              |
                         |             | 1                     |
                         |             |                       |
                         |             | N                     |
                         |   +--------------------------+      |
                         |   |    observation_points    |      |
                         |   +--------------------------+      |
                         |   | id (PK, UUID)            |      |
                         |   | study_id (FK)            |      |
                         |   | code (e.g. E01, X01)     |      |
                         |   | point_type (ENTRY/EXIT)  |      |
                         |   | description              |      |
                         |   | x_coord, y_coord (rel)   |      |
                         |   +--------------------------+      |
                         |             ^                       |
                         |             | 1                     |
                         |             |                       |
                         |             | N                     |
+------------------------+--+  +--------------------------+    |
|   study_assignments       |  |   vehicle_observations   |    |
+---------------------------+  +--------------------------+    |
| id (PK, UUID)             |  | id (PK, UUID)            |    |
| user_id (FK)              |  | study_id (FK)            |----+
| study_id (FK)             |  | observation_point_id (FK)|
| observation_point_id (FK) |  | observer_id (FK)         |
| shift_start, shift_end    |  | plate_suffix (VARCHAR 10)|
+---------------------------+  | vehicle_category         |
                               | observation_timestamp    |
                               | idempotency_key (UNIQUE) |
                               | sync_status              |
                               +--------------------------+
                                            ^
                                            | 1..2
                                            |
                               +--------------------------+
                               |     vehicle_matches      |
                               +--------------------------+
                               | id (PK, UUID)            |
                               | study_id (FK)            |
                               | entry_observation_id (FK)|
                               | exit_observation_id (FK) |
                               | plate_suffix             |
                               | travel_time_seconds      |
                               | estimated_speed_kmh      |
                               | confidence_score         |
                               | match_status             |
                               | reviewer_id (FK, Null)   |
                               +--------------------------+
```

---

## 2. Table Definitions & DDL

```sql
-- 1. Users & Roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'OBSERVER')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Studies
CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    study_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    supervisor_id UUID REFERENCES users(id),
    schematic_map_url TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Observation Points
CREATE TABLE observation_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    point_type VARCHAR(10) NOT NULL CHECK (point_type IN ('ENTRY', 'EXIT')),
    description VARCHAR(255),
    x_percent NUMERIC(5,2) DEFAULT 50.0,
    y_percent NUMERIC(5,2) DEFAULT 50.0,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uq_study_point_code UNIQUE (study_id, code)
);

-- 4. Route Distances (for speed estimation)
CREATE TABLE route_distances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    origin_point_code VARCHAR(10) NOT NULL,
    destination_point_code VARCHAR(10) NOT NULL,
    distance_meters NUMERIC(10,2) NOT NULL,
    CONSTRAINT uq_study_route UNIQUE (study_id, origin_point_code, destination_point_code)
);

-- 5. Observer Study Assignments
CREATE TABLE study_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    observation_point_id UUID NOT NULL REFERENCES observation_points(id),
    shift_start TIMESTAMPTZ,
    shift_end TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- 6. Vehicle Observations (Immutable event log)
CREATE TABLE vehicle_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    observation_point_id UUID NOT NULL REFERENCES observation_points(id),
    point_code VARCHAR(10) NOT NULL,
    point_type VARCHAR(10) NOT NULL CHECK (point_type IN ('ENTRY', 'EXIT')),
    observer_id UUID NOT NULL REFERENCES users(id),
    plate_suffix VARCHAR(10) NOT NULL, -- Stored as string to preserve leading zeroes (e.g. "042")
    vehicle_category VARCHAR(30) DEFAULT 'CAR',
    observation_timestamp TIMESTAMPTZ NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_obs_study_suffix ON vehicle_observations (study_id, plate_suffix);
CREATE INDEX idx_obs_timestamp ON vehicle_observations (observation_timestamp);

-- 7. Vehicle Matches
CREATE TABLE vehicle_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    entry_observation_id UUID NOT NULL REFERENCES vehicle_observations(id),
    exit_observation_id UUID NOT NULL REFERENCES vehicle_observations(id),
    entry_point_code VARCHAR(10) NOT NULL,
    exit_point_code VARCHAR(10) NOT NULL,
    plate_suffix VARCHAR(10) NOT NULL,
    vehicle_category VARCHAR(30),
    entry_time TIMESTAMPTZ NOT NULL,
    exit_time TIMESTAMPTZ NOT NULL,
    travel_time_seconds NUMERIC(10,2) NOT NULL,
    estimated_speed_kmh NUMERIC(6,2),
    confidence_score NUMERIC(5,2) NOT NULL,
    match_status VARCHAR(20) NOT NULL CHECK (match_status IN ('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'REVIEWED', 'REJECTED')),
    notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
