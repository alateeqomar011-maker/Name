import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Modal } from '../components/Modal';
import { getPlatform } from '../lib/platforms';
import { navigate } from '../lib/router';
import type { Status } from '../lib/requests';
import { useStore } from './store';

export type Tone = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
}

interface UI {
  toast: (t: ToastInput) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  processingId: string | null;
  openProcessing: (id: string) => void;
  closeProcessing: () => void;
}

const UIContext = createContext<UI | null>(null);

const TOAST_MS = 5000;
const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const nextId = useRef(1);
  const { requests } = useStore();

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  const settleConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  // Announce finished requests the user isn't already watching in the progress dialog.
  const lastStatus = useRef<Map<string, Status> | null>(null);
  useEffect(() => {
    const previous = lastStatus.current;
    lastStatus.current = new Map(requests.map((r) => [r.id, r.status]));
    if (!previous) return;
    for (const r of requests) {
      const before = previous.get(r.id);
      if (!before || before === r.status || r.id === processingId) continue;
      const where = `@${r.username} · ${getPlatform(r.platform).name}`;
      const view = { label: 'View', onClick: () => navigate(`/requests/${r.id}`) };
      if (r.status === 'completed') {
        toast({
          tone: 'success',
          title: r.mode === 'demo' ? 'Demo simulation complete' : 'Growth plan ready',
          body: where,
          action: view,
        });
      } else if (r.status === 'failed') {
        toast({ tone: 'error', title: 'Request failed', body: r.failure ?? where, action: view });
      }
    }
  }, [requests, processingId, toast]);

  const ui = useMemo<UI>(
    () => ({
      toast,
      confirm,
      processingId,
      openProcessing: setProcessingId,
      closeProcessing: () => setProcessingId(null),
    }),
    [toast, confirm, processingId],
  );

  return (
    <UIContext.Provider value={ui}>
      {children}
      <div className="toaster" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              <Icon size={18} className="toast-icon" aria-hidden />
              <div className="toast-text">
                <strong>{t.title}</strong>
                {t.body && <span>{t.body}</span>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <Modal open={!!confirmState} onClose={() => settleConfirm(false)} labelledBy="confirm-title" describedBy="confirm-body" size="sm" hideClose>
        {confirmState && (
          <div className="confirm">
            <div className={`confirm-icon ${confirmState.danger ? 'is-danger' : ''}`}>
              <AlertTriangle size={20} aria-hidden />
            </div>
            <h2 id="confirm-title">{confirmState.title}</h2>
            <p id="confirm-body">{confirmState.body}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => settleConfirm(false)} autoFocus>
                Keep it
              </button>
              <button
                type="button"
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settleConfirm(true)}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </UIContext.Provider>
  );
}

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error('useUI must be used inside UIProvider');
  return ui;
}
