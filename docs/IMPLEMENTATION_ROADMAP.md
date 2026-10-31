# Implementation Roadmap
**Project:** TrafficLab – Smart Traffic Data Collection Platform  
**Document ID:** RDM-2026-001  

---

## Roadmap Phases

1. **Phase 1: Analytical Core in Python**
   - Implement `backend/trafficlab_engine.py` using Python 3.10 standard library.
   - Algorithms: Partial plate matching, time feasibility window, ambiguity resolution, OD matrix formulation, travel time & speed statistics, Excel/CSV export.
   - Comprehensive unit test suite in `backend/tests/test_matching.py`.

2. **Phase 2: Full-Stack Gateway & Express Server**
   - Express backend (`server.ts`) exposing `/api/v1/*` endpoints.
   - In-memory & JSON file persistent store with complete pre-seeded realistic scenario:
     - Study "Azadi Corridor Study" with E01, E02, X01, X02.
     - Observers Observer 1 (at E01) and Observer 2 (at X01).
     - Distance matrix between E01-X01, E01-X02, E02-X01, E02-X02.
   - Child process execution bridge to `trafficlab_engine.py` for all calculations.

3. **Phase 3: High-Speed Mobile Data Collection Client**
   - Large digit pad (0-9, Backspace, Clear) for instant 1-2 second observation entry.
   - Persian speech recognition parser (`fa-IR`) normalizing spoken number words ("سه هشت هفت" $\rightarrow$ "387").
   - Vehicle category selector (Car, Taxi, Pickup, Motorcycle, Van, Bus, Light Truck, Heavy Truck, Other).
   - Duplicate prevention (client-side lock, idempotency keys, duplicate warning while preserving valid distinct vehicles).
   - Local IndexedDB offline queue + connection monitor + sync indicator.

4. **Phase 4: Schematic Map Editor & Study Management**
   - Visual schematic map canvas showing study area, allowing points to be dragged, placed, and edited.
   - Green markers for ENTRY, Indigo/Blue markers for EXIT.
   - Route distance configuration.

5. **Phase 5: Analytics Dashboard & Supervisor Review**
   - Dynamic OD Matrix heatmap with row and column totals.
   - Travel time distribution charts and percentile curve.
   - Ambiguity review table: supervisor can resolve or dismiss conflicting candidates.
   - Export tools (Excel-compatible, CSV, printable PDF summary).

6. **Phase 6: Bilingual & RTL Polish**
   - Persian language toggle with RTL layout and Vazirmatn font.
   - Unit tests run via `npx --yes tsx --test` and `python3 -m unittest`.
   - Browser verification via `playwright-cli`.
