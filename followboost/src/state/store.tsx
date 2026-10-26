import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  advance,
  cancelRequest,
  createRequest,
  isActive,
  MAX_ACTIVE,
  sameTarget,
  type GrowthRequest,
  type RequestInput,
} from '../lib/requests';
import { DEFAULT_DRAFT, HISTORY_LIMIT, loadPersisted, savePersisted, type Draft } from '../lib/storage';

interface State {
  requests: GrowthRequest[];
  draft: Draft;
}

type Action =
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'submit'; request: GrowthRequest }
  | { type: 'advance'; now: number }
  | { type: 'cancel'; id: string; now: number }
  | { type: 'delete'; id: string }
  | { type: 'clearHistory' }
  | { type: 'reset' }
  | { type: 'toggleTask'; id: string; taskId: string };

function trimHistory(requests: GrowthRequest[]): GrowthRequest[] {
  if (requests.length <= HISTORY_LIMIT) return requests;
  const active = requests.filter(isActive);
  const finished = requests.filter((r) => !isActive(r)).slice(0, HISTORY_LIMIT - active.length);
  return requests.filter((r) => active.includes(r) || finished.includes(r));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'draft':
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case 'submit':
      return { ...state, requests: trimHistory([action.request, ...state.requests]) };
    case 'advance': {
      const { requests } = advance(state.requests, action.now);
      return requests === state.requests ? state : { ...state, requests };
    }
    case 'cancel':
      return {
        ...state,
        requests: state.requests.map((r) => (r.id === action.id ? cancelRequest(r, action.now) : r)),
      };
    case 'delete':
      return { ...state, requests: state.requests.filter((r) => r.id !== action.id) };
    case 'clearHistory':
      return { ...state, requests: state.requests.filter(isActive) };
    case 'reset':
      return { requests: [], draft: DEFAULT_DRAFT };
    case 'toggleTask':
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== action.id) return r;
          const done = r.doneTasks.includes(action.taskId)
            ? r.doneTasks.filter((t) => t !== action.taskId)
            : [...r.doneTasks, action.taskId];
          return { ...r, doneTasks: done };
        }),
      };
  }
}

export type SubmitResult =
  | { ok: true; request: GrowthRequest }
  | { ok: false; reason: 'duplicate'; existing: GrowthRequest }
  | { ok: false; reason: 'busy' };

interface Store {
  requests: GrowthRequest[];
  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
  submit: (input: RequestInput) => SubmitResult;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearHistory: () => void;
  reset: () => void;
  toggleTask: (id: string, taskId: string) => void;
}

const StoreContext = createContext<Store | null>(null);
const NowContext = createContext<number>(0);

/** How often live progress re-renders while something is running. */
const TICK_MS = 100;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const loaded = loadPersisted();
    // Settle anything that finished while the page was closed.
    return { ...loaded, requests: advance(loaded.requests, Date.now()).requests };
  });
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  const hasActive = state.requests.some(isActive);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      dispatch({ type: 'advance', now: t });
      setNow(t);
    };
    tick();
    // Relative timestamps still refresh when idle, just far less often.
    const id = window.setInterval(tick, hasActive ? TICK_MS : 15000);
    return () => window.clearInterval(id);
  }, [hasActive]);

  useEffect(() => {
    savePersisted({ requests: state.requests, draft: state.draft });
  }, [state.requests, state.draft]);

  const store = useMemo<Store>(
    () => ({
      requests: state.requests,
      draft: state.draft,
      setDraft: (patch) => dispatch({ type: 'draft', patch }),
      submit: (input) => {
        const current = stateRef.current.requests;
        const active = current.filter(isActive);
        const existing = active.find((r) => sameTarget(r, input));
        if (existing) return { ok: false, reason: 'duplicate', existing };
        if (active.length >= MAX_ACTIVE) return { ok: false, reason: 'busy' };
        const request = createRequest(input, Date.now());
        dispatch({ type: 'submit', request });
        // Start it right away if the queue is empty.
        dispatch({ type: 'advance', now: Date.now() });
        return { ok: true, request };
      },
      cancel: (id) => dispatch({ type: 'cancel', id, now: Date.now() }),
      remove: (id) => dispatch({ type: 'delete', id }),
      clearHistory: () => dispatch({ type: 'clearHistory' }),
      reset: () => dispatch({ type: 'reset' }),
      toggleTask: (id, taskId) => dispatch({ type: 'toggleTask', id, taskId }),
    }),
    [state.requests, state.draft],
  );

  return (
    <StoreContext.Provider value={store}>
      <NowContext.Provider value={now}>{children}</NowContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

/** Current time, refreshed every tick while a request is running. */
export function useNow(): number {
  return useContext(NowContext);
}

export function useRequest(id: string | null | undefined): GrowthRequest | undefined {
  const { requests } = useStore();
  return id ? requests.find((r) => r.id === id) : undefined;
}
