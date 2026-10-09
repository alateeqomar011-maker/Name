import { ChevronUp, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories.ts';
import type { CelebrityRequest } from '../../shared/types.ts';
import { useI18n, type Key } from '../i18n/index.tsx';
import { ApiError, api } from '../lib/api.ts';
import { categoryLabel } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

export default function Requests() {
  const { t } = useI18n();
  const { toast } = useStore();
  const [params] = useSearchParams();
  const [items, setItems] = useState<CelebrityRequest[]>([]);
  const [form, setForm] = useState({ name: params.get('name') ?? '', category: '', country: '', reason: '', links: '' });
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    api.requests().then((r) => setItems(r.items)).catch(() => undefined);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setExists(null);
    try {
      const r = await api.submitRequest(form);
      toast(r.merged ? t('requests.merged') : t('requests.thanks'));
      setItems((list) => [r.request, ...list.filter((x) => x.id !== r.request.id)].sort((a, b) => b.votes - a.votes));
      setForm({ name: '', category: '', country: '', reason: '', links: '' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'exists') setExists({ id: String(err.data.characterId), name: form.name });
      else if (err instanceof ApiError && err.code === 'opted_out') toast(t('requests.opted_out'), true);
      else toast(err instanceof ApiError ? err.message : t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (r: CelebrityRequest) => {
    if (r.voted) return;
    const res = await api.vote(r.id);
    setItems((list) => list.map((x) => (x.id === r.id ? res.request : x)));
  };

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('requests.title')}</h1>
          <p className="page-sub">{t('requests.sub')}</p>
        </div>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rq-name">{t('requests.name')}</label>
            <input id="rq-name" className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rq-cat">{t('requests.category')}</label>
            <select id="rq-cat" className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c.id, t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rq-country">{t('requests.country')}</label>
            <input id="rq-country" className="input" maxLength={40} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="rq-reason">{t('requests.reason')}</label>
          <textarea id="rq-reason" className="textarea" maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="rq-links">{t('requests.links')}</label>
          <input id="rq-links" className="input" maxLength={500} value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} />
        </div>
        {exists && (
          <div className="banner info">
            {t('requests.exists')}{' '}
            <Link to={`/c/${exists.id}`} style={{ textDecoration: 'underline' }}>
              {exists.name}
            </Link>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={busy}>
            <Send size={16} className="flip-rtl" /> {t('requests.submit')}
          </button>
        </div>
      </form>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          {t('requests.top')}
        </h2>
        <div className="list">
          {items.map((r) => (
            <div key={r.id} className="list-item">
              <button className={`vote${r.voted ? ' on' : ''}`} onClick={() => void vote(r)} aria-label={t('requests.votes')} aria-pressed={r.voted}>
                <ChevronUp size={18} />
                {r.votes}
              </button>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{r.name}</div>
                <div className="sub">
                  {[r.category && categoryLabel(r.category as never, t), r.country].filter(Boolean).join(' · ')}
                  {r.reason && ` — ${r.reason}`}
                </div>
              </div>
              <span className={`tag${r.status === 'added' ? ' ok' : r.status === 'planned' ? ' warn' : ''}`}>{t(`requests.status.${r.status}` as Key)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
