import { useEffect, useState, type ReactNode } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import type { Job } from '../lib/api';
import { IAlert, ICheck, IInfo } from './Icons';

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok' | 'gold'; children: ReactNode }) {
  const Icon = kind === 'warn' || kind === 'err' ? IAlert : kind === 'ok' ? ICheck : IInfo;
  return (
    <div className={`notice ${kind}`} role={kind === 'err' ? 'alert' : undefined}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="row muted" role="status" style={{ padding: 24 }}>
      <Spinner /> {t('loading')}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <Notice kind="err">
      <div className="stack" style={{ gap: 8 }}>
        <span>{error === 'network' ? t('error_network') : error || t('error_generic')}</span>
        {onRetry && <button className="btn sm ghost" onClick={onRetry}>{t('retry')}</button>}
      </div>
    </Notice>
  );
}

export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, text, onCancel, onConfirm, danger = true, confirmLabel }: {
  open: boolean; text: string; onCancel: () => void; onConfirm: () => void; danger?: boolean; confirmLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onCancel} label={text}>
      <p>{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>{t('cancel')}</button>
        <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} autoFocus>{confirmLabel ?? t('delete')}</button>
      </div>
    </Modal>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => { toastSet = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(id);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function JobProgress({ job, onCancel }: { job: Job | null; onCancel?: () => void }) {
  const { t } = useI18n();
  if (!job) return null;
  const stageKey = `stage_${job.stage}` as Key;
  const label = job.status === 'queued'
    ? (job.queuePosition ? t('job_position', { n: job.queuePosition }) : t('job_queued'))
    : t(stageKey) !== stageKey ? t(stageKey) : job.stage;
  return (
    <div className="stack fade-in" aria-live="polite">
      <div className="row between">
        <span className="row" style={{ gap: 8 }}><span className="spinner" /> {label}</span>
        <span className="faint">{job.progress}%</span>
      </div>
      <div className="progress"><i style={{ width: `${Math.max(3, job.progress)}%` }} /></div>
      {onCancel && <div><button className="btn sm ghost" onClick={onCancel}>{t('cancel')}</button></div>}
    </div>
  );
}

export function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function Monogram({ name, lg }: { name: { ar: string }; lg?: boolean }) {
  const words = name.ar.replace(/^(ال)/, '').split(/\s+/).filter(Boolean);
  const letter = (words[0] || '?').replace(/^ال/, '').charAt(0);
  return <div className={`monogram ${lg ? 'lg' : ''}`} aria-hidden="true">{letter}</div>;
}
