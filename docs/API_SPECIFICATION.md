# REST API Specification
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** API-2026-001  
**Base URL:** `/api/v1`  

---

## 1. Authentication & Session

### `POST /api/v1/auth/login`
- **Request Body:**
  ```json
  {
    "username": "observer01",
    "password": "password123"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "token": "tl_session_token_xyz",
    "user": {
      "id": "u-01",
      "username": "observer01",
      "full_name": "Reza Rahmani",
      "role": "OBSERVER",
      "active_assignment": {
        "study_id": "study-01",
        "study_name": "Azadi Intersection Network",
        "point_code": "E01",
        "point_type": "ENTRY",
        "description": "Northern Inbound Gate"
      }
    }
  }
  ```

---

## 2. Studies & Schematic Points

### `GET /api/v1/studies`
- Lists all studies with supervisor and point counts.

### `GET /api/v1/studies/:id`
- Returns full details including observation points, assigned observers, and route distance matrix.

### `POST /api/v1/studies`
- Creates a new study with dates, time windows, and initial points.

### `PUT /api/v1/studies/:id/points`
- Updates schematic points coordinates $(x\%, y\%)$, code, type (`ENTRY`/`EXIT`), and route distances.

---

## 3. Observations & Sync

### `POST /api/v1/observations`
- Records a single live observation from the field observer.
- **Request Body:**
  ```json
  {
    "study_id": "study-01",
    "point_code": "E01",
    "point_type": "ENTRY",
    "plate_suffix": "387",
    "vehicle_category": "CAR",
    "observation_timestamp": "2026-10-30T08:15:10Z",
    "idempotency_key": "obs-e01-387-1730276110000"
  }
  ```
- **Response 201 Created / 200 OK (Idempotent):**
  ```json
  {
    "status": "success",
    "observation": {
      "id": "obs-uuid-1",
      "plate_suffix": "387",
      "point_code": "E01",
      "point_type": "ENTRY",
      "timestamp": "2026-10-30T08:15:10Z"
    }
  }
  ```

### `POST /api/v1/observations/batch-sync`
- Synchronizes buffered offline observations from client IndexedDB.
- Accepts an array of observations; applies transaction-level deduplication via `idempotency_key`.

---

## 4. Vehicle Matching Engine & Analytics (Python Powered)

### `POST /api/v1/studies/:id/match`
- Invokes Python matching engine on all study observations.
- **Query / Body Parameters:**
  - `min_travel_time_sec`: Minimum valid travel time (default: 30s)
  - `max_travel_time_sec`: Maximum valid travel time (default: 900s)
  - `strict_category_match`: Boolean (default: false)
- **Response 200 OK:**
  ```json
  {
    "summary": {
      "total_entries": 120,
      "total_exits": 115,
      "matched_journeys": 98,
      "ambiguous_matches": 4,
      "unmatched_entries": 18,
      "unmatched_exits": 13,
      "matching_rate_percent": 81.67,
      "mean_travel_time_sec": 242.5,
      "median_travel_time_sec": 235.0
    },
    "matches": [ ... ],
    "ambiguous": [ ... ]
  }
  ```

### `GET /api/v1/studies/:id/od-matrix`
- Calculates the Origin-Destination matrix between all ENTRY points and EXIT points.
- Supports filtering by `category`, `start_time`, `end_time`.

### `GET /api/v1/studies/:id/travel-times`
- Returns descriptive statistics (mean, median, standard deviation, min, max, 15th, 85th, 95th percentiles) and speed distribution.

### `GET /api/v1/studies/:id/export`
- Formats: `format=csv`, `format=excel`, or `format=json`.
- Streams validated structured file download.
