'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sendChat, sendAudioMessage, getHistory, getSettings, updateSettings } from '@/lib/api';

const SUGGESTIONS = [
  'Je veux devenir Data Scientist, par où je commence ?',
  'J’ai du mal à communiquer en réunion',
  'Pourquoi je n’arrive jamais à finir mes projets ?',
];

type Msg = { role: 'user' | 'assistant'; content: string; id?: string };
type Lang = 'fr' | 'ar' | 'en';
const LANG_LABEL: Record<Lang, string> = { fr: 'FR', ar: 'AR', en: 'EN' };
const SPEECH_LANG: Record<Lang, string> = { fr: 'fr-FR', ar: 'ar-SA', en: 'en-US' };

function pickVoice(lang: Lang) {
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  const match = voices.find(v => (v.lang || '').toLowerCase().startsWith(SPEECH_LANG[lang].toLowerCase().slice(0, 2)));
  return match ?? voices.find(v => (v.lang || '').toLowerCase().startsWith('fr')) ?? voices[0] ?? null;
}

// Détecte un vrai QCM dans le texte du coach : ≥ 3 lignes « A) ... B) ... C) ... » (ou (A) ...)
function parseOptions(text: string): { options: string[]; stem: string } | null {
  const lines = text.split('\n');
  const optRe = /^\s*(?:\(([A-C])\)|([A-C])[.)–—-])\s*(.{3,140})\s*$/;
  const hits = lines.map((l, i) => { const m = l.match(optRe); return m ? { letter: m[1] || m[2], text: m[3].trim(), line: i } : null; })
    .filter((x): x is { letter: string; text: string; line: number } => !!x);
  if (hits.length < 3) return null;
  const seen = new Set(hits.map(h => h.letter));
  if (seen.size < 3) return null;
  const stem = lines.slice(0, hits[0].line).join('\n').trim() || lines[0];
  return { options: hits.map(h => h.text), stem };
}

const SCALE_RE = /(échelle\s+de\s+1\s*à\s*10|1\s*à\s*10|1-10)/i;

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Bonjour — je suis votre coach. Qu’est-ce qui vous amène aujourd’hui : une ambition, un blocage, ou juste un besoin de faire le point ? Vous pouvez aussi me parler (bouton micro).', id: 'intro' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [source, setSource] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>('fr');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  useEffect(() => {
    getSettings().then(d => { const l = (d.language as Lang) ?? 'fr'; if (l === 'fr' || l === 'ar' || l === 'en') setLanguage(l); }).catch(() => {});
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.getVoices();
    }
  }, []);

  // Un probe est "répondu" dès qu'un message utilisateur arrive APRÈS lui.
  const answeredFlags = useMemo(() => {
    const a = new Array(messages.length).fill(false);
    let seenUserAfter = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') seenUserAfter = true;
      else if (messages[i].role === 'assistant' && seenUserAfter) a[i] = true;
    }
    return a;
  }, [messages]);

  async function send(text: string, fromAudio = false) {
    const clean = text.trim();
    if (!clean || busy) return;
    setMessages((m) => [...m, { role: 'user', content: clean, id: `m-${Date.now()}` }]);
    setInput('');
    setBusy(true);
    try {
      const res = await sendChat(clean, conversationId);
      setConversationId(res.conversationId);
      setSource(res.source);
      const reply = res.reply || '';
      setMessages((m) => [...m, { role: 'assistant', content: reply || '(…)', id: `a-${Date.now()}` }]);
      if (speakOn && reply && typeof speechSynthesis !== 'undefined') {
        const uttr = new SpeechSynthesisUtterance(reply);
        uttr.lang = SPEECH_LANG[language];
        const v = pickVoice(language); if (v) uttr.voice = v;
        speechSynthesis.cancel(); speechSynthesis.speak(uttr);
      }
      if (!conversationId && res.conversationId) getHistory(res.conversationId).catch(() => {});
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Connexion perdue avec le coach. (${e instanceof Error ? e.message : 'erreur réseau'})` }]);
    } finally { setBusy(false); }
  }

  async function startRecording() {
    setAudioErr(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAudioErr('Le navigateur bloque le microphone.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
        await sendAudio(file);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setAudioErr(e instanceof Error ? e.message : 'Micro indisponible.');
    }
  }

  function stopRecording() {
    if (mediaRef.current && recording) {
      mediaRef.current.stop();
      setRecording(false);
      setTranscribing(true);
    }
  }

  async function sendAudio(file: File) {
    try {
      const res = await sendAudioMessage(file, conversationId, language);
      setConversationId(res.conversationId);
      setSource(res.source);
      const reply = res.reply || '';
      setMessages((m) => [...m, { role: 'user', content: `🎙️ ${res.transcript || '(audio)'}`, id: `u-${Date.now()}` }]);
      setMessages((m) => [...m, { role: 'assistant', content: reply || '(…)', id: `a-${Date.now()}` }]);
      if (speakOn && reply && typeof speechSynthesis !== 'undefined') {
        const u = new SpeechSynthesisUtterance(reply);
        u.lang = SPEECH_LANG[language];
        const v = pickVoice(language); if (v) u.voice = v;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      }
    } catch (e) {
      setAudioErr(e instanceof Error ? e.message : 'Échec de la transcription');
    } finally { setTranscribing(false); }
  }

  function changeLang(next: Lang) {
    setLanguage(next);
    updateSettings({}, next).catch(() => {});
  }

  const probes = useMemo(() => messages.map((m, i) => m.role === 'assistant' ? { m, i, answered: answeredFlags[i], options: parseOptions(m.content), scale: SCALE_RE.test(m.content) } : null), [messages, answeredFlags]);

  return (
    <div className="chat-shell">
      <section className="panel chat-window">
        <div className="panel-head" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'Fraunces', fontSize: '1.15rem', color: 'var(--forest-deep)' }}>Votre coach</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '.18rem .45rem', fontSize: '.72rem', fontWeight: 700 }}>
              {(['fr', 'ar', 'en'] as Lang[]).map((l) => (
                <button key={l} onClick={() => changeLang(l)} aria-pressed={language === l} style={{ background: language === l ? 'var(--pine)' : 'transparent', color: language === l ? '#fdfcf7' : 'inherit', border: 0, cursor: 'pointer', padding: '.18rem .5rem', borderRadius: 999, fontSize: '.72rem', fontWeight: 700 }}>{LANG_LABEL[l]}</button>
              ))}
            </div>
            {source && <span className="chip chip-ok">Evolve (agents)</span>}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginLeft: 'auto', fontSize: '.8rem', color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} style={{ accentColor: 'var(--pine)' }} /> 🔊 Lire
            </label>
            <Link href="/dashboard/evaluation" className="btn btn-ghost" style={{ padding: '.3rem .75rem', fontSize: '.76rem', whiteSpace: 'nowrap' }}>Évaluation →</Link>
          </div>
        </div>

        <div className="chat-messages" aria-live="polite">
          {probes.map((p) => {
            if (!p) return null;
            const { m, i, answered, options, scale } = p;
            return (
              <div key={m.id ?? i} className={`probe-card${answered ? ' probe-answered' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <div className="probe-head">
                  <span className="probe-num">Q{i + 1}</span>
                  <span className="probe-kind">{options ? 'À choix' : scale ? 'Échelle' : 'Coach'}</span>
                </div>
                <div className="probe-body">{options ? options.stem : m.content}</div>
                {options && (
                  <div className="options-grid" style={{ marginTop: '.6rem' }}>
                    {options.options.map((o, j) => (
                      <button
                        key={j}
                        className={`option${answered && answersMatch(messages, i, o) ? ' selected' : ''}`}
                        disabled={answered}
                        style={answered ? { pointerEvents: 'none' } : undefined}
                        onClick={() => send(o)}
                      >
                        <span className="opt-key">{'ABCDEF'[j]}</span>
                        <span>{o}</span>
                      </button>
                    ))}
                  </div>
                )}
                {scale && !options && (
                  <div className="scale-row" style={{ marginTop: '.6rem' }} role="radiogroup" aria-label="Échelle 1 à 10">
                    {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                      <button key={n} role="radio" className="scale-btn" disabled={answered} style={answered ? { pointerEvents: 'none', opacity: .6 } : undefined} onClick={() => send(String(n))}>{n}</button>
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && (
                  <div className="msg-meta"><button title="Lire" onClick={() => { if (typeof speechSynthesis === 'undefined') return; const u = new SpeechSynthesisUtterance(m.content); u.lang = SPEECH_LANG[language]; const v = pickVoice(language); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); }} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: '.8rem', color: 'var(--ink-soft)' }}>🔊</button></div>
                )}
              </div>
            );
          })}

          {/* Messages utilisateur */}
          {messages.map((m, i) => m.role === 'user' ? (
            <div key={m.id ?? `u-${i}`} className="msg user" style={{ maxWidth: '82%', alignSelf: 'flex-end' }}>
              {m.content}
              <div className="msg-meta">Vous</div>
            </div>
          ) : null)}

          {busy && <div className="msg assistant" style={{ alignSelf: 'flex-start' }}><span className="typing"><i /><i /><i /></span></div>}
          {transcribing && <div className="msg assistant" style={{ alignSelf: 'flex-start' }}><span className="typing"><i /><i /><i /></span> transcription…</div>}
          <div ref={bottomRef} />
        </div>

        {audioErr && <div className="form-error" style={{ marginTop: '.4rem' }}>{audioErr}</div>}

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <button type="button" onClick={recording ? stopRecording : startRecording} disabled={busy || transcribing} title={recording ? 'Stop' : 'Parler'} aria-label={recording ? 'Stop recording' : 'Start recording'}
            style={{ background: recording ? '#c0392b' : 'var(--forest)', color: '#fff', border: 0, borderRadius: 12, width: 56, display: 'grid', placeItems: 'center', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '1.3rem' }}>
            {recording ? '■' : '🎙️'}
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={recording ? 'Écoute en cours…' : 'Répondez, ou dites « assez » pour voir votre synthèse…'} autoFocus disabled={busy || recording || transcribing} maxLength={5000} />
          <button className="btn btn-primary" type="submit" disabled={busy || recording || !input.trim()}>Envoyer</button>
        </form>

        <div className="suggestion-row">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      </section>

      <aside className="panel" style={{ alignSelf: 'start' }}>
        <h2 style={{ fontSize: '.95rem', color: 'var(--forest-deep)', marginBottom: '.6rem' }}>Comment fonctionne le coach</h2>
        <ol style={{ fontSize: '.82rem', color: 'var(--ink-soft)', lineHeight: 1.75, marginLeft: '1.1rem' }}>
          <li><strong>Sonde d’abord</strong> — pourquoi, concept, scénario : {'jusqu’à 6 questions'}</li>
          <li><strong>Explore ensuite</strong> — parcours, forces, limites, contraintes</li>
          <li><strong>Puis livre</strong> — à « assez » ou après couverture complète, vous recevez votre bilan</li>
        </ol>
        <div className="chip chip-warn" style={{ marginTop: '.8rem' }}>Le coach refuse les diagnostics — il oriente vers un professionnel si nécessaire.</div>
        <div style={{ marginTop: '.8rem', fontSize: '.78rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          Vous voulez un bilan chiffré&nbsp;? <Link href="/dashboard/evaluation" style={{ color: 'var(--pine)', fontWeight: 600, textDecoration: 'none' }}>Passez l’évaluation (18 questions) →</Link>
        </div>
      </aside>
    </div>
  );
}

function answersMatch(messages: Msg[], probeIndex: number, option: string): boolean {
  for (let j = probeIndex + 1; j < messages.length; j++) {
    if (messages[j].role === 'assistant') return false;
    if (messages[j].role === 'user') return messages[j].content.trim() === option.trim();
  }
  return false;
}
