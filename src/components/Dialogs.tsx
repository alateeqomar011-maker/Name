// Global dialogs: age gate, paywall, sign-in/up and content reports.

import { ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UsageMetric } from '../../shared/types.ts';
import { useI18n, type Key } from '../i18n/index.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

export function Modal({ children, onClose, wide, label }: { children: ReactNode; onClose?: () => void; wide?: boolean; label: string }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function AgeGate({ then }: { then?: () => void }) {
  const { t } = useI18n();
  const { me, setMe, closeDialog, toast } = useStore();
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = me?.ageBand === 'blocked';
  const current = new Date().getFullYear();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const y = Number(year);
    if (!Number.isInteger(y) || y < current - 110 || y > current) return toast(t('common.error'), true);
    setBusy(true);
    try {
      const r = await api.updateMe({ birthYear: y });
      setMe(r.me, r.usage);
      if (r.me.ageBand === 'blocked') return;
      closeDialog();
      then?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <Modal label={t('age.blocked_title')} onClose={closeDialog}>
        <h2>{t('age.blocked_title')}</h2>
        <p className="muted">{t('age.blocked_text')}</p>
        <div className="modal-actions">
          <button className="btn" onClick={closeDialog}>
            {t('common.close')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label={t('age.title')} onClose={closeDialog}>
      <div className="row" style={{ marginBottom: 8 }}>
        <ShieldCheck size={22} color="var(--holo)" />
        <h2 style={{ margin: 0 }}>{t('age.title')}</h2>
      </div>
      <p className="muted">{t('age.text')}</p>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="birth-year">{t('age.birth_year')}</label>
          <select id="birth-year" className="select" value={year} onChange={(e) => setYear(e.target.value)} required>
            <option value="" disabled>
              —
            </option>
            {Array.from({ length: 100 }, (_, i) => current - 6 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          {t('age.notice')}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={closeDialog}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!year || busy}>
            {t('age.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Paywall({ metric }: { metric: UsageMetric }) {
  const { t } = useI18n();
  const { closeDialog } = useStore();
  const navigate = useNavigate();
  const what = t(`premium.u.${metric}` as Key).toLowerCase();
  return (
    <Modal label={t('paywall.title')} onClose={closeDialog}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Sparkles size={22} color="var(--gold)" />
        <h2 style={{ margin: 0 }}>{t('paywall.title')}</h2>
      </div>
      <p className="muted">{t('paywall.text', { what })}</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={closeDialog}>
          {t('paywall.later')}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            closeDialog();
            navigate('/premium');
          }}
        >
          {t('paywall.upgrade')}
        </button>
      </div>
    </Modal>
  );
}

function AuthDialog({ mode: initial }: { mode: 'in' | 'up' }) {
  const { t } = useI18n();
  const { closeDialog, setMe, toast, refresh } = useStore();
  const [mode, setMode] = useState(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = mode === 'up' ? await api.signUp(email, password, name) : await api.logIn(email, password);
      setMe(r.me, r.usage);
      await refresh();
      closeDialog();
      toast(mode === 'up' ? '✓' : '👋');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label={mode === 'up' ? t('auth.title_up') : t('auth.title_in')} onClose={closeDialog}>
      <h2>{mode === 'up' ? t('auth.title_up') : t('auth.title_in')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('auth.sub')}
      </p>
      <form className="stack" onSubmit={submit}>
        {mode === 'up' && (
          <div className="field">
            <label htmlFor="auth-name">{t('common.display_name')}</label>
            <input id="auth-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-email">{t('common.email')}</label>
          <input id="auth-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="auth-pass">{t('common.password')}</label>
          <input
            id="auth-pass"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'up' ? 8 : 1}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          />
        </div>
        {error && <div className="banner" style={{ margin: 0 }}>{error}</div>}
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn ghost small" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
            {mode === 'up' ? t('auth.switch_in') : t('auth.switch_up')}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {mode === 'up' ? t('common.sign_up') : t('common.sign_in')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const REASONS = ['inappropriate', 'harmful', 'misleading', 'impersonation', 'hate', 'self-harm', 'other'] as const;

function ReportDialog({ characterId, conversationId, excerpt }: { characterId?: string; conversationId?: string; excerpt?: string }) {
  const { t } = useI18n();
  const { closeDialog, toast } = useStore();
  const [reason, setReason] = useState<string>('inappropriate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.report({ characterId, conversationId, reason, details, excerpt });
      toast(t('report.thanks'));
      closeDialog();
    } catch {
      toast(t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label={t('report.title')} onClose={closeDialog}>
      <h2>{t('report.title')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('report.text')}
      </p>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="report-reason">{t('report.reason')}</label>
          <select id="report-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`report.r.${r}` as Key)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-details">{t('report.details')}</label>
          <textarea id="report-details" className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={closeDialog}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={busy}>
            {t('report.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GlobalDialogs() {
  const { dialog } = useStore();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'age':
      return <AgeGate then={dialog.then} />;
    case 'paywall':
      return <Paywall metric={dialog.metric} />;
    case 'auth':
      return <AuthDialog mode={dialog.mode} />;
    case 'report':
      return <ReportDialog characterId={dialog.characterId} conversationId={dialog.conversationId} excerpt={dialog.excerpt} />;
  }
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
