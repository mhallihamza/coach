'use client';
import { useEffect, useRef, useState } from 'react';
import { sendChat, getHistory } from '@/lib/api';

const SUGGESTIONS = [
  'Je veux devenir Data Scientist, par où je commence ?',
  'J’ai du mal à communiquer en réunion avec ma direction',
  'Pourquoi je n’arrive jamais à finir mes projets ?',
  'Je procrastine tout, même ce qui compte',
];

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Bonjour — je suis votre coach. Qu’est-ce qui vous amène aujourd’hui : une ambition, un blocage, ou juste un besoin de faire le point ?' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [source, setSource] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setMessages((m) => [...m, { role: 'user', content: clean }]);
    setInput('');
    setBusy(true);
    try {
      const res = await sendChat(clean, conversationId);
      setConversationId(res.conversationId);
      setSource(res.source);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      if (!conversationId && res.conversationId) {
        getHistory(res.conversationId).catch(() => {});
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Connexion perdue avec le coach. (${e instanceof Error ? e.message : 'erreur réseau'})` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-shell">
      <section className="panel chat-window">
        <div className="panel-head">
          <h2>Conversation coach</h2>
          {source && <span className={`chip ${source === 'langflow' || source === 'supervisor' ? 'chip-ok' : 'chip-warn'}`}>{source === 'langflow' || source === 'supervisor' ? 'Propulsé par Evolve (agents)' : `Mode ${source}`}</span>}
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
              <div className="msg-meta">{m.role === 'user' ? 'Vous' : 'Evolve'}</div>
            </div>
          ))}
          {busy && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
          <div ref={bottomRef} />
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Écrivez à votre coach…" autoFocus disabled={busy} maxLength={5000} />
          <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>Envoyer</button>
        </form>
      </section>

      <aside className="panel" style={{ alignSelf: 'start' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--forest-deep)', marginBottom: '.75rem' }}>Pour démarrer</h2>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1.1rem 0' }} />
        <span className="mini-label">Comment ça marche</span>
        <ol style={{ margin: '.6rem 0 0 1.1rem', fontSize: '.83rem', color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          <li>Le coach lit votre objectif, pas votre CV (il est optionnel).</li>
          <li>Une ou deux questions à la fois — jamais un interrogatoire.</li>
          <li>Chaque réponse affine la suivante ; preuves &gt; opinions.</li>
          <li>À la fin : rapport de compétences + limites + plan d’action.</li>
        </ol>
        <div className="chip chip-warn" style={{ marginTop: '1rem' }}>Le coach refuse les diagnostics — il oriente vers un professionnel si nécessaire.</div>
      </aside>
    </div>
  );
}
