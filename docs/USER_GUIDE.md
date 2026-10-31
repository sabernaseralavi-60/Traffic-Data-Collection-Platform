# TrafficLab User Guide & Operational Manual
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** UG-2026-001  
**App Version:** v2.6 Cordon Pro  

---

## 1. Overview

TrafficLab is a modular web platform engineered for transportation engineering field studies. It facilitates high-speed manual recording of passing vehicles at cordon observation gates using 3-digit registration plate suffixes, supports offline queuing during intermittent mobile network coverage, and runs a backend Python 3.10 matching engine to generate Origin–Destination (OD) trip matrices and travel time statistics compliant with FHWA Traffic Monitoring Guide (TMG 2022) guidelines.

---

## 2. Administrator & Supervisor Manual

### 2.1 Study Area Setup
1. **Access Study Area Map:**
   - Navigate to the **Study Area Map** tab.
   - The schematic canvas represents the cordon network with arterial corridors and intersection roundabout.
2. **Configure Observation Gates:**
   - **Entry Gates (Green Badge):** Inbound observation points (e.g., `E01`, `E02`).
   - **Exit Gates (Indigo Badge):** Outbound observation points (e.g., `X01`, `X02`).
   - Click any node to adjust its schematic $(X\%, Y\%)$ position or add new points using the sidebar form.
3. **Route Distance Matrix:**
   - Specify the travel distance in meters for each Origin $\rightarrow$ Destination pair (e.g., $E01 \rightarrow X01: 2,500\text{ m}$).
   - These distances are used by the Python engine to compute average journey speeds:
     $$v = \frac{d}{\Delta t} \times 3.6 \quad [\text{km/h}]$$
4. **Click "Save Configuration":**
   - Persists all nodes and route distances to the backend.

### 2.2 Observer Roster & Gate Assignments
1. Navigate to **Observers**.
2. View all observer accounts and their active gate assignment (e.g., Ali Rezaei $\rightarrow$ `E01`, Maryam Moradi $\rightarrow$ `X01`).
3. Observers will automatically have their input screen locked to their assigned gate to prevent accidental cross-station data pollution.

### 2.3 Running the Vehicle Matching Engine
1. Navigate to **Vehicle Matching**.
2. Adjust algorithm parameters:
   - **Min Travel Time ($T_{\min}$):** Default 30s. Rejects physically impossible trips faster than free-flow speed.
   - **Max Travel Time ($T_{\max}$):** Default 900s (15 min). Excludes long-duration parking/stops.
   - **Strict Category Match:** When enabled, rejects candidate pairs with conflicting vehicle classes.
3. Click **Execute Matching Engine**:
   - Executes `backend/trafficlab_engine.py match` on the backend.
   - Outputs matching rate, mean travel time, and journey list.

### 2.4 Ambiguous Candidate Resolution
- When two different vehicles with the same 3-digit suffix enter or exit within the same time window, the system flags the journey as **AMBIGUOUS**.
- The candidate inspector presents all plausible pairs with travel times, estimated speeds, and confidence scores.
- The supervisor clicks **Confirm Match** on the verified candidate, or leaves them as separate unmatched sightings.

### 2.5 Exporting Reports
1. **CSV Export:** Click **Export CSV** to download validated journey records and OD tables.
2. **Excel Format:** Click **Export Excel (TSV/CSV)** in the OD Matrix view.
3. **Printable Formal Study Report:** Navigate to **Reports & Export** and click **Print / Save PDF** for an official FHWA-styled study document.

---

## 3. Field Observer Manual

### 3.1 Field Collection Workflow (1–2 Second Entry)
1. Open the application on any smartphone or tablet browser.
2. The top banner prominently displays your **Assigned Gate** (e.g., `E01 - Northern Arterial Inbound [ENTRY GATE]`).
3. As a vehicle passes:
   - **Method A (Rapid Numpad):** Tap the 3 digits on the large numpad (e.g., `3`, `8`, `7`).
   - **Method B (Physical Keyboard):** Type `387` and press `Enter`.
   - **Method C (Persian Voice Input):** Tap **ورودی صوتی فارسی (Persian Voice Input)** and say the digits in Persian (e.g., *"سه هشت هفت"*). The system parses Persian digit words and inserts `387`.
4. (Optional) Tap a vehicle category: **Car**, **Taxi**, **Pickup**, **Motorcycle**, **Van**, **Bus**, or **Heavy Truck** (defaults to Passenger Car).
5. Tap **Record Vehicle (Enter)**.
6. Haptic and visual confirmation appears in $<1$ second and clears the field for the next vehicle.

### 3.2 Offline Mode & Intermittent Connectivity
1. If cell reception drops, the status indicator automatically switches to **Offline (آفلاین)**.
2. The observer can continue recording vehicles uninterrupted. Observations are safely buffered into browser IndexedDB with exact capture timestamps.
3. The queue counter displays pending records (e.g., `5 Pending Sync`).
4. When internet returns, the system automatically flushes queued records to the server, or the observer can tap **Sync Now**.
