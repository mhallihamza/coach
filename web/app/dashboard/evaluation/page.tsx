'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSettings, submitEvaluation, downloadGapPdf, getEvaluationFollowups, getEvaluationPrefill, type EvaluationResult, type EvaluationItem, type EvaluationAnswer, type FollowupQuestion } from '@/lib/api';
import { QUESTIONS, type Lang, type Question } from '@/lib/evaluation';

type Phase = 'intro' | 'quiz' | 'submitting' | 'done';

const COPY: Record<Lang, { startCta: string; back: string; finish: string; submitting: string; progressWord: string }> = {
  fr: { startCta: 'Commencer l’évaluation', back: 'Retour', finish: 'Voir mon résultat', submitting: 'Analyse de vos réponses…', progressWord: 'Progression' },
  ar: { startCta: 'ابدأ التقييم', back: 'رجوع', finish: 'عرض نتيجتي', submitting: 'تحليل إجاباتك…', progressWord: 'التقدم' },
  en: { startCta: 'Start the evaluation', back: 'Back', finish: 'See my result', submitting: 'Analyzing your answers…', progressWord: 'Progress' },
};

const INTRO_IMG = 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80';

function itemText(i: EvaluationItem): string {
  return (i.text as string) ?? (i.skill as string) ?? JSON.stringify(i);
}
function itemEvidence(i: EvaluationItem): string | null {
  return (i.evidence as string) ?? null;
}

export default function EvaluationPage() {
  const [lang, setLang] = useState<Lang>('fr');
  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [slide, setSlide] = useState<'in' | 'out'>('in');
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ringP, setRingP] = useState(0);
  const [followups, setFollowups] = useState<Question[] | null>(null);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [hints, setHints] = useState<Record<string, string>>({});
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getSettings().then((d) => {
      const l = (d.language as Lang) ?? 'fr';
      if (l === 'fr' || l === 'ar' || l === 'en') setLang(l);
    }).catch(() => {});
    getEvaluationPrefill().then((d) => setHints(d.hints ?? {})).catch(() => {});
  }, []);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const allQuestions = useMemo<Question[]>(() => followups ? [...QUESTIONS, ...followups] : QUESTIONS, [followups]);
  const q = allQuestions[index];
  const total = allQuestions.length;
  const isLast = index === total - 1;
  const t = COPY[lang];
  const isPersonalized = !!q?.id?.startsWith('f_');

  useEffect(() => { setDraft(answers[q?.id] ?? ''); }, [index, q?.id, answers]);

  // Ring count-up when the result lands
  useEffect(() => {
    if (phase !== 'done' || !result) return;
    const target = result.matchScore;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1100);
      const eased = 1 - Math.pow(1 - k, 3);
      setRingP(Math.round(target * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result]);

  const commitAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const advance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setSlide('out');
    advanceTimer.current = setTimeout(() => {
      setSlide('in');
      setIndex((i) => Math.min(total - 1, i + 1));
    }, 240);
  }, [total]);

  const pick = useCallback((id: string, value: string) => {
    commitAnswer(id, value);
    if (!isLast) advance();
  }, [commitAnswer, advance, isLast]);

  // Analyse live: generate personalized follow-ups from CV × objective × answers (hybrid model)
  const mapFollowup = (f: FollowupQuestion): Question => ({
    id: f.id,
    domain: { fr: f.domain, ar: f.domain, en: f.domain },
    kind: f.kind,
    text: { fr: f.text, ar: f.text, en: f.text },
    hint: { fr: "Personnalisée — d'après votre CV et votre objectif.", ar: 'سؤال مخصص — من سيرتك الذاتية وهدفك.', en: 'Personalized — from your CV and objective.' },
    ...(f.options ? { options: f.options.map((o) => ({ fr: o, ar: o, en: o })) } : {}),
  });

  const submitEvaluationPayload = async (finalAnswers: Record<string, string>) => {
    setPhase('submitting');
    setError(null);
    try {
      const payload = allQuestions.map((question) => ({ id: question.id, value: String(finalAnswers[question.id] ?? '').trim() }));
      const res = await submitEvaluation(payload, lang);
      setResult(res);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
      setPhase('quiz');
    }
  };

  const finishFlow = async () => {
    if (followups !== null) { await submitEvaluationPayload(answers); return; }
    setLoadingFollowups(true);
    try {
      const core = QUESTIONS.map((question) => ({ id: question.id, value: String(answers[question.id] ?? '').trim() }));
      const res = await getEvaluationFollowups(core, lang);
      const mapped = (res.followups ?? []).map(mapFollowup);
      if (mapped.length > 0) {
        setFollowups(mapped);
        setSlide('in');
        setIndex(QUESTIONS.length);
        setLoadingFollowups(false);
        return;
      }
      setFollowups([]);
    } catch {
      setFollowups([]);
    } finally {
      setLoadingFollowups(false);
    }
    await submitEvaluationPayload(answers);
  };

  const finishFromOpen = () => {
    const v = draft.trim();
    if (v.length < 2) return;
    commitAnswer(q.id, v);
    if (isLast) { void submitEvaluationPayload({ ...answers, [q.id]: v }); } else advance();
  };

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const progress = phase === 'done' ? 100 : Math.round(((index + (answers[q?.id] ? 1 : 0)) / total) * 100);

  /* ───────────────────────── INTRO ───────────────────────── */
  if (phase === 'intro') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-aside">
          <div className="quiz-aside-img" style={{ backgroundImage: `url(${INTRO_IMG})` }} />
          <span className="mini-label">Évaluation Evolve</span>
          <h2>18 questions.<br />4 minutes.<br /><em style={{ color: 'var(--champagne)' }}>Un miroir, pas un verdict.</em></h2>
          <ul>
            <li><b>→</b> Des questions de fond, jamais des cases à cocher vides</li>
            <li><b>→</b> Vos réponses sont la preuve — chaque affirmation du rapport cite les vôtres</li>
            <li><b>→</b> Forces, gaps, limites (internes & externes), score 0–100</li>
          </ul>
        </section>
        <section className="quiz-card" style={{ justifyContent: 'center' }}>
          <span className="quiz-domain" style={{ alignSelf: 'flex-start' }}>Le parcours</span>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', lineHeight: 1.15, color: 'var(--forest-deep)', margin: '.6rem 0 1rem', letterSpacing: '-.02em' }}>
            Où vous en êtes,<br />exactement — <span className="italic-accent">avant d’aller plus loin.</span>
          </h1>
          <p style={{ color: 'var(--ink-soft)', lineHeight: 1.7, maxWidth: '52ch' }}>
            Evolve ne croit pas aux évaluations de 200 questions ni aux diagnostics d’humeur.
            Vous répondez à 18 questions — ouvertes, à choix, sur échelle — et nous construisons avec vous
            une lecture honnête de votre socle, de vos forces et de ce qui vous freine vraiment.
          </p>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '1.1rem 0 1.4rem' }}>
            {['Clarté du cap', 'Socle & transfert', 'Forces', 'Limites internes', 'Limites externes', 'Engagement réel'].map((s) => (
              <span key={s} className="chip" style={{ background: 'rgba(23,92,61,.07)', color: 'var(--pine)', border: '1px solid rgba(23,92,61,.2)' }}>{s}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={() => setPhase('quiz')}>{t.startCta} <span aria-hidden>→</span></button>
            <Link href="/dashboard/rapport" className="btn btn-ghost">Voir mon dernier rapport</Link>
          </div>
          <p className="quiz-note" style={{ marginTop: '1.1rem' }}>Aucune donnée n’est inventée : le rapport ne contient que ce que vous avez dit, et ce que votre CV documente.</p>
        </section>
      </div>
    );
  }

  /* ───────────────────────── SUBMITTING ───────────────────────── */
  if (phase === 'submitting') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="shimmer" style={{ width: 120, height: 120, borderRadius: '50%', marginBottom: '1.4rem' }} />
          <h2 className="font-display" style={{ fontSize: '1.5rem', color: 'var(--forest-deep)' }}>{t.submitting}</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: '.5rem' }}>Chaque force et chaque limite est citée avec vos propres mots.</p>
        </section>
      </div>
    );
  }

  /* ───────────────────────── DONE ───────────────────────── */
  if (phase === 'done' && result) {
    const strengths = result.strengths ?? [];
    const gaps = result.gaps ?? [];
    const limits = result.limits ?? [];
    const verdict = result.matchScore >= 70 ? 'Solide et documenté' : result.matchScore >= 40 ? 'En progression — des gaps restent à combler' : 'Le travail commence — c’est normal';
    return (
      <div className="quiz-stage">
        <section className="quiz-card" style={{ overflow: 'visible' }}>
          <div className="result-hero">
            <div className="ring-big" style={{ '--p': ringP } as React.CSSProperties}>
              <b>{ringP}</b>
              <small>/ 100</small>
            </div>
            <div>
              <span className="verdict-pill">Readiness Score</span>
              <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: 'var(--forest-deep)', margin: '.5rem 0 .4rem', lineHeight: 1.2 }}>{verdict}</h1>
              <p style={{ color: 'var(--ink-soft)', lineHeight: 1.65, maxWidth: '58ch' }}>{result.recommended_focus}</p>
              <div style={{ display: 'flex', gap: '.6rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
                <Link href="/dashboard/rapport" className="btn btn-primary">Voir le rapport complet →</Link>
                <button className="btn btn-ghost" onClick={() => downloadGapPdf().catch(() => {})}>↓ Télécharger PDF</button>
                <Link href="/dashboard/chat" className="btn btn-ghost">Continuer avec le coach</Link>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1.4rem' }}>
            <div>
              <span className="mini-label" style={{ color: 'var(--ok)' }}>Forces documentées</span>
              <div style={{ display: 'grid', gap: '.55rem', marginTop: '.45rem' }}>
                {strengths.length ? strengths.map((s, i) => (
                  <div className="strength-card" key={i}>{itemText(s)}{itemEvidence(s) && <div className="evidence">Preuve : « {itemEvidence(s)} »</div>}</div>
                )) : <p className="quiz-note">À documenter avec vos prochaines sessions.</p>}
              </div>
            </div>
            <div>
              <span className="mini-label" style={{ color: 'var(--gold-deep)' }}>Gaps — écarts vs. votre cible</span>
              <div style={{ display: 'grid', gap: '.55rem', marginTop: '.45rem' }}>
                {gaps.map((g, i) => (
                  <div className="gap-card" key={i}>{itemText(g)}{itemEvidence(g) && <div className="evidence">Preuve : « {itemEvidence(g)} »</div>}</div>
                ))}
              </div>
            </div>
            <div>
              <span className="mini-label" style={{ color: 'var(--clay)' }}>Limites identifiées</span>
              <div style={{ display: 'grid', gap: '.55rem', marginTop: '.45rem' }}>
                {limits.length ? limits.map((l, i) => (
                  <div className="limit-card" key={i}>{itemText(l)}{itemEvidence(l) && <div className="evidence">Preuve : « {itemEvidence(l)} »</div>}</div>
                )) : <p className="quiz-note">Aucune limite documentée — c’est une donnée, pas un verdict.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ───────────────────────── QUIZ ───────────────────────── */
  const questionKey = q.id;
  const scaleVal = answers[q.id] ?? '';
  const openVal = q.kind === 'open' ? draft : '';

  return (
    <div className="quiz-stage">
      <section className={`quiz-card ${slide === 'out' ? 'q-anim-out' : 'q-anim-in'}`} key={questionKey}>
        <div className="quiz-topbar">
          <span className="quiz-count">{index + 1}<span style={{ color: 'var(--ink-soft)' }}>/{total}</span></span>
          <span className="quiz-domain">{q.domain[lang]}</span>
          {isPersonalized && <span className="quiz-domain" style={{ background: 'rgba(198,160,78,.16)', color: 'var(--gold-deep)', border: '1px solid rgba(198,160,78,.4)' }}>Personnalisé · CV</span>}
          <div className="quiz-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
          <Link href="/dashboard" className="quiz-note" style={{ textDecoration: 'none', color: 'var(--ink-soft)' }}>✕</Link>
        </div>
        {hints[q.id] && (
          <div style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.8rem', color: 'var(--pine)', background: 'rgba(23,92,61,.07)', border: '1px solid rgba(23,92,61,.18)', borderRadius: 12, padding: '.35rem .65rem', marginTop: '.2rem', lineHeight: 1.4 }}>
            <span aria-hidden="true">📄</span><span>{hints[q.id]}</span>
          </div>
        )}
        <h2 className="quiz-question">{q.text[lang]}</h2>
        {q.hint && <p className="quiz-hint">{q.hint[lang]}</p>}

        {q.kind === 'mcq' && (
          <div className="options-grid">
            {(q.options ?? []).map((opt, i) => {
              const fr = opt.fr;
              const selected = answers[q.id] === fr;
              return (
                <button key={i} className={`option${selected ? ' selected' : ''}`} onClick={() => pick(q.id, fr)} aria-pressed={selected}>
                  <span className="opt-key">{'ABCD'[i]}</span>
                  <span>{opt[lang].replace(/^[A-D]\s*[—-]\s*/, '')}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.kind === 'scale' && (
          <div className="scale-row" role="radiogroup" aria-label={q.text[lang]}>
            {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
              <button key={n} role="radio" aria-checked={scaleVal === String(n)} className={`scale-btn${scaleVal === String(n) ? ' selected' : ''}`} onClick={() => pick(q.id, String(n))}>{n}</button>
            ))}
          </div>
        )}

        {q.kind === 'open' && (
          <>
            <textarea className="open-area" autoFocus value={openVal} onChange={(e) => setDraft(e.target.value)} placeholder={lang === 'fr' ? 'Votre réponse…' : lang === 'ar' ? 'إجابتك…' : 'Your answer…'} maxLength={1500} />
            <div className="quiz-foot">
              <span className="quiz-note">{isLast ? 'Dernière question' : `${total - index - 1} restantes`}</span>
              <button className="btn btn-primary" onClick={finishFromOpen} disabled={openVal.trim().length < 2}>{isLast ? t.finish : 'Continuer →'}</button>
            </div>
          </>
        )}

        {error && <div className="form-error" style={{ marginTop: '.6rem' }}>{error}</div>}
        {q.kind !== 'open' && (
          <div className="quiz-foot">
            <span className="quiz-note">{answeredCount}/{total} répondues{isLast ? ' · dernière' : ''}</span>
            {isLast && answers[q.id] && (
              <button className="btn btn-primary" onClick={finishFlow} disabled={loadingFollowups}>
                {loadingFollowups ? 'Analyse de votre CV…' : t.finish}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
