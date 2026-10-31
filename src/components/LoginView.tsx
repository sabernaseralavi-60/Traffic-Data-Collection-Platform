import React, { useState } from 'react';
import { Car, Globe, Lock } from 'lucide-react';
import { api, errorText } from '../api';
import { User } from '../types';
import { Language, getT, pick } from '../i18n';

interface Props {
  lang: Language;
  setLang: (l: Language) => void;
  notice?: string | null;
  onLoggedIn: (u: User) => void;
}

/** Uncontrolled inputs read at submit: autofill and typing before hydration both work. */
export const LoginView: React.FC<Props> = ({ lang, setLang, notice, onLoggedIn }) => {
  const t = getT(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>('POST', '/auth/login', { username: String(f.get('username') || '').trim(), password: String(f.get('password') || '') });
      onLoggedIn(r.user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end">
          <button type="button" onClick={() => setLang(lang === 'en' ? 'fa' : 'en')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700">
            <Globe className="w-3.5 h-3.5 text-teal-400" />{lang === 'en' ? 'فارسی' : 'English'}
          </button>
        </div>
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20"><Car className="w-8 h-8 text-white" /></div>
          <h1 className="text-2xl font-extrabold">{t.app_title}</h1>
          <p className="text-xs text-slate-400">{t.app_subtitle}</p>
        </div>
        <form onSubmit={submit} method="post" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl" data-testid="login-form">
          {notice && <p className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800/60 rounded-xl p-2.5">{notice}</p>}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-300">{pick(lang, 'Username', 'نام کاربری')}</span>
            <input name="username" autoComplete="username" autoCapitalize="none" required className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-teal-400 focus:outline-none" data-testid="login-username" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-300">{pick(lang, 'Password', 'گذرواژه')}</span>
            <input name="password" type="password" autoComplete="current-password" required className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-teal-400 focus:outline-none" data-testid="login-password" />
          </label>
          {error && <p role="alert" className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-2.5" data-testid="login-error">{error}</p>}
          <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold flex items-center justify-center gap-2" data-testid="login-submit">
            <Lock className="w-4 h-4" />{busy ? pick(lang, 'Signing in…', 'در حال ورود…') : pick(lang, 'Sign in', 'ورود')}
          </button>
        </form>
        <p className="text-[11px] text-center text-slate-500">{pick(lang, 'Accounts are created by your administrator.', 'حساب‌ها توسط مدیر سامانه ساخته می‌شوند.')}</p>
      </div>
    </div>
  );
};
