import { Flag, Phone, Send, Video } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isScenario } from '../../shared/scenarios.ts';
import type { ScenarioId, TranscriptLine } from '../../shared/types.ts';
import { Portrait } from '../components/Portrait.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, streamChat, type CharacterProfile } from '../lib/api.ts';
import { displayName } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

interface Bubble extends TranscriptLine {
  key: number;
}

export default function Chat() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { t, lang: uiLang } = useI18n();
  const { settings, openDialog, requireAge, me, refresh } = useStore();
  const navigate = useNavigate();
  const [c, setC] = useState<CharacterProfile | null>(null);
  const [lines, setLines] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(params.get('conversation'));
  const [offline, setOffline] = useState(false);
  const scenarioParam = params.get('scenario') ?? '';
  const scenario: ScenarioId = isScenario(scenarioParam) ? scenarioParam : 'hangout';
  const lang = settings.callLang || uiLang;
  const logRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.character(id).then((r) => setC(r.character)).catch(() => navigate('/browse'));
    const conv = params.get('conversation');
    if (conv) {
      api
        .conversation(conv)
        .then((d) => setLines(d.lines.map((l) => ({ ...l, key: ++keyRef.current }))))
        .catch(() => setConversationId(null));
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const run = async (history: Bubble[], cue?: 'greet') => {
    if (!c) return;
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const key = ++keyRef.current;
    let text = '';
    let speaker = c.id;
    setLines([...history, { key, speaker, text: '' }]);
    try {
      await streamChat(
        {
          conversationId: conversationId ?? undefined,
          mode: 'text',
          scenario,
          characterIds: [c.id],
          lang,
          transcript: history.map((l) => ({ speaker: l.speaker, text: l.text })),
          cue,
        },
        (e) => {
          if (e.type === 'meta') {
            setConversationId(e.conversationId);
            setOffline(e.provider === 'offline');
          } else if (e.type === 'delta') {
            text += e.text;
            setLines([...history, { key, speaker, text }]);
          } else if (e.type === 'moderated') {
            text = e.text;
            speaker = e.reason === 'self-harm' ? 'safety' : c.id;
            setLines([...history, { key, speaker, text }]);
          } else if (e.type === 'limit') {
            openDialog({ kind: 'paywall', metric: e.metric });
          } else if (e.type === 'error') {
            text = t('call.error');
            speaker = 'safety';
          }
        },
        controller.signal,
      );
    } catch {
      if (!controller.signal.aborted) {
        text = t('common.error');
        speaker = 'safety';
      }
    }
    const final = text.trim() ? [...history, { key, speaker, text: text.trim() }] : history;
    setLines(final);
    setBusy(false);
    void refresh();
    return final;
  };

  // Greet on open (new conversations only).
  const greeted = useRef(false);
  useEffect(() => {
    if (!c || greeted.current || params.get('conversation')) return;
    greeted.current = true;
    requireAge(() => void run([], 'greet'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, me?.ageBand]);

  // Persist the transcript after each exchange.
  useEffect(() => {
    if (!conversationId || busy || !lines.length) return;
    void api.saveTranscript(
      conversationId,
      lines.filter((l) => l.text.trim()).map((l) => ({ speaker: l.speaker, text: l.text })),
    ).catch(() => undefined);
  }, [busy, conversationId, lines]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    requireAge(() => {
      const history = [...lines, { key: ++keyRef.current, speaker: 'user', text }];
      setLines(history);
      void run(history);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!c) return <main className="page"><div className="spinner" /></main>;
  const name = displayName(c, uiLang);

  return (
    <main className="chat">
      <div className="chat-head">
        <Link to={`/c/${c.id}`} style={{ borderRadius: '50%', overflow: 'hidden', width: 46, height: 46, flex: 'none' }}>
          <Portrait character={c} width={120} height={120} framing="orb" eager />
        </Link>
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{name}</div>
          <div className="row" style={{ gap: 6 }}>
            <span className="ai-badge">{t('common.ai_simulation')}</span>
            {offline && <span className="tag warn">Demo</span>}
          </div>
        </div>
        <button className="btn icon small" onClick={() => requireAge(() => navigate(`/call/voice/${c.id}?scenario=${scenario}`))} aria-label={t('common.voice_call')}>
          <Phone size={16} />
        </button>
        <button className="btn call small" onClick={() => requireAge(() => navigate(`/call/video/${c.id}?scenario=${scenario}`))}>
          <Video size={15} /> {t('chat.start_call')}
        </button>
        <button
          className="btn icon small ghost"
          onClick={() => openDialog({ kind: 'report', characterId: c.id, conversationId: conversationId ?? undefined, excerpt: lines.slice(-6).map((l) => `${l.speaker}: ${l.text}`).join('\n') })}
          aria-label={t('common.report')}
        >
          <Flag size={15} />
        </button>
      </div>
      <div className="chat-log" ref={logRef} aria-live="polite">
        <p className="faint" style={{ textAlign: 'center', fontSize: 12.5, margin: '0 auto 8px', maxWidth: 520 }}>
          {t('disclosure.not_real', { name: c.name })}
        </p>
        {lines.map((l) =>
          l.text ? (
            <div key={l.key} className={`bubble ${l.speaker === 'user' ? 'user' : l.speaker === 'safety' ? 'safety' : 'ai'}`}>
              {l.text}
            </div>
          ) : (
            <div key={l.key} className="bubble ai faint">
              {t('chat.typing', { name })}
            </div>
          ),
        )}
      </div>
      <form className="chat-compose" onSubmit={send}>
        <textarea
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('chat.placeholder', { name })}
          rows={1}
          maxLength={2000}
          aria-label={t('chat.placeholder', { name })}
        />
        <button className="btn primary icon" style={{ '--h': '48px' } as CSSProperties} disabled={busy || !draft.trim()} aria-label={t('call.send')}>
          <Send size={18} className="flip-rtl" />
        </button>
      </form>
    </main>
  );
}
