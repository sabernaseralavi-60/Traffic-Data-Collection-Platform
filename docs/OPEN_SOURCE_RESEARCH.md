# Open-Source & Traffic Engineering Research Report
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** RES-2026-001  
**Author:** Principal Software Architect & Transportation Systems Engineer  
**Date:** October 2026  

---

## 1. Executive Summary

This investigation analyzes existing open-source software and transportation engineering methodologies related to:
- Field-based manual traffic data collection (Turning Movement Counts, entry/exit surveys)
- Vehicle classification frameworks
- Partial license plate matching and Origin–Destination (OD) synthesis
- Offline-first field data synchronization

The core mandate for **TrafficLab** is delivering a modular, robust web platform supporting human observers stationed at entry/exit points, recording 3-digit vehicle registration plate suffixes, synchronizing data across intermittent connectivity, and using a deterministic backend matching engine to compute travel times, journey speeds, and OD matrices.

---

## 2. In-Depth GitHub Repository Analysis

### 2.1 JoshKuminski/OpenVision
* **URL:** `https://github.com/joshkuminski/OpenVision`
* **Primary Capabilities:** Video-based object detection, multi-object tracking, and automated vehicle movement counting for traffic engineering intersections. Aims to provide an open alternative to proprietary commercial hardware/software suites (such as Miovision Scout).
* **Languages & Stack:** Python, OpenCV, Darknet/YOLO, NumPy.
* **Architecture:** Monolithic script-based pipeline: Video ingest $\rightarrow$ YOLO inference $\rightarrow$ centroid tracking $\rightarrow$ virtual tripwire counting $\rightarrow$ CSV output.
* **License:** MIT License.
* **Maintenance Status:** Low/Archival. Built around older YOLOv3/v4 configurations.
* **Reusable Components:** Concepts for polygon-based intersection gate definitions and vehicle movement classification.
* **Limitations:**
  - Designed exclusively for post-processing recorded video, not live field observer data entry.
  - Requires high-end GPU or dedicated edge processor.
  - No human-in-the-loop manual entry or partial license plate matching logic.
* **Commercial Use:** Allowed (MIT).
* **Recommendation:** **Study** (for intersection movement topology and tripwire coordinate logic), but **do not use for field collection**.

---

### 2.2 ube09/LaneVision
* **URL:** `https://github.com/ube09/LaneVision`
* **Primary Capabilities:** Lane detection, vehicle tracking, and trajectory analysis using classical computer vision (Canny Edge detection, Hough transforms) and convolutional networks for autonomous driving / ADAS.
* **Languages & Stack:** Python, PyTorch / Keras, OpenCV, Matplotlib.
* **Architecture:** Stream-oriented pipeline computing lane boundary polynomial equations and ego-vehicle lane offset.
* **License:** Apache 2.0 / MIT.
* **Maintenance Status:** Stale/Academic demonstration.
* **Reusable Components:** Mathematical representation of lane boundaries.
* **Limitations:**
  - Solves the inverse problem (in-vehicle camera lane keeping) rather than roadside roadside station monitoring or OD matching.
  - Heavy video dependency with high CPU/GPU overhead.
* **Commercial Use:** Permitted under permissive license terms.
* **Recommendation:** **Ignore**. Not functionally applicable to human observer entry-exit registration.

---

### 2.3 Tensionix/traffic-counter
* **URL:** `https://github.com/Tensionix/traffic-counter`
* **Primary Capabilities:** Windows/desktop GUI and CLI tool that tracks and counts vehicles (cars, buses, trucks, motorbikes) across user-drawn screen lines on video streams and georeferenced satellite feeds using YOLOv8 / PyTorch.
* **Languages & Stack:** Python, PyQt / Tkinter, Ultralytics YOLO, OpenCV.
* **Architecture:** Desktop client processing local video files or RTSP streams with SQLite logging.
* **License:** GPL-3.0.
* **Maintenance Status:** Active within 2023–2024.
* **Reusable Components:** Schema for vehicle categorization (class mapping: car, bus, truck, motorcycle) and time-interval aggregation logic (5-min / 15-min bins).
* **Limitations:**
  - Desktop-only executable; cannot run as a mobile field web application on observer smartphones.
  - GPL-3.0 restricts embedding into proprietary or SaaS deployments without open-sourcing client infrastructure.
  - Does not support license plate suffixes or spatial entry–exit pairing across separated checkpoints.
* **Commercial Use:** Restricted by copyleft provisions.
* **Recommendation:** **Adapt** vehicle categorization taxonomy and interval binning math only; reimplement in clean MIT/Apache Python code.

---

### 2.4 Shady-Abdelaziz/traffic-flow-analysis
* **URL:** `https://github.com/Shady-Abdelaziz/traffic-flow-analysis`
* **Primary Capabilities:** Analytical notebook and statistical workflow examining macro traffic flow characteristics (flow rate $q$, density $k$, mean speed $v$) using synthetic and benchmark loop detector datasets.
* **Languages & Stack:** Python, Pandas, SciPy, Matplotlib.
* **Architecture:** Data science exploratory pipeline for Greenshields / Greenberg / Underwood macroscopic fundamental traffic diagrams.
* **License:** MIT.
* **Maintenance Status:** Intermittent educational repository.
* **Reusable Components:** Statistical summaries, percentile computations ($15^{\text{th}}$, $50^{\text{th}}$, $85^{\text{th}}$, $95^{\text{th}}$ percentiles), and travel-time variance formulas.
* **Limitations:**
  - Purely post-hoc data analysis script with no database, web frontend, or real-time ingest.
  - Assumes continuous inductive loop data rather than discrete manual plate sightings.
* **Commercial Use:** Allowed (MIT).
* **Recommendation:** **Adapt** the statistical formulation for travel time distribution and percentile calculations into our backend traffic analytics engine.

---

### 2.5 Additional Studied Repositories & Tooling

| Repository / Tool | Purpose | License | Recommendation | Key Takeaways |
| :--- | :--- | :--- | :--- | :--- |
| **JAMAR Technologies TDC-8 / ULTRA (Hardware/Firmware Spec)** | Industry standard hand-held Turning Movement Counter boards | Proprietary | **Study** | Multi-bank physical button layout; 1-click tally; audio click feedback; shift key for vehicle classification. |
| **StreetLight InSight / Tredis methodology** | OD matrix synthesis from partial sensor samples | Proprietary | **Study** | Importance of expanding sample OD matrices by volume expansion factors and confidence intervals. |
| **FHWA TMG Software Utilities (Traffic Monitoring Guide Tools)** | Federal Highway Administration format parsers & QC routines | Public Domain (US Gov) | **Adapt** | Data validation rules: flagging travel times with implied speed $> 140\text{ km/h}$ or $< 3\text{ km/h}$; duplicate timestamp rejection. |
| **Dexie.js / LocalForage** | Client-side IndexedDB wrapper for offline-first web apps | Apache 2.0 / MIT | **Adopt / Reimplement pattern** | Queue-based synchronization, transaction isolation, and idempotency key mapping. |

---

## 3. Transportation Engineering Methodology: Partial License Plate Matching

### 3.1 Background & The FHWA Framework
According to the **FHWA Traffic Monitoring Guide (2022)** and the **ITE Manual of Transportation Engineering Studies**, partial license plate surveys involve recording the last 3 or 4 alphanumeric characters of vehicle plates at cordon entry and exit points along with high-precision timestamps (to the nearest second).

### 3.2 The Spurious Match Problem
In a 3-digit numeric suffix system (000–999):
- There are only $1,000$ possible distinct suffixes.
- If $N_{entry}$ vehicles enter and $N_{exit}$ vehicles leave within a study period, by the Birthday Paradox and uniform probability distribution, the probability of random collision is high:
  $$P(\text{Collision}) = 1 - \exp\left(-\frac{n(n-1)}{2000}\right)$$
- If two different vehicles sharing the same suffix pass an entry and an exit at times that coincidentally produce a reasonable travel time, a **spurious match (false positive)** is formed.

### 3.3 Methodological Safeguards Implemented in TrafficLab
To minimize spurious matches without requiring AI or full invasive license surveillance:
1. **Feasible Travel Time Window ($T_{\min}, T_{\max}$):**
   Matches are strictly constrained such that:
   $$T_{\min} \le t_{exit} - t_{entry} \le T_{\max}$$
   Where $T_{\min} = \frac{\text{Distance}}{\text{Free Flow Speed } \times 1.25}$ and $T_{\max} = \frac{\text{Distance}}{\text{Congested Speed } \times 0.75}$.
2. **Vehicle Category Compatibility:**
   If observer A records a "Heavy Truck" with suffix `387`, and observer B records a "Motorcycle" with suffix `387`, this candidate pair is rejected or severely penalized in confidence.
3. **Temporal Sequence Preservation:**
   An entry must strictly precede the exit ($t_{entry} < t_{exit}$).
4. **Ambiguity Resolution & Manual Supervisor Review:**
   When multiple candidates exist (e.g., two entries of `387` at $08:15:10$ and $08:16:00$ matched against an exit at $08:19:20$), the system flags the match status as `AMBIGUOUS`, presents both candidates with travel times, and allows a supervisor to confirm or discard.
5. **Statistical Reporting of Match Rates:**
   The system never presents matched counts as 100% census data; it displays raw volumes, matched volumes, matching percentage $\frac{M}{V_{entry}}$, ambiguous rates, and expansion factor suggestions.

---

## 4. Key Architectural Recommendations for TrafficLab

1. **Keep Calculations in Python:**
   The core matching engine, OD matrix calculation, travel time percentiles ($15^{\text{th}}, 50^{\text{th}}, 85^{\text{th}}, 95^{\text{th}}$), and speed distributions will run in a standalone, unit-tested Python module (`backend/trafficlab_engine.py`).
2. **Mobile Observer Interface:**
   - 1–2 second record cycle.
   - Large touch targets for digits 0–9.
   - Built-in Persian digit parser for Web Speech API (`fa-IR`) with zero-preservation ("سه هشت هفت" $\rightarrow$ `"387"`).
3. **Offline-First Storage:**
   - IndexedDB store queue preserving exact initial capture timestamp.
   - UUID and Idempotency key per observation preventing double counting upon batch sync.
4. **Bilingual RTL/LTR UI:**
   - Full support for Persian (Farsi) and English with Vazirmatn font.
