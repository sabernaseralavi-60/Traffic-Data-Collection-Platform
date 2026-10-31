import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Users } from 'lucide-react';
import { api, errorText } from '../api';
import { AccountRow, Category, User, UserRole } from '../types';
import { Language, pick } from '../i18n';

interface Props {
  lang: Language;
  currentUser: User;
  categories: Category[];
  onCategoriesChanged: () => Promise<void>;
}

const MIN_PW: Record<string, number> = { ADMIN: 6, SUPERVISOR: 4, OBSERVER: 2 }; // same rule as the server: short secrets only where the damage is small
const inputCls = 'w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none';

export const AccountsView: React.FC<Props> = ({ lang, currentUser, onCategoriesChanged }) => {
  const [users, setUsers] = useState<AccountRow[]>([]);
  const [allCats, setAllCats] = useState<Category[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nu, setNu] = useState({ username: '', full_name: '', role: 'OBSERVER' as UserRole, password: '' });
  const [nc, setNc] = useState({ code: '', label_en: '', label_fa: '' });

  const load = useCallback(async () => {
    setUsers(await api<AccountRow[]>('GET', '/users'));
    setAllCats(await api<Category[]>('GET', '/categories?all=1'));
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ ok: false, text: errorText(e) })); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await load(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-testid="accounts-view">
      {msg && <p role={msg.ok ? 'status' : 'alert'} data-testid="accounts-msg" className={`text-xs rounded-xl p-3 border ${msg.ok ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300' : 'bg-rose-950/50 border-rose-800/60 text-rose-200'}`}>{msg.text}</p>}

      <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-teal-400" />{pick(lang, 'New account', 'حساب جدید')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input aria-label="Username" placeholder={pick(lang, 'username (2+ chars, a-z 0-9)', 'نام کاربری (۲ نویسه به بالا، لاتین)')} value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value.toLowerCase() })} className={inputCls} data-testid="new-username" />
          <input aria-label="Full name" placeholder={pick(lang, 'Full name', 'نام و نام خانوادگی')} value={nu.full_name} onChange={(e) => setNu({ ...nu, full_name: e.target.value })} className={inputCls} data-testid="new-fullname" />
          <select aria-label="Role" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as UserRole })} className={inputCls}><option value="OBSERVER">OBSERVER</option><option value="SUPERVISOR">SUPERVISOR</option><option value="ADMIN">ADMIN</option></select>
          <input aria-label="Password" type="password" autoComplete="new-password" placeholder={pick(lang, `password (min ${MIN_PW[nu.role]})`, `گذرواژه (حداقل ${MIN_PW[nu.role]})`)} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} className={inputCls} data-testid="new-password" />
          <button onClick={() => act(async () => { await api('POST', '/users', nu); setNu({ username: '', full_name: '', role: 'OBSERVER', password: '' }); }, pick(lang, 'Account created', 'حساب ساخته شد'))} className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-500 text-slate-950 text-xs font-bold" data-testid="create-user"><Plus className="w-4 h-4" />{pick(lang, 'Create', 'ساخت')}</button>
        </div>
        <p className="text-[11px] text-slate-500">{pick(lang, 'Assign observers to a study point under "Studies & Map".', 'تخصیص آمارگیر به ایستگاه در «طرح‌ها و نقشه» انجام می‌شود.')}</p>
      </section>

      <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800">
        <div className="overflow-x-auto"><table className="w-full text-xs text-start" data-testid="users-table">
          <thead><tr className="text-slate-400 border-b border-slate-800"><th className="py-2 text-start">{pick(lang, 'User', 'کاربر')}</th><th className="text-start">{pick(lang, 'Role', 'نقش')}</th><th className="text-start">{pick(lang, 'Assignments', 'تخصیص‌ها')}</th><th className="text-start">{pick(lang, 'Active', 'فعال')}</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-800/60">{users.map((u) => (
            <tr key={u.id}>
              <td className="py-2.5"><p className="font-bold text-white">{u.full_name}</p><p className="font-mono text-slate-400">@{u.username}</p></td>
              <td>{u.role}</td>
              <td className="text-slate-300">{u.assignments?.length ? u.assignments.map((a) => `${a.point_code} (${a.study_name})`).join(', ') : '-'}</td>
              <td><input type="checkbox" aria-label="active" checked={u.active} disabled={u.id === currentUser.id} onChange={(e) => act(() => api('PATCH', `/users/${u.id}`, { active: e.target.checked }), pick(lang, 'Updated', 'به‌روز شد'))} /></td>
              <td className="text-end"><button onClick={() => { const pw = window.prompt(pick(lang, `New password for ${u.username} (min ${MIN_PW[u.role]} characters):`, `گذرواژهٔ جدید برای ${u.username} (حداقل ${MIN_PW[u.role]} نویسه):`)); if (pw) void act(() => api('PATCH', `/users/${u.id}`, { password: pw }), pick(lang, 'Password changed; the user was signed out', 'گذرواژه تغییر کرد؛ کاربر از سامانه خارج شد')); }} className="inline-flex items-center gap-1 text-slate-300 hover:text-teal-300"><KeyRound className="w-3.5 h-3.5" />{pick(lang, 'Reset password', 'بازنشانی گذرواژه')}</button></td>
            </tr>))}</tbody></table></div>
      </section>

      <section className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-3">
        <h2 className="text-sm font-bold text-white">{pick(lang, 'Vehicle categories (configurable)', 'دسته‌بندی وسایل نقلیه (قابل تنظیم)')}</h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">{allCats.map((c) => (
          <li key={c.code} className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"><span><b className="font-mono text-teal-300">{c.code}</b> {c.label_en} / {c.label_fa}</span>
            <label className="flex items-center gap-1.5 text-slate-400"><input type="checkbox" checked={c.active} disabled={c.code === 'UNKNOWN'} onChange={(e) => act(async () => { await api('PATCH', `/categories/${c.code}`, { active: e.target.checked }); await onCategoriesChanged(); }, pick(lang, 'Updated', 'به‌روز شد'))} />{pick(lang, 'on', 'فعال')}</label></li>))}</ul>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input aria-label="Code" placeholder="CODE" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} className={`${inputCls} font-mono`} />
          <input aria-label="English label" placeholder="English" value={nc.label_en} onChange={(e) => setNc({ ...nc, label_en: e.target.value })} className={inputCls} />
          <input aria-label="Persian label" placeholder="فارسی" value={nc.label_fa} onChange={(e) => setNc({ ...nc, label_fa: e.target.value })} className={inputCls} />
          <button onClick={() => act(async () => { await api('POST', '/categories', nc); setNc({ code: '', label_en: '', label_fa: '' }); await onCategoriesChanged(); }, pick(lang, 'Category added', 'دسته افزوده شد'))} className="rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold">{pick(lang, 'Add category', 'افزودن دسته')}</button>
        </div>
      </section>
    </div>
  );
};
