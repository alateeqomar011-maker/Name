import { Search, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SCENARIOS } from '../../shared/scenarios.ts';
import type { CharacterSummary, ScenarioId } from '../../shared/types.ts';
import { CharacterCard } from '../components/CharacterCard.tsx';
import { Portrait } from '../components/Portrait.tsx';
import { useI18n, type UiLang } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { displayName } from '../lib/format.ts';
import { ROOMS } from '../lib/rooms.ts';
import { useStore } from '../lib/store.tsx';

export default function Group() {
  const { t, lang } = useI18n();
  const { group, setGroup, requireAge, toast } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CharacterSummary[]>([]);
  const [known, setKnown] = useState<Map<string, CharacterSummary>>(new Map());
  const [scenario, setScenario] = useState<ScenarioId>('hangout');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    const ids = [...new Set([...group, ...ROOMS.flatMap((r) => r.ids)])];
    api.characters(ids).then((r) => setKnown((m) => new Map([...m, ...r.items.map((c) => [c.id, c] as const)]))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .search({ q, limit: 24, sort: q ? undefined : 'trending' })
        .then((r) => {
          setResults(r.items);
          setKnown((m) => new Map([...m, ...r.items.map((c) => [c.id, c] as const)]));
        })
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const selected = useMemo(() => group.map((id) => known.get(id)).filter((c): c is CharacterSummary => Boolean(c)), [group, known]);

  const toggle = (c: CharacterSummary) => {
    if (group.includes(c.id)) setGroup(group.filter((g) => g !== c.id));
    else if (group.length >= 5) toast(t('group.selected', { n: 5 }), true);
    else setGroup([...group, c.id]);
  };

  const start = () =>
    requireAge(() => {
      const p = new URLSearchParams({ ids: group.join(','), scenario });
      if (topic.trim()) p.set('topic', topic.trim());
      navigate(`/call/group?${p}`);
    });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('group.title')}</h1>
          <p className="page-sub">{t('group.sub')}</p>
        </div>
      </div>

      <div className="panel" style={{ position: 'sticky', top: 'calc(var(--nav-h) + 10px)', zIndex: 5, marginBottom: 24 }}>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="row wrap" style={{ minHeight: 56 }}>
            {selected.length === 0 && <span className="muted">{t('group.need_two')}</span>}
            {selected.map((c) => (
              <button key={c.id} className="chip active" onClick={() => toggle(c)} style={{ height: 44, paddingInlineStart: 4 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', display: 'block' }}>
                  <Portrait character={c} width={90} height={90} framing="orb" eager />
                </span>
                {displayName(c, lang)}
                <X size={14} />
              </button>
            ))}
          </div>
          <span className="tag">
            <Users size={14} /> {t('group.selected', { n: group.length })}
          </span>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>{t('call.lobby_scenario')}</label>
            <select className="select" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {lang === 'ar' ? s.labelAr : s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>{t('group.topic')}</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('group.topic_placeholder')} maxLength={200} />
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={() => setGroup([])} disabled={!group.length}>
            {t('common.delete')}
          </button>
          <button className="btn call" onClick={start} disabled={group.length < 2}>
            <Users size={16} /> {t('group.start')}
          </button>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          {t('group.presets')}
        </h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {ROOMS.map((room) => (
            <button
              key={room.id}
              className="room-card"
              style={{ textAlign: 'start' }}
              onClick={() => {
                setGroup(room.ids);
                setScenario(room.scenario);
                setTopic(room.topic ?? '');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <div className="room-faces">
                {room.ids.map((id) => {
                  const c = known.get(id);
                  return c ? <Portrait key={id} character={c} width={104} height={104} framing="tile" /> : null;
                })}
              </div>
              <b>{room.title[lang as UiLang] ?? room.title.en}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="nav-search" style={{ maxWidth: 'none', display: 'block', marginBottom: 14 }}>
          <Search size={17} className="icon" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('group.search')} aria-label={t('group.search')} style={{ display: 'block' }} />
        </div>
        <div className="grid">
          {results.map((c) => (
            <CharacterCard key={c.id} c={c} onPick={toggle} picked={group.includes(c.id)} />
          ))}
        </div>
      </section>
    </main>
  );
}
