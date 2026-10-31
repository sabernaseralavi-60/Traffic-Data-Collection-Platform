import React from 'react';
import { AlertTriangle, BarChart3, BookOpen, Car, FileSpreadsheet, GitCompare, Globe, Layers, LogOut, MapPin, RefreshCw, Users, WifiOff } from 'lucide-react';
import { StudySummary, User } from '../types';
import { Language, getT, pick } from '../i18n';

export type TabId = 'dashboard' | 'collector' | 'studies' | 'matching' | 'od_matrix' | 'accounts' | 'reports' | 'kerman_manual';

interface NavbarProps {
  tabs: TabId[];
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  user: User;
  onLogout: () => void;
  studies: StudySummary[];
  studyId: string | null;
  onSelectStudy: (id: string) => void;
  isOnline: boolean;
  pendingCount: number;
  errorCount: number;
  onSyncNow: () => void;
  isSyncing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ tabs, activeTab, setActiveTab, lang, setLang, user, onLogout, studies, studyId, onSelectStudy, isOnline, pendingCount, errorCount, onSyncNow, isSyncing }) => {
  const t = getT(lang);
  const items: Record<TabId, { label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }> = {
    dashboard: { label: t.nav_dashboard, icon: BarChart3 },
    collector: { label: t.nav_field_collector, icon: Car, highlight: true },
    studies: { label: pick(lang, 'Studies & Map', 'طرح‌ها و نقشه'), icon: MapPin },
    matching: { label: t.nav_matching, icon: GitCompare },
    od_matrix: { label: t.nav_od_matrix, icon: Layers },
    accounts: { label: pick(lang, 'Accounts & Categories', 'حساب‌ها و دسته‌بندی‌ها'), icon: Users },
    reports: { label: t.nav_reports, icon: FileSpreadsheet },
    kerman_manual: { label: t.nav_kerman_manual, icon: BookOpen },
  };
  const roleLabel = user.role === 'ADMIN' ? t.role_admin : user.role === 'SUPERVISOR' ? t.role_supervisor : t.role_observer;

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md border-b border-slate-800 print:hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-16">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-lg tracking-tight block leading-tight">{t.app_title}</span>
              {studies.length > 1 ? (
                <select
                  aria-label={pick(lang, 'Active study', 'طرح فعال')}
                  value={studyId ?? ''}
                  onChange={(e) => onSelectStudy(e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-300 max-w-[180px] sm:max-w-xs truncate py-0.5"
                >
                  {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <p className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-xs">{studies[0]?.name ?? t.app_subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden />{t.online}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800">
                <WifiOff className="w-3.5 h-3.5" />{t.offline}
              </span>
            )}
            {pendingCount > 0 && (
              <button onClick={onSyncNow} disabled={isSyncing || !isOnline} data-testid="pending-sync"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white transition">
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{pendingCount} {t.pending_sync}</span>
              </button>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-900/70 text-rose-200 border border-rose-700" data-testid="sync-errors">
                <AlertTriangle className="w-3 h-3" />{errorCount} {pick(lang, 'sync errors', 'خطای ارسال')}
              </span>
            )}
            <button onClick={() => setLang(lang === 'en' ? 'fa' : 'en')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition" title="English / فارسی">
              <Globe className="w-3.5 h-3.5 text-teal-400" /><span>{lang === 'en' ? 'فارسی' : 'English'}</span>
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
              <div className="hidden md:block text-xs text-end">
                <p className="font-semibold text-slate-100 leading-tight truncate max-w-[140px]" data-testid="current-user">{user.full_name}</p>
                <p className="text-[10px] text-teal-400 font-mono">{roleLabel}</p>
              </div>
              <button onClick={onLogout} title={pick(lang, 'Sign out', 'خروج')} aria-label={pick(lang, 'Sign out', 'خروج')} data-testid="logout"
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-slate-300 transition">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 sm:gap-2 overflow-x-auto py-2 border-t border-slate-800/80" aria-label="Main">
          {tabs.map((id) => {
            const { label, icon: Icon, highlight } = items[id];
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)} data-testid={`tab-${id}`} aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  active ? 'bg-emerald-600 text-white font-semibold' : highlight ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
                <Icon className="w-3.5 h-3.5" /><span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
