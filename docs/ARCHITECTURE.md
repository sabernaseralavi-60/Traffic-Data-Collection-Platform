# System Architecture Document
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** ARCH-2026-001  
**Architecture:** Modular Full-Stack Web Platform (React/TypeScript + Python Engine + SQLite/PostgreSQL Ready)  

---

## 1. High-Level System Architecture

TrafficLab is designed with strict separation between the user-facing responsive collection client, the API gateway / persistence layer, and the analytical traffic engineering engine:

```
+-----------------------------------------------------------------------------------+
|                           CLIENT LAYER (PWA / Responsive Web)                    |
|                                                                                   |
|  +------------------------+  +--------------------------+  +-------------------+  |
|  | Field Observer UI      |  | Admin & Supervisor Panel |  | Analytics & OD    |  |
|  | - 1-2s Numpad / Speech |  | - Study & Schematic Map  |  | - Heatmap Matrix  |  |
|  | - Offline IndexedDB    |  | - Observer Assignments   |  | - Travel Times    |  |
|  | - fa-IR Voice Parser   |  | - Ambiguity Review       |  | - Excel/CSV Export|  |
|  +------------------------+  +--------------------------+  +-------------------+  |
+------------------------------------------^----------------------------------------+
                                           | HTTPS / JSON API
+------------------------------------------v----------------------------------------+
|                      BACKEND GATEWAY & PERSISTENCE (Node/Express)                 |
|                                                                                   |
|  - Auth & RBAC (Admin, Supervisor, Observer)                                      |
|  - Idempotency & Duplicate Observation Guard                                      |
|  - Study Area Schematic & Point Topology Management                               |
|  - Sync Queue Receiver with Transaction Isolation                                 |
|  - Audit Log & Event Sourcing                                                     |
+------------------------------------------^----------------------------------------+
                                           | IPC / Direct Child Process Execution
+------------------------------------------v----------------------------------------+
|                     PYTHON TRAFFIC ENGINEERING ENGINE (Python 3.10)               |
|                                                                                   |
|  +--------------------------------+  +-----------------------------------------+  |
|  | Partial Plate Matching Engine  |  | Transportation Analytics                |  |
|  | - Temporal Feasibility Window |  | - OD Matrix Formulation                 |  |
|  | - Category Compatibility       |  | - Interval Binning (5, 15, 30, 60 min)  |  |
|  | - Ambiguity Detection          |  | - Travel Time Percentiles (15, 50, 85)  |  |
|  | - Confidence Scoring           |  | - Average Speed Estimation (v = d/t)    |  |
|  +--------------------------------+  +-----------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Design & Responsibilities

### 2.1 Frontend Client (React 19 + TypeScript + Tailwind CSS)
- **Role:** Fast, tactile data capture and clear visualization.
- **Offline Reliability:** IndexedDB queue buffers observations when offline. Automatically flushes records when `navigator.onLine` fires, with automatic deduplication by `idempotency_key`.
- **Speech Digit Normalization:** Browser Web Speech API (`fa-IR`) translates spoken Persian numerals ("سه هشت هفت") to standard normalized string format `"387"`, keeping leading zeros.
- **Bilingual Internationalization:** Real-time switch between Persian (RTL, Vazirmatn font) and English (LTR, Plus Jakarta Sans).

### 2.2 Backend Gateway (Express.js)
- Manages study configurations, observer accounts, authentication sessions, and observation ingestion.
- Enforces role-based permissions:
  - **Administrator:** Full study creation, node layout, observer account provisioning, global export.
  - **Supervisor:** Study monitoring, candidate ambiguity resolution, match review.
  - **Observer:** Restricted to currently assigned study and observation point.

### 2.3 Python Engine (`backend/trafficlab_engine.py`)
- Built exclusively with Python standard libraries (`json`, `math`, `statistics`, `datetime`, `dataclasses`, `typing`, `unittest`).
- Zero external runtime failures; works in standard Python 3.10+ environments.
- Implements:
  - **Bipartite temporal matching:** Entry vs Exit timestamps within configurable $[T_{\min}, T_{\max}]$ window.
  - **Tie-breaking & Ambiguity flagging:** Whenever a plate suffix has multiple plausible candidates within the time window, records are marked `AMBIGUOUS` with candidate IDs preserved for supervisor audit.
  - **Transportation statistics:** Origin-Destination totals, row/column proportions, travel time parametric (mean, standard deviation) and non-parametric (median, 15th, 85th, 95th percentiles) metrics.
  - **Speed calculations:** Uses route distance table to derive average journey speeds.

---

## 3. Deployment & Cloud Constraints

- **Free-Tier Compatibility:** Designed to run seamlessly on Vercel or Cloud Run / containerized environments.
- **Database Scalability:** Normalized schema ready for Neon Serverless PostgreSQL or local SQLite/in-memory store for high-throughput testing.
- **Zero AI Dependency:** Does not require external LLMs, speech cloud APIs, or proprietary services.
