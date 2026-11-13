'use client';
import { useEffect, useRef, useState } from 'react';
import { sendChat, sendAudioMessage, getHistory, getSettings, updateSettings } from '@/lib/api';

const SUGGESTIONS = [
  'Je veux devenir Data Scientist, par où je commence ?',
  'J’ai du mal à communiquer en réunion',
  'Pourquoi je n’arrive jamais à finir mes projets ?',
  'Je procrastine tout, même ce qui compte',
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
      const load = () => { /* warm-up voice list */ };
      speechSynthesis.addEventListener('voiceschanged', load);
      speechSynthesis.getVoices();
      return () => speechSynthesis.removeEventListener('voiceschanged', load);
    }
  }, []);

  async function send(text: string, fromAudio = false) {
    const clean = text.trim();
    if (!clean || busy) return;
    const userMsg: Msg = { role: 'user', content: clean, id: `m-${Date.now()}` };
    setMessages((m) => [...m, userMsg]);
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
    updateSettings({}, next).catch(() => { /* persisting optional */ });
  }

  return (
    <div className="chat-shell">
      <section className="panel chat-window">
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Conversation coach</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '.15rem .4rem', fontSize: '.75rem', fontWeight: 700 }}>
              {(['fr', 'ar', 'en'] as Lang[]).map((l) => (
                <button key={l} onClick={() => changeLang(l)} aria-pressed={language === l} style={{ background: language === l ? 'var(--pine)' : 'transparent', color: language === l ? '#fdfcf7' : 'inherit', border: 0, cursor: 'pointer', padding: '.15rem .5rem', borderRadius: 999, fontSize: '.75rem', fontWeight: 700 }}>{LANG_LABEL[l]}</button>
              ))}
            </div>
            {source && <span className={`chip ${source === 'supervisor' || source === 'langflow' ? 'chip-ok' : 'chip-warn'}`}>Evolve (agents)</span>}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginLeft: 'auto', fontSize: '.82rem', color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} style={{ accentColor: 'var(--pine)' }} /> 🔊 Lire à voix haute
            </label>
          </div>
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={m.id ?? i} className={`msg ${m.role}`}>
              {m.content}
              <div className="msg-meta">{m.role === 'user' ? 'Vous' : 'Evolve'} {m.role === 'assistant' && <button title="Lire" onClick={() => { if (typeof speechSynthesis === 'undefined') return; const u = new SpeechSynthesisUtterance(m.content); u.lang = SPEECH_LANG[language]; const v = pickVoice(language); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); }} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: '.85rem' }}>🔊</button>}</div>
            </div>
          ))}
          {busy && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
          {transcribing && <div className="msg assistant"><span className="typing"><i /><i /><i /></span> transcription…</div>}
          <div ref={bottomRef} />
        </div>
        {audioErr && <div className="form-error" style={{ marginTop: '.4rem' }}>{audioErr}</div>}
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <button type="button" onClick={recording ? stopRecording : startRecording} disabled={busy || transcribing} title={recording ? 'Stop' : 'Parler'} aria-label={recording ? 'Stop recording' : 'Start recording'}
            style={{ background: recording ? '#c0392b' : 'var(--forest)', color: '#fff', border: 0, borderRadius: 12, width: 64, display: 'grid', placeItems: 'center', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '1.35rem' }}>
            {recording ? '■' : '🎙️'}
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={recording ? 'Écoute en cours…' : 'Écrivez à votre coach…'} autoFocus disabled={busy || recording || transcribing} maxLength={5000} />
          <button className="btn btn-primary" type="submit" disabled={busy || recording || !input.trim()}>Envoyer</button>
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
