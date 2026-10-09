import { Download, MessageCircle, Phone, Trash2, Users, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CharacterSummary, ConversationDetail, ConversationSummary } from '../../shared/types.ts';
import { Portrait } from '../components/Portrait.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { displayName, download, mmss, relativeDate } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

function ModeIcon({ mode }: { mode: ConversationSummary['mode'] }) {
  if (mode === 'text') return <MessageCircle size={14} />;
  if (mode === 'voice') return <Phone size={14} />;
  if (mode === 'group') return <Users size={14} />;
  return <Video size={14} />;
}

function useCharacters(ids: string[]): Map<string, CharacterSummary> {
  const [map, setMap] = useState<Map<string, CharacterSummary>>(new Map());
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    api.characters(key.split(',')).then((r) => setMap(new Map(r.items.map((c) => [c.id, c])))).catch(() => undefined);
  }, [key]);
  return map;
}

export function History() {
  const { t, lang } = useI18n();
  const { toast } = useStore();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const chars = useCharacters(items?.flatMap((i) => i.characterIds) ?? []);

  useEffect(() => {
    api.conversations().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  const remove = async (id: string) => {
    await api.deleteConversation(id);
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
  };

  const removeAll = async () => {
    if (!confirm(t('history.confirm_delete_all'))) return;
    await api.deleteAllConversations();
    setItems([]);
    toast('✓');
  };

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('history.title')}</h1>
          <p className="page-sub">{t('history.sub')}</p>
        </div>
        {items && items.length > 0 && (
          <button className="btn ghost small" onClick={removeAll}>
            <Trash2 size={15} /> {t('history.delete_all')}
          </button>
        )}
      </div>
      {!items && <div className="spinner" />}
      {items?.length === 0 && (
        <div className="empty">
          <h3>{t('history.empty')}</h3>
          <p>{t('history.empty_sub')}</p>
          <Link to="/" className="btn primary">
            {t('nav.discover')}
          </Link>
        </div>
      )}
      <div className="list">
        {items?.map((c) => {
          const first = chars.get(c.characterIds[0]);
          return (
            <div key={c.id} className="list-item">
              {first ? <Portrait character={first} width={120} height={120} framing="orb" /> : <div style={{ width: 52, height: 52 }} />}
              <Link to={`/history/${c.id}`} className="grow" style={{ minWidth: 0 }}>
                <div className="title">{c.characterIds.map((id) => (chars.get(id) ? displayName(chars.get(id)!, lang) : id)).join(', ')}</div>
                <div className="sub">
                  <ModeIcon mode={c.mode} /> {relativeDate(c.updatedAt, lang)} · {t('history.messages', { n: c.messageCount })}
                  {c.durationSec > 0 && ` · ${mmss(c.durationSec)}`}
                </div>
                <div className="sub faint">{c.preview}</div>
              </Link>
              <button className="btn icon small ghost" onClick={() => void remove(c.id)} aria-label={t('common.delete')}>
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

export function Transcript() {
  const { id = '' } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const chars = useCharacters(conv?.characterIds ?? []);

  useEffect(() => {
    api.conversation(id).then(setConv).catch(() => navigate('/history'));
  }, [id, navigate]);

  const nameOf = useMemo(
    () => (speaker: string) => (speaker === 'user' ? t('call.you') : speaker === 'safety' ? 'Starcall' : chars.get(speaker) ? `${displayName(chars.get(speaker)!, lang)} (AI)` : speaker),
    [chars, lang, t],
  );

  if (!conv) return <main className="page narrow"><div className="spinner" /></main>;

  const asText = () =>
    [
      `${conv.title} — ${new Date(conv.createdAt).toLocaleString(lang)}`,
      'AI simulation transcript. Characters are AI simulations, not the real people.',
      '',
      ...conv.lines.map((l) => `${nameOf(l.speaker)}: ${l.text}${l.interrupted ? ' [interrupted]' : ''}`),
    ].join('\n');

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ fontSize: 28 }}>
            {conv.characterIds.map((cid) => (chars.get(cid) ? displayName(chars.get(cid)!, lang) : cid)).join(', ')}
          </h1>
          <p className="page-sub">
            <ModeIcon mode={conv.mode} /> {new Date(conv.createdAt).toLocaleString(lang)} {conv.durationSec > 0 && `· ${mmss(conv.durationSec)}`}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn small" onClick={() => download(`starcall-${conv.id.slice(0, 8)}.txt`, asText())}>
            <Download size={15} /> {t('history.download_txt')}
          </button>
          <button className="btn small" onClick={() => download(`starcall-${conv.id.slice(0, 8)}.json`, JSON.stringify(conv, null, 2), 'application/json')}>
            <Download size={15} /> {t('history.download_json')}
          </button>
          {conv.characterIds.length === 1 && (
            <Link className="btn primary small" to={`/chat/${conv.characterIds[0]}?conversation=${conv.id}`}>
              <MessageCircle size={15} /> {t('history.continue_chat')}
            </Link>
          )}
        </div>
      </div>
      <div className="banner info">
        <span className="ai-badge">{t('common.ai_simulation')}</span> {t('disclosure.footer')}
      </div>
      <div className="stack">
        {conv.lines.map((l, i) => (
          <div key={i} className={`bubble ${l.speaker === 'user' ? 'user' : l.speaker === 'safety' ? 'safety' : 'ai'}`} style={{ maxWidth: '86%' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: l.speaker === 'user' ? 'var(--gold)' : 'var(--holo)', marginBottom: 2 }}>{nameOf(l.speaker)}</div>
            {l.text}
            {l.interrupted && <span className="faint"> — {t('call.interrupted')}</span>}
          </div>
        ))}
      </div>
    </main>
  );
}
