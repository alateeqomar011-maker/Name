import { useMemo, useState } from 'react';
import { Download, Eye, Plus, RotateCcw, Search, SearchX, Trash2, History as HistoryIcon } from 'lucide-react';
import { EmptyState, ModeBadge, ProgressBar, StatusBadge } from '../components/bits';
import { PlatformBadge } from '../components/icons';
import { formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { downloadText, requestsToCsv } from '../lib/export';
import { getPlatform, PLATFORMS, type PlatformId } from '../lib/platforms';
import { isActive, progressAt, type GrowthRequest, type Status } from '../lib/requests';
import type { Mode } from '../lib/catalog';
import { useRequestActions } from '../state/actions';
import { useNow, useStore } from '../state/store';
import { useUI } from '../state/ui';

const PAGE = 20;

type Sort = 'newest' | 'oldest' | 'largest';

function RowActions({ req }: { req: GrowthRequest }) {
  const actions = useRequestActions();
  return (
    <div className="row-actions">
      <a className="btn btn-icon btn-ghost" href={`#/requests/${req.id}`} aria-label={`View ${req.id}`} title="View">
        <Eye size={16} />
      </a>
      <button type="button" className="btn btn-icon btn-ghost" aria-label={`Run ${req.id} again`} title="Run again" onClick={() => actions.rerun(req)}>
        <RotateCcw size={16} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-ghost btn-danger-text"
        aria-label={`Delete ${req.id}`}
        title="Delete"
        onClick={() => void actions.remove(req)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function HistoryView() {
  const { requests, clearHistory } = useStore();
  const ui = useUI();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | Mode>('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [platform, setPlatform] = useState<'all' | PlatformId>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    const list = requests.filter(
      (r) =>
        (mode === 'all' || r.mode === mode) &&
        (status === 'all' || r.status === status) &&
        (platform === 'all' || r.platform === platform) &&
        (!q || r.username.includes(q) || r.id.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) =>
      sort === 'oldest' ? a.createdAt - b.createdAt : sort === 'largest' ? b.quantity - a.quantity || b.createdAt - a.createdAt : b.createdAt - a.createdAt,
    );
  }, [requests, query, mode, status, platform, sort]);

  const filtering = query !== '' || mode !== 'all' || status !== 'all' || platform !== 'all';
  const resetFilters = () => {
    setQuery('');
    setMode('all');
    setStatus('all');
    setPlatform('all');
    setLimit(PAGE);
  };
  const finished = requests.filter((r) => !isActive(r)).length;
  const shown = filtered.slice(0, limit);

  const exportCsv = () => {
    downloadText(`followboost-history-${new Date().toISOString().slice(0, 10)}.csv`, requestsToCsv(filtered), 'text/csv');
    ui.toast({ tone: 'success', title: 'History exported', body: `${filtered.length} request${filtered.length === 1 ? '' : 's'} saved as CSV.` });
  };

  const clear = async () => {
    const ok = await ui.confirm({
      title: 'Clear request history?',
      body: `This removes ${finished} finished request${finished === 1 ? '' : 's'} from this browser. Requests that are still running are kept.`,
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!ok) return;
    clearHistory();
    ui.toast({ tone: 'success', title: 'History cleared' });
  };

  return (
    <div className="view history">
      <header className="page-head page-head-row">
        <div>
          <span className="eyebrow">Requests</span>
          <h1>History</h1>
          <p className="lede">Every demo simulation and growth plan you've run in this browser.</p>
        </div>
        {requests.length > 0 && (
          <div className="head-actions">
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!filtered.length}>
              <Download size={16} aria-hidden /> Export CSV
            </button>
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => void clear()} disabled={!finished}>
              <Trash2 size={16} aria-hidden /> Clear history
            </button>
          </div>
        )}
      </header>

      {requests.length === 0 ? (
        <div className="card pad">
          <EmptyState
            icon={<HistoryIcon size={22} />}
            title="No requests yet"
            body="Your demo simulations and growth plans will be listed here with their status."
            action={
              <a className="btn btn-primary" href="#/generate">
                <Plus size={16} aria-hidden /> Start a request
              </a>
            }
          />
        </div>
      ) : (
        <>
          <div className="filters" role="search">
            <div className="search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                placeholder="Search username or request ID"
                aria-label="Search requests"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
              />
            </div>
            <div className="select-wrap">
              <select aria-label="Filter by follower type" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="all">All types</option>
                <option value="demo">Demo mode</option>
                <option value="growth">Real growth</option>
              </select>
            </div>
            <div className="select-wrap">
              <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="all">All statuses</option>
                <option value="queued">Queued</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="select-wrap">
              <select aria-label="Filter by platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
                <option value="all">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="select-wrap">
              <select aria-label="Sort requests" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="largest">Largest quantity</option>
              </select>
            </div>
          </div>
          <div className="filter-summary" aria-live="polite">
            <span>
              {filtered.length} of {requests.length} request{requests.length === 1 ? '' : 's'}
            </span>
            {filtering && (
              <button type="button" className="link-btn" onClick={resetFilters}>
                Reset filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card pad">
              <EmptyState
                icon={<SearchX size={22} />}
                title="No matching requests"
                body="Try a different search or clear the filters."
                action={
                  <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                    Reset filters
                  </button>
                }
              />
            </div>
          ) : (
            <div className="card history-card">
              <div className="table-scroll history-table">
                <table className="table">
                  <caption className="sr-only">Request history</caption>
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col" className="num">
                        Quantity
                      </th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <a className="cell-req" href={`#/requests/${r.id}`}>
                            <PlatformBadge id={r.platform} size={32} />
                            <span className="cell-text">
                              <strong>@{r.username}</strong>
                              <small>
                                {getPlatform(r.platform).name} · <span className="mono">{r.id}</span>
                              </small>
                            </span>
                          </a>
                        </td>
                        <td className="num">{formatNumber(r.quantity)}</td>
                        <td>
                          <ModeBadge mode={r.mode} />
                        </td>
                        <td>
                          <div className="cell-status">
                            <StatusBadge status={r.status} />
                            {r.status === 'processing' && <ProgressBar value={progressAt(r, now)} label={`Progress for ${r.id}`} />}
                          </div>
                        </td>
                        <td className="cell-date" title={formatDateTime(r.createdAt)}>
                          {formatRelative(r.createdAt, now)}
                        </td>
                        <td>
                          <RowActions req={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="history-cards">
                {shown.map((r) => (
                  <li key={r.id} className="history-item">
                    <a className="cell-req" href={`#/requests/${r.id}`}>
                      <PlatformBadge id={r.platform} size={36} />
                      <span className="cell-text">
                        <strong>@{r.username}</strong>
                        <small>
                          {getPlatform(r.platform).name} · <span className="mono">{r.id}</span> · {formatRelative(r.createdAt, now)}
                        </small>
                      </span>
                      <span className="history-qty">{formatNumber(r.quantity)}</span>
                    </a>
                    {r.status === 'processing' && <ProgressBar value={progressAt(r, now)} label={`Progress for ${r.id}`} />}
                    <div className="history-item-foot">
                      <div className="badge-row">
                        <ModeBadge mode={r.mode} />
                        <StatusBadge status={r.status} />
                      </div>
                      <RowActions req={r} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filtered.length > shown.length && (
            <div className="load-more">
              <button type="button" className="btn btn-secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, filtered.length - shown.length)} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
