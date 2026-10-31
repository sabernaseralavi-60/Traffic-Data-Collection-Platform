import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, download, errorText } from './api';
import { Navbar, TabId } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { FieldCollector } from './components/FieldCollector';
import { StudySetup } from './components/StudySetup';
import { ObservationsView } from './components/ObservationsView';
import { MatchingView } from './components/MatchingView';
import { ODMatrixView } from './components/ODMatrixView';
import { AccountsView } from './components/AccountsView';
import { ReportsView } from './components/ReportsView';
import { KermanManualView } from './components/KermanManualView';
import { Assignment, Category, Report, Study, StudySummary, User, VehicleObservation } from './types';
import { Language, getT, pick } from './i18n';
import { applySyncResults, getPendingObservations, getQueuedForUser, getQueueStatus, QueuedObservation, SyncResult } from './utils/offlineQueue';

const TABS: Record<User['role'], TabId[]> = {
  ADMIN: ['dashboard', 'studies', 'observations', 'matching', 'od_matrix', 'accounts', 'reports', 'kerman_manual'],
  SUPERVISOR: ['dashboard', 'observations', 'matching', 'od_matrix', 'reports', 'kerman_manual'],
  OBSERVER: ['collector', 'kerman_manual'],
};

export default function App() {
  const [lang, setLangState] = useState<Language>(() => (localStorage.getItem('tl_lang') === 'fa' ? 'fa' : 'en'));
  const setLang = (l: Language) => { localStorage.setItem('tl_lang', l); setLangState(l); };
  const [boot, setBoot] = useState<'loading' | 'ready'>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [observations, setObservations] = useState<VehicleObservation[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queued, setQueued] = useState<QueuedObservation[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);
  const t = getT(lang);

  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const refreshQueue = useCallback(async (u: User | null = user) => {
    if (!u) { setQueued([]); setPendingCount(0); setErrorCount(0); return; }
    const [items, status] = await Promise.all([getQueuedForUser(u.id), getQueueStatus(u.id)]);
    setQueued(items);
    setPendingCount(status.pending);
    setErrorCount(status.errors);
  }, [user]);

  const loadStudyData = useCallback(async (id: string, u: User) => {
    try {
      setLoadError(null);
      const [s, obs, rep] = await Promise.all([
        api<Study>('GET', `/studies/${id}`),
        api<VehicleObservation[]>('GET', `/studies/${id}/observations`),
        u.role !== 'OBSERVER' ? api<Report>('POST', `/studies/${id}/match`, {}) : Promise.resolve(null),
      ]);
      setStudy(s);
      setObservations(obs);
      setReport(rep);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(errorText(err));
    }
  }, []);

  const loadSession = useCallback(async (u: User, asg: Assignment[]) => {
    setUser(u);
    setAssignments(asg);
    setTab(TABS[u.role][0]);
    try {
      const [cats, list] = await Promise.all([api<Category[]>('GET', '/categories'), api<StudySummary[]>('GET', '/studies')]);
      setCategories(cats);
      setStudies(list);
      const saved = localStorage.getItem('tl_study');
      const pick0 = list.find((s) => s.id === saved) ?? list.find((s) => s.status === 'ACTIVE') ?? list[0];
      setStudyId(pick0?.id ?? null);
      if (pick0) await loadStudyData(pick0.id, u);
    } catch (err) {
      setLoadError(errorText(err));
    }
    await refreshQueue(u);
  }, [loadStudyData, refreshQueue]);

  // initial session probe: exactly once (re-running it on every user change reset the tab and flooded the API)
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    (async () => {
      try {
        const me = await api<{ user: User; assignments: Assignment[] }>('GET', '/auth/me');
        await loadSession(me.user, me.assignments);
      } catch { /* not signed in */ }
      setBoot('ready');
    })();
  }, [loadSession]);

  useEffect(() => {
    const expired = () => { setUser(null); setLoginNotice(pick(lang, 'Your session ended. Sign in again - anything saved on this device is kept.', 'نشست شما پایان یافت. دوباره وارد شوید؛ داده‌های ذخیره‌شده روی این دستگاه حفظ می‌شود.')); };
    window.addEventListener('tl:unauthenticated', expired);
    return () => window.removeEventListener('tl:unauthenticated', expired);
  }, [lang]);

  const syncNow = useCallback(async () => {
    if (!user || user.role !== 'OBSERVER' || syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    setIsSyncing(true);
    try {
      const pending = await getPendingObservations(user.id);
      // batches of at most 100 items and about 1.5 MB (voice clips make items large)
      for (let i = 0; i < pending.length;) {
        const chunk: typeof pending = [];
        let bytes = 0;
        while (i < pending.length && chunk.length < 100 && (chunk.length === 0 || bytes + (pending[i].audio_b64?.length ?? 0) < 1_500_000)) { bytes += pending[i].audio_b64?.length ?? 0; chunk.push(pending[i++]); }
        const body = chunk.map((p) => ({ study_id: p.study_id, point_code: p.point_code, ...(p.plate_suffix ? { plate_suffix: p.plate_suffix, suffix_source: p.suffix_source } : {}), vehicle_category: p.vehicle_category, observed_at: p.observation_timestamp, idempotency_key: p.idempotency_key, ...(p.audio_b64 ? { audio_b64: p.audio_b64, audio_mime: p.audio_mime, audio_ms: p.audio_ms } : {}) }));
        const res = await api<{ results: SyncResult[] }>('POST', '/observations/batch-sync', { observations: body });
        await applySyncResults(user.id, res.results); // only accepted items become SYNCED; refused ones stay visible as ERROR
      }
    } catch (err) {
      console.warn('sync failed, will retry:', err);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
      await refreshQueue();
      if (studyId) setObservations(await api<VehicleObservation[]>('GET', `/studies/${studyId}/observations`).catch(() => observations));
    }
  }, [user, studyId, refreshQueue, observations]);

  useEffect(() => {
    const on = () => { setIsOnline(true); void syncNow(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [syncNow]);

  useEffect(() => {
    if (!user || pendingCount === 0 || !isOnline) return;
    const id = setInterval(() => void syncNow(), 30_000);
    return () => clearInterval(id);
  }, [user, pendingCount, isOnline, syncNow]);

  useEffect(() => { if (user && pendingCount > 0 && isOnline) void syncNow(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = async () => {
    try { await api('POST', '/auth/logout', {}); } catch { /* cookie is cleared locally by expiry */ }
    setUser(null); setStudy(null); setStudies([]); setStudyId(null); setObservations([]); setReport(null); setAssignments([]); setLoginNotice(null);
    await refreshQueue(null);
  };

  const selectStudy = async (id: string) => {
    setStudyId(id);
    localStorage.setItem('tl_study', id);
    if (user) await loadStudyData(id, user);
  };

  const reloadStudies = async () => {
    const list = await api<StudySummary[]>('GET', '/studies');
    setStudies(list);
    return list;
  };
  const refreshCurrent = async () => { if (user && studyId) await loadStudyData(studyId, user); };

  const myAssignments = useMemo(() => assignments.filter((a) => a.study_id === studyId), [assignments, studyId]);
  const mine = useMemo(() => observations.filter((o) => user && o.observer_id === user.id), [observations, user]);

  if (boot === 'loading') return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm" role="status">…</div>;
  if (!user) {
    return <LoginView lang={lang} setLang={setLang} notice={loginNotice} onLoggedIn={async (u) => {
      const me = await api<{ user: User; assignments: Assignment[] }>('GET', '/auth/me');
      setLoginNotice(null);
      await loadSession(u, me.assignments);
    }} />;
  }

  const tabs = TABS[user.role];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950">
      <Navbar tabs={tabs} activeTab={activeTab} setActiveTab={setTab} lang={lang} setLang={setLang} user={user} onLogout={logout}
        studies={studies} studyId={studyId} onSelectStudy={selectStudy} isOnline={isOnline} pendingCount={pendingCount} errorCount={errorCount} onSyncNow={syncNow} isSyncing={isSyncing} />

      {study?.is_demo && (
        <div className="bg-fuchsia-950/60 border-b border-fuchsia-800/50 text-fuchsia-200 text-xs text-center py-1.5 px-3 print:hidden" data-testid="demo-banner">
          {pick(lang, 'DEMO study: synthetic data for demonstration, not real observations.', 'طرح نمایشی: داده‌های ساختگی برای نمایش، نه مشاهدات واقعی.')}
        </div>
      )}
      {loadError && <div role="alert" className="bg-rose-950/60 border-b border-rose-800/60 text-rose-200 text-xs text-center py-1.5 px-3">{loadError}</div>}

      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' && <DashboardView study={study} lang={lang} user={user} report={report} observationCount={observations.length} setActiveTab={setTab} onDemoReset={async () => { if (study) { await api('POST', `/studies/${study.id}/seed-scenario`, {}); await refreshCurrent(); } }} />}
        {activeTab === 'collector' && <FieldCollector user={user} study={study} assignments={myAssignments} categories={categories} lang={lang} isOnline={isOnline} serverObservations={mine} queued={queued.filter((q) => q.study_id === studyId)} onChanged={async () => { await refreshQueue(); if (studyId) setObservations(await api<VehicleObservation[]>('GET', `/studies/${studyId}/observations`).catch(() => observations)); }} />}
        {activeTab === 'studies' && <StudySetup lang={lang} study={study} studies={studies} onChanged={async (id) => { const list = await reloadStudies(); const target = id ?? studyId ?? list[0]?.id; if (target) { setStudyId(target); localStorage.setItem('tl_study', target); await loadStudyData(target, user); } }} />}
        {activeTab === 'observations' && <ObservationsView study={study} lang={lang} onChanged={refreshCurrent} />}
        {activeTab === 'matching' && <MatchingView study={study} lang={lang} categories={categories} initial={report} onReport={setReport} />}
        {activeTab === 'od_matrix' && <ODMatrixView study={study} lang={lang} report={report} />}
        {activeTab === 'accounts' && <AccountsView lang={lang} currentUser={user} categories={categories} onCategoriesChanged={async () => setCategories(await api<Category[]>('GET', '/categories'))} />}
        {activeTab === 'reports' && <ReportsView study={study} lang={lang} report={report} />}
        {activeTab === 'kerman_manual' && <KermanManualView lang={lang} />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500 print:hidden">
        {t.app_title} - {pick(lang, 'Field data collection for transportation studies. Matching results are probable journeys, not certainties.', 'جمع‌آوری میدانی داده برای مطالعات حمل‌ونقل. نتایج انطباق، سفرهای محتمل‌اند، نه قطعی.')}
      </footer>
    </div>
  );
}
