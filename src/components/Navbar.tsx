import React from 'react';
import {
  Car,
  Wifi,
  WifiOff,
  RefreshCw,
  Globe,
  UserCheck,
  ChevronDown,
  Layers,
  MapPin,
  GitCompare,
  BarChart3,
  Users,
  FileSpreadsheet,
  BookOpen
} from 'lucide-react';
import { User, Study } from '../types';
import { Language, getT } from '../i18n';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  currentUser: User | null;
  allUsers: User[];
  onSwitchUser: (userId: string) => void;
  activeStudy: Study | null;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncNow: () => void;
  isSyncing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  currentUser,
  allUsers,
  onSwitchUser,
  activeStudy,
  isOnline,
  pendingSyncCount,
  onSyncNow,
  isSyncing,
}) => {
  const t = getT(lang);
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: t.nav_dashboard, icon: BarChart3 },
    { id: 'collector', label: t.nav_field_collector, icon: Car, highlight: true },
    { id: 'map', label: t.nav_schematic_map, icon: MapPin },
    { id: 'matching', label: t.nav_matching, icon: GitCompare },
    { id: 'od_matrix', label: t.nav_od_matrix, icon: Layers },
    { id: 'observers', label: t.nav_observers, icon: Users },
    { id: 'reports', label: t.nav_reports, icon: FileSpreadsheet },
    { id: 'kerman_manual', label: t.nav_kerman_manual, icon: BookOpen },
  ];

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md border-b border-slate-800">
      {/* Top Banner with Study & Role info */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  {t.app_title}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v2.6 Cordon Pro
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block truncate max-w-xs">
                {activeStudy?.name || t.app_subtitle}
              </p>
            </div>
          </div>

          {/* Right Utilities: Connectivity, Language, User/Role switch */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sync / Connectivity status */}
            <div className="flex items-center gap-2">
              {isOnline ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="hidden md:inline">{t.online}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>{t.offline}</span>
                </div>
              )}

              {pendingSyncCount > 0 && (
                <button
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm animate-bounce"
                  title="Offline observations queued"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{pendingSyncCount} {t.pending_sync}</span>
                </button>
              )}
            </div>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Toggle English / Persian"
            >
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span>{lang === 'en' ? 'فارسی' : 'English'}</span>
            </button>

            {/* User & Role Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition"
              >
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-teal-300">
                  {currentUser?.role === 'ADMIN' ? 'AD' : currentUser?.role === 'SUPERVISOR' ? 'SU' : 'OB'}
                </div>
                <div className="hidden lg:block text-xs">
                  <p className="font-semibold text-slate-100 leading-tight truncate max-w-[120px]">
                    {currentUser?.full_name || 'User'}
                  </p>
                  <p className="text-[10px] text-teal-400 font-mono">
                    {currentUser?.role} {currentUser?.assigned_point ? `(${currentUser.assigned_point})` : ''}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div
                  className={`absolute ${lang === 'fa' ? 'left-0' : 'right-0'} mt-2 w-72 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl py-2 z-50`}
                >
                  <div className="px-3 py-2 border-b border-slate-700/60">
                    <p className="text-xs text-slate-400">{t.switch_role}</p>
                    <p className="text-[11px] text-slate-500">Quickly test field observer vs supervisor views</p>
                  </div>
                  <div className="py-1">
                    {allUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          onSwitchUser(u.id);
                          setUserDropdownOpen(false);
                          if (u.role === 'OBSERVER') {
                            setActiveTab('collector');
                          }
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-700/70 transition ${
                          currentUser?.id === u.id ? 'bg-slate-700 text-teal-300 font-semibold' : 'text-slate-200'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {u.role} {u.assigned_point ? `• Gate ${u.assigned_point}` : ''}
                          </p>
                        </div>
                        {currentUser?.id === u.id && (
                          <UserCheck className="w-4 h-4 text-teal-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 border-t border-slate-800/80 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/40 font-semibold'
                    : item.highlight
                    ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700/80 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : item.highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.id === 'collector' && currentUser?.assigned_point && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-mono">
                    {currentUser.assigned_point}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
