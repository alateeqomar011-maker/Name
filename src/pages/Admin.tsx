// Operator console: grow the library without a rebuild (add, edit, bulk-import, disable characters),
// review reports, celebrity requests, rights-holder requests and the moderation log.

import { useCallback, useEffect, useState } from 'react';
import { CATEGORIES } from '../../shared/categories.ts';
import type { Character } from '../../shared/types.ts';
import { Portrait } from '../components/Portrait.tsx';

type Tab = 'overview' | 'characters' | 'new' | 'import' | 'reports' | 'requests' | 'rights' | 'moderation';

function useAdmin() {
  const [token, setTokenState] = useState(() => sessionStorage.getItem('sc.admin') ?? '');
  const setToken = (v: string) => {
    sessionStorage.setItem('sc.admin', v);
    setTokenState(v);
  };
  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await fetch(`/api/admin${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      return data as T;
    },
    [token],
  );
  return { token, setToken, call };
}

const EXAMPLE = `{
  "name": "New Star",
  "nameAr": "نجم جديد",
  "category": "football",
  "country": "SA",
  "gender": "m",
  "role": "Winger",
  "knownFor": "One-line, well-established public description",
  "traits": ["energetic", "humble", "funny"],
  "popularity": 70,
  "aliases": ["Nickname"],
  "colors": ["#006c35", "#ffffff"],
  "look": { "hair": "fade", "facial": "stubble", "accessory": "none", "outfit": "jersey" },
  "tags": ["rising"]
}`;

export default function Admin() {
  const { token, setToken, call } = useAdmin();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [chars, setChars] = useState<Character[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string>('');
  const [json, setJson] = useState(EXAMPLE);
  const [result, setResult] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (tab === 'overview') setOverview(await call('GET', '/overview'));
      else if (tab === 'characters') setChars((await call<{ items: Character[] }>('GET', `/characters?q=${encodeURIComponent(q)}`)).items);
      else if (['reports', 'requests', 'rights', 'moderation'].includes(tab)) setRows((await call<{ items: Record<string, unknown>[] }>('GET', `/${tab}`)).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tab, q, call]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  if (!token) {
    return (
      <main className="page narrow">
        <h1 className="page-title">Admin</h1>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            setToken(String(new FormData(e.currentTarget).get('token') ?? ''));
          }}
        >
          <div className="field">
            <label htmlFor="token">ADMIN_TOKEN</label>
            <input id="token" name="token" className="input" type="password" autoComplete="off" />
          </div>
          <button className="btn primary">Unlock</button>
        </form>
      </main>
    );
  }

  const save = async (method: 'POST' | 'PUT') => {
    setResult('');
    try {
      const body = JSON.parse(json);
      const r = await call<{ character: Character }>(method, method === 'PUT' ? `/characters/${editing}` : '/characters', body);
      setResult(`Saved ${r.character.name} (${r.character.id}). It is live now.`);
      setEditing(r.character.id);
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const doImport = async () => {
    setResult('');
    try {
      const r = await call<{ ok: string[]; errors: { index: number; error: string }[] }>('POST', '/import', JSON.parse(json));
      setResult(`Imported ${r.ok.length}. ${r.errors.length ? `Errors: ${r.errors.map((e) => `#${e.index}: ${e.error}`).join('; ')}` : ''}`);
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const status = async (kind: 'reports' | 'requests' | 'rights', id: string, value: string) => {
    await call('PATCH', `/${kind}/${id}`, { status: value });
    void load();
  };

  let preview: Character | null = null;
  try {
    const p = JSON.parse(json);
    if (p && p.name) {
      preview = {
        ...p,
        id: p.id ?? 'preview',
        gender: p.gender ?? 'm',
        colors: p.colors ?? ['#5ce1ff', '#ffffff'],
        environment: p.environment ?? 'studio',
        look: { hair: p.gender === 'f' ? 'long' : 'short', facial: 'none', accessory: 'none', outfit: 'tee', ...(p.look ?? {}) },
      };
    }
  } catch {
    preview = null;
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Admin</h1>
        <button className="btn small ghost" onClick={() => setToken('')}>
          Lock
        </button>
      </div>
      <div className="tabs">
        {(['overview', 'characters', 'new', 'import', 'reports', 'requests', 'rights', 'moderation'] as Tab[]).map((x) => (
          <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {error && <div className="banner">{error}</div>}

      {tab === 'overview' && overview && (
        <div className="kpis">
          {(['users', 'accounts', 'premium', 'conversations', 'openReports', 'openRequests', 'openRights', 'moderationLast24h'] as const).map((k) => (
            <div className="kpi" key={k}>
              <b>{String(overview[k])}</b>
              <small>{k}</small>
            </div>
          ))}
          <div className="kpi">
            <b>{String((overview.characters as { enabled: number }).enabled)}</b>
            <small>characters live</small>
          </div>
          <div className="kpi" style={{ gridColumn: '1 / -1' }}>
            <small>Do-not-simulate list</small>
            <div style={{ marginTop: 6 }}>{(overview.optOuts as string[]).join(' · ')}</div>
          </div>
        </div>
      )}

      {tab === 'characters' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Category</th>
                <th>Likeness / voice</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chars.map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 52 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden' }}>
                      <Portrait character={c} width={110} height={110} framing="orb" />
                    </div>
                  </td>
                  <td>
                    <b>{c.name}</b>
                    <div className="faint code">{c.id}</div>
                  </td>
                  <td>{c.category}</td>
                  <td>
                    {c.likeness.status} / {c.voice.authorized ? 'licensed' : 'synthetic'}
                  </td>
                  <td>{c.source}</td>
                  <td className="row">
                    <button
                      className="btn small"
                      onClick={() => {
                        setEditing(c.id);
                        const { source: _s, ...rest } = c;
                        void _s;
                        setJson(JSON.stringify(rest, null, 2));
                        setTab('new');
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn small${c.enabled ? '' : ' primary'}`}
                      onClick={async () => {
                        await call('POST', `/characters/${c.id}/enabled`, { enabled: !c.enabled });
                        void load();
                      }}
                    >
                      {c.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(tab === 'new' || tab === 'import') && (
        <div className="profile-hero" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.6fr)' }}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {tab === 'new'
                ? 'Compact JSON is enough: anything omitted gets defaults from the category, country and gender. Voice replicas and photoreal likenesses only activate with a licenceRef.'
                : 'Paste a JSON array of characters (or { "characters": [...] }). Up to 5,000 per request. Everything goes live immediately.'}
            </p>
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>
              Categories: {CATEGORIES.map((c) => c.id).join(', ')}
            </p>
            <textarea className="textarea code" style={{ minHeight: 420 }} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
            <div className="row wrap">
              {tab === 'new' ? (
                <>
                  <button className="btn primary" onClick={() => void save('POST')}>
                    Save as new
                  </button>
                  {editing && (
                    <button className="btn" onClick={() => void save('PUT')}>
                      Update {editing}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label className="btn">
                    Load file
                    <input type="file" accept="application/json" hidden onChange={async (e) => setJson(await (e.target.files?.[0]?.text() ?? Promise.resolve(json)))} />
                  </label>
                  <button className="btn primary" onClick={() => void doImport()}>
                    Import
                  </button>
                </>
              )}
            </div>
            {result && <div className="banner info">{result}</div>}
          </div>
          {tab === 'new' && preview && (
            <div className="card" style={{ cursor: 'default' }}>
              <Portrait key={JSON.stringify(preview.look) + preview.colors.join()} character={preview} className="card-img" eager />
            </div>
          )}
        </div>
      )}

      {['reports', 'requests', 'rights', 'moderation'].includes(tab) && (
        <table className="admin-table">
          <thead>
            <tr>
              {Object.keys(rows[0] ?? {}).map((k) => (
                <th key={k}>{k}</th>
              ))}
              {tab !== 'moderation' && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                {Object.entries(r).map(([k, v]) => (
                  <td key={k} className={k === 'excerpt' || k === 'details' ? 'code' : undefined} style={{ maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {String(v ?? '')}
                  </td>
                ))}
                {tab !== 'moderation' && (
                  <td>
                    <select
                      className="select"
                      value={String(r.status)}
                      onChange={(e) => void status(tab as 'reports' | 'requests' | 'rights', String(r.id), e.target.value)}
                    >
                      {(tab === 'reports' ? ['open', 'reviewing', 'resolved', 'dismissed'] : tab === 'requests' ? ['open', 'planned', 'added', 'declined'] : ['open', 'approved', 'rejected', 'resolved']).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
