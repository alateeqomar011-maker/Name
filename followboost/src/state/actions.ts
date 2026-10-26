import { getPlatform } from '../lib/platforms';
import { navigate } from '../lib/router';
import { isActive, MAX_ACTIVE, type GrowthRequest, type RequestInput } from '../lib/requests';
import { useStore } from './store';
import { useUI } from './ui';

/** Request actions with the confirmations and feedback every screen shares. */
export function useRequestActions() {
  const store = useStore();
  const ui = useUI();

  const start = (input: RequestInput): GrowthRequest | null => {
    const result = store.submit(input);
    if (result.ok) {
      ui.openProcessing(result.request.id);
      return result.request;
    }
    if (result.reason === 'duplicate') {
      ui.toast({
        tone: 'warning',
        title: 'Already in progress',
        body: `An identical request for @${input.username} is ${result.existing.status === 'queued' ? 'queued' : 'running'}.`,
        action: { label: 'Show it', onClick: () => ui.openProcessing(result.existing.id) },
      });
    } else {
      ui.toast({
        tone: 'warning',
        title: 'Queue is full',
        body: `Up to ${MAX_ACTIVE} requests can wait at once. Let one finish or cancel one first.`,
        action: { label: 'Dashboard', onClick: () => navigate('/dashboard') },
      });
    }
    return null;
  };

  const rerun = (req: GrowthRequest) =>
    start({ platform: req.platform, username: req.username, quantity: req.quantity, mode: req.mode, niche: req.niche });

  const cancel = (req: GrowthRequest) => {
    if (!isActive(req)) return;
    store.cancel(req.id);
    ui.toast({ tone: 'info', title: 'Request cancelled', body: `@${req.username} · ${getPlatform(req.platform).name}` });
  };

  const remove = async (req: GrowthRequest): Promise<boolean> => {
    const ok = await ui.confirm({
      title: isActive(req) ? 'Cancel and delete this request?' : 'Delete this request?',
      body: `${req.id} for @${req.username} will be removed from your history. This can't be undone.`,
      confirmLabel: 'Delete request',
      danger: true,
    });
    if (!ok) return false;
    store.remove(req.id);
    ui.toast({ tone: 'success', title: 'Request deleted', body: req.id });
    return true;
  };

  /** Loads a request's settings into the generator so the user can adjust them. */
  const edit = (req: GrowthRequest, patch: Partial<RequestInput> = {}) => {
    store.setDraft({
      platform: req.platform,
      username: req.username,
      quantity: req.quantity,
      mode: req.mode,
      ...(req.niche ? { niche: req.niche } : {}),
      ...patch,
    });
    navigate('/generate');
  };

  return { start, rerun, cancel, remove, edit };
}
