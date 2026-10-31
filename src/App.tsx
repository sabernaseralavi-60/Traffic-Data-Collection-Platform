import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { FieldCollector } from './components/FieldCollector';
import { SchematicMapEditor } from './components/SchematicMapEditor';
import { MatchingView } from './components/MatchingView';
import { ODMatrixView } from './components/ODMatrixView';
import { ObserverManagement } from './components/ObserverManagement';
import { ReportsView } from './components/ReportsView';
import { KermanManualView } from './components/KermanManualView';
import { User, Study, VehicleObservation, ODMatrixData, TravelTimeStats, CategorySplit, MatchingSummary } from './types';
import { Language, getT } from './i18n';
import {
  getPendingObservations,
  markObservationsSynced,
  getQueueStatus,
  QueuedObservation
} from './utils/offlineQueue';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeStudy, setActiveStudy] = useState<Study | null>(null);
  const [observations, setObservations] = useState<VehicleObservation[]>([]);

  // Analytics & Matching data computed by Python engine
  const [matchingSummary, setMatchingSummary] = useState<MatchingSummary | null>(null);
  const [odMatrix, setOdMatrix] = useState<ODMatrixData | null>(null);
  const [travelTimeStats, setTravelTimeStats] = useState<TravelTimeStats | null>(null);
  const [categorySplit, setCategorySplit] = useState<CategorySplit | null>(null);

  // Connectivity & Sync state
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // Manage document direction & font when language flips
  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerBatchSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch initial session, studies, and observations
  const loadInitialData = async () => {
    try {
      // Load current user
      const userRes = await fetch('/api/v1/auth/me');
      if (userRes.ok) {
        const uData = await userRes.json();
        setCurrentUser(uData.user);
        setAllUsers(uData.allUsers || []);
      }

      // Load studies
      const studiesRes = await fetch('/api/v1/studies');
      if (studiesRes.ok) {
        const sData = await studiesRes.json();
        if (sData.length > 0) {
          const study = sData[0];
          setActiveStudy(study);

          // Load observations for active study
          const obsRes = await fetch(`/api/v1/studies/${study.id}/observations`);
          if (obsRes.ok) {
            const obsData = await obsRes.json();
            setObservations(obsData);
          }

          // Trigger matching run to initialize analytics
          const matchRes = await fetch(`/api/v1/studies/${study.id}/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ min_travel_time_sec: 30, max_travel_time_sec: 900 }),
          });
          if (matchRes.ok) {
            const mData = await matchRes.json();
            setMatchingSummary(mData.summary);
            if (mData.analytics) {
              setOdMatrix(mData.analytics.od_matrix);
              setTravelTimeStats(mData.analytics.travel_time_stats);
              setCategorySplit(mData.analytics.vehicle_category_split);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Initial data load error:', err);
    }
  };

  const refreshQueueStatus = useCallback(async () => {
    try {
      const status = await getQueueStatus();
      setPendingSyncCount(status.pending);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    refreshQueueStatus();
  }, [refreshQueueStatus]);

  // Batch sync offline queued records with server
  const triggerBatchSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const pending: QueuedObservation[] = await getPendingObservations();
      if (pending.length > 0) {
        const res = await fetch('/api/v1/observations/batch-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ observations: pending }),
        });

        if (res.ok) {
          const ids = pending.map((p) => p.id);
          await markObservationsSynced(ids);
          await refreshQueueStatus();

          // Refresh study observations
          if (activeStudy) {
            const obsRes = await fetch(`/api/v1/studies/${activeStudy.id}/observations`);
            if (obsRes.ok) {
              const obsData = await obsRes.json();
              setObservations(obsData);
            }
          }
        }
      }
    } catch (err) {
      console.error('Batch sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitchUser = async (userId: string) => {
    try {
      const res = await fetch('/api/v1/auth/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Failed to switch user:', err);
    }
  };

  const handleObservationAdded = (obs: VehicleObservation) => {
    setObservations((prev) => [obs, ...prev]);
  };

  const handleDeleteObservation = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/observations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setObservations((prev) => prev.filter((o) => o.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete observation:', err);
    }
  };

  const handleResetSeedData = async () => {
    if (!activeStudy) return;
    setIsSeeding(true);
    try {
      const res = await fetch(`/api/v1/studies/${activeStudy.id}/seed-scenario`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadInitialData();
      }
    } catch (err) {
      console.error('Failed to reset seed data:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleMatchesComputed = (data: any) => {
    setMatchingSummary(data.summary);
    if (data.analytics) {
      setOdMatrix(data.analytics.od_matrix);
      setTravelTimeStats(data.analytics.travel_time_stats);
      setCategorySplit(data.analytics.vehicle_category_split);
    }
  };

  const handleExportCSV = () => {
    if (!activeStudy) return;
    window.location.href = `/api/v1/studies/${activeStudy.id}/export`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950">
      {/* Top Application Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        currentUser={currentUser}
        allUsers={allUsers}
        onSwitchUser={handleSwitchUser}
        activeStudy={activeStudy}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onSyncNow={triggerBatchSync}
        isSyncing={isSyncing}
      />

      {/* Main View Router */}
      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' && (
          <DashboardView
            study={activeStudy}
            lang={lang}
            currentUser={currentUser}
            observations={observations}
            setActiveTab={setActiveTab}
            onResetSeedData={handleResetSeedData}
            isSeeding={isSeeding}
          />
        )}

        {activeTab === 'collector' && (
          <FieldCollector
            currentUser={currentUser}
            activeStudy={activeStudy}
            lang={lang}
            onObservationAdded={handleObservationAdded}
            recentObservations={observations}
            onDeleteObservation={handleDeleteObservation}
            isOnline={isOnline}
            onRefreshQueue={refreshQueueStatus}
          />
        )}

        {activeTab === 'map' && (
          <SchematicMapEditor
            study={activeStudy}
            lang={lang}
            onUpdateStudy={(updated) => setActiveStudy(updated)}
          />
        )}

        {activeTab === 'matching' && (
          <MatchingView
            study={activeStudy}
            lang={lang}
            onMatchesComputed={handleMatchesComputed}
            onExportReport={handleExportCSV}
          />
        )}

        {activeTab === 'od_matrix' && (
          <ODMatrixView
            study={activeStudy}
            lang={lang}
            odMatrix={odMatrix}
            travelTimeStats={travelTimeStats}
            categorySplit={categorySplit}
            onExportReport={handleExportCSV}
          />
        )}

        {activeTab === 'observers' && (
          <ObserverManagement
            users={allUsers}
            activeStudy={activeStudy}
            lang={lang}
            currentUser={currentUser}
            onSwitchUser={handleSwitchUser}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            study={activeStudy}
            lang={lang}
            odMatrix={odMatrix}
            travelTimeStats={travelTimeStats}
            matchingSummary={matchingSummary}
          />
        )}

        {activeTab === 'kerman_manual' && (
          <KermanManualView lang={lang} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>TrafficLab – Modular Field Data Collection Platform for Transportation Engineering</p>
          <p className="font-mono text-[11px] text-slate-600">
            Python 3.10 Engine • Deterministic Temporal Matching • FHWA TMG 2022 Compliant
          </p>
        </div>
      </footer>
    </div>
  );
}
