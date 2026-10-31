import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  Shield,
  MapPin,
  Clock,
  Plus,
  Key,
  CheckCircle2
} from 'lucide-react';
import { User, Study } from '../types';
import { Language, getT } from '../i18n';

interface ObserverManagementProps {
  users: User[];
  activeStudy: Study | null;
  lang: Language;
  currentUser: User | null;
  onSwitchUser: (userId: string) => void;
}

export const ObserverManagement: React.FC<ObserverManagementProps> = ({
  users,
  activeStudy,
  lang,
  currentUser,
  onSwitchUser,
}) => {
  const t = getT(lang);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title */}
      <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            <span>{t.nav_observers}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage field observer accounts, station gate assignments, and access roles
          </p>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          {users.length} Active Accounts
        </div>
      </div>

      {/* Observers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => {
          const isCurrentUser = currentUser?.id === u.id;
          const assignedPt = activeStudy?.points.find((p) => p.code === u.assigned_point);
          const isEntry = assignedPt?.point_type === 'ENTRY';

          return (
            <div
              key={u.id}
              className={`rounded-3xl p-5 border transition-all ${
                isCurrentUser
                  ? 'bg-slate-900 border-teal-400 ring-2 ring-teal-500/20 shadow-xl'
                  : 'bg-slate-900/90 border-slate-800 shadow-lg'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-xs text-teal-300">
                      {u.role === 'ADMIN' ? 'AD' : u.role === 'SUPERVISOR' ? 'SU' : 'OB'}
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-sm">{u.full_name}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">@{u.username}</p>
                    </div>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    u.role === 'ADMIN'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : u.role === 'SUPERVISOR'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  }`}
                >
                  {u.role}
                </span>
              </div>

              {/* Station Assignment */}
              <div className="mt-4 p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Assigned Station:</span>
                  {u.assigned_point ? (
                    <span
                      className={`font-mono font-black px-2 py-0.5 rounded text-xs ${
                        isEntry
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                      }`}
                    >
                      {u.assigned_point} ({assignedPt?.point_type || 'STATION'})
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs italic">All Stations (Admin)</span>
                  )}
                </div>
                {assignedPt && (
                  <p className="text-[11px] text-slate-400 truncate">{assignedPt.description}</p>
                )}
              </div>

              {/* Action */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Active shift</span>
                </span>

                <button
                  onClick={() => onSwitchUser(u.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    isCurrentUser
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {isCurrentUser ? 'Active Session' : 'Switch to this Account'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
