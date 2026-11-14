'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPlanDraft, approvePlan, type PlanDraft, type PlanGoal, type ApprovedPlanGoal } from '@/lib/api';

type Phase = 'intro' | 'loading' | 'ready' | 'creating' | 'done';

export default function PlanPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; title: string; deadline: string }[]>([]);

  async function generate() {
    setPhase('loading'); setError(null);
    try {
      const d = await getPlanDraft();
      setDraft(d);
      setGoals(d.goals);
      setSelected(Object.fromEntries(d.goals.map((_, i) => [i, true])));
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setPhase('intro');
    }
  }

  async function approve() {
    const picked = goals.filter((_, i) => selected[i]);
    if (!picked.length) return;
    setPhase('creating'); setError(null);
    try {
      const payload: ApprovedPlanGoal[] = picked.map((g) => ({
        title: g.title.trim(),
        successMeasure: g.successMeasure,
        deadlineDays: g.deadlineDays,
        priority: g.priority,
        linkedGap: g.linkedGap ?? null,
        phase: g.phase ?? null,
        milestones: g.milestones,
      }));
      const res = await approvePlan(payload);
      setCreated(res.created);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
      setPhase('ready');
    }
  }

  const toggle = (i: number) => setSelected((s) => ({ ...s, [i]: !s[i] }));
  const rename = (i: number, title: string) =>
    setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, title } : g)));

  const chosen = goals.filter((_, i) => selected[i]).length;

  /* ───────── INTRO ───────── */
  if (phase === 'intro') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-aside" style={{ background: 'linear-gradient(165deg, #1d3a2c 0%, #0d3324 60%, #081f14 100%)' }}>
          <div className="quiz-aside-img" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1200&q=80)", filter: 'saturate(.8) brightness(.75)' }} />
          <span className="mini-label">Plan 30 / 60 / 90</span>
          <h2>Votre évaluation ne sert<br />à rien si elle dort<br />dans un PDF.</h2>
          <ul>
            <li><b>→</b> Construit depuis VOTRE rapport — pas un modèle générique</li>
            <li><b>→</b> 1 objectif SMART par écart prioritaire, jalons semaine par semaine</li>
            <li><b>→</b> Ressources vérifiées — aucun lien inventé</li>
            <li><b>→</b> Rien n’est créé sans votre approbation explicite</li>
          </ul>
        </section>
        <section className="quiz-card" style={{ justifyContent: 'center' }}>
          <span className="quiz-domain" style={{ alignSelf: 'flex-start' }}>Le plan</span>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.4rem)', lineHeight: 1.18, color: 'var(--forest-deep)', margin: '.6rem 0 1rem', letterSpacing: '-.02em' }}>
            De votre évaluation<br />à un plan que vous pouvez<br /><span className="italic-accent">vraiment tenir.</span>
          </h1>
          <p style={{ color: 'var(--ink-soft)', lineHeight: 1.7, maxWidth: '54ch' }}>
            Evolve relit votre dernier rapport, prend vos écarts prioritaires, et en tire des objectifs SMART
            avec des jalons hebdomadaires calqués sur vos vraies heures — pas sur un emploi du temps de rêvée.
            Vous relisez chaque ligne, vous validez, et seulement ENSUITE les objectifs sont créés.
          </p>
          <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', marginTop: '1.3rem' }}>
            <button className="btn btn-primary btn-lg" onClick={generate}>Générer mon plan 30/60/90 <span aria-hidden>→</span></button>
            <Link href="/dashboard/rapport" className="btn btn-ghost">Voir mon rapport d’abord</Link>
          </div>
          {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}
          <p className="quiz-note" style={{ marginTop: '1.1rem' }}>Basé sur votre dernier rapport (score, gaps et preuves) — rien n’est deviné, et rien n’est sauvegardé sans votre accord.</p>
        </section>
      </div>
    );
  }

  /* ───────── LOADING ───────── */
  if (phase === 'loading') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="shimmer" style={{ width: 120, height: 120, borderRadius: '50%', marginBottom: '1.4rem' }} />
          <h2 className="font-display" style={{ fontSize: '1.5rem', color: 'var(--forest-deep)' }}>Lecture de votre rapport…</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: '.4rem' }}>Un objectif par écart prioritaire, jalons semaine par semaine.</p>
        </section>
      </div>
    );
  }

  /* ───────── CREATING ───────── */
  if (phase === 'creating') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="spinner" aria-label="création" />
          <h2 className="font-display" style={{ fontSize: '1.4rem', color: 'var(--forest-deep)', marginTop: '1.2rem' }}>Création de vos objectifs…</h2>
        </section>
      </div>
    );
  }

  /* ───────── DONE ───────── */
  if (phase === 'done') {
    return (
      <div className="quiz-shell" style={{ minHeight: 'calc(100svh - 9rem)' }}>
        <section className="quiz-card" style={{ justifyContent: 'center' }}>
          <span className="verdict-pill">Plan créé</span>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: 'var(--forest-deep)', margin: '.6rem 0 .6rem', lineHeight: 1.2 }}>
            {created.length} objectif{created.length > 1 ? 's' : ''} actif{created.length > 1 ? 's' : ''} — jalons dedans.
          </h1>
          <ul style={{ margin: '0 0 1rem 1.1rem', lineHeight: 1.8 }}>
            {created.map((g) => <li key={g.id}><strong>{g.title}</strong> —  échéance {g.deadline}</li>)}
          </ul>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard/goals" className="btn btn-primary">Suivre dans Objectifs →</Link>
            <Link href="/dashboard/rapport" className="btn btn-ghost">Garder mon rapport</Link>
          </div>
        </section>
      </div>
    );
  }

  /* ───────── READY — relecture & approbation ───────── */
  return (
    <div>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <span className="verdict-pill">Brouillon — rien n’est créé</span>
        <h1 className="font-display" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', color: 'var(--forest-deep)', margin: '.5rem 0 .35rem' }}>{draft?.plan_title}</h1>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
          <span className="chip" style={{ background: 'rgba(23,92,61,.08)', color: 'var(--pine)', border: '1px solid rgba(23,92,61,.2)' }}>Horizon {draft?.horizonMonths} mois</span>
          <span className="chip" style={{ background: 'rgba(23,92,61,.08)', color: 'var(--pine)', border: '1px solid rgba(23,92,61,.2)' }}>{draft?.weeklyHours} h / semaine</span>
          {draft?.matchScore != null && <span className="chip chip-ok">Score {draft.matchScore}/100</span>}
        </div>
        {draft?.success_definition && (
          <p style={{ color: 'var(--ink-soft)', fontSize: '.88rem', marginTop: '.6rem', lineHeight: 1.6 }}>
            Votre définition du succès : <em>« {draft.success_definition} »</em>
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: '.8rem' }}>
        {goals.map((g, i) => (
          <section key={i} className="panel" style={{ borderLeft: selected[i] ? '3px solid var(--pine)' : '3px solid transparent', opacity: selected[i] ? 1 : 0.55, transition: 'opacity .2s' }}>
            <div style={{ display: 'flex', gap: '.8rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)} aria-label={`Inclure « ${g.title} »`} style={{ marginTop: '.3rem', accentColor: 'var(--pine)', width: 18, height: 18, cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
                  <input value={g.title} onChange={(e) => rename(i, e.target.value)} style={{ fontFamily: 'Fraunces', fontWeight: 600, fontSize: '1.02rem', color: 'var(--forest-deep)', border: 0, borderBottom: '1.5px dashed var(--line)', outline: 'none', background: 'transparent', flex: 1, minWidth: 240, padding: '.1rem 0' }} aria-label="Titre de l’objectif" />
                  <span className="chip" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>{g.phase} · J{g.deadlineDays}</span>
                </div>
                <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', margin: '.45rem 0 .6rem', lineHeight: 1.55 }}>{g.successMeasure}</p>
                {g.gap_evidence && <p style={{ fontSize: '.78rem', color: 'var(--pine)', margin: '.2rem 0 .55rem' }}>Preuve du gap — « {g.gap_evidence} »</p>}
                <span className="mini-label">Jalons</span>
                <ol style={{ margin: '.35rem 0 .55rem 1.15rem', fontSize: '.85rem', lineHeight: 1.65 }}>
                  {g.milestones.map((m, j) => <li key={j}>{m}</li>)}
                </ol>
                <span className="mini-label">Ressources vérifiées</span>
                <ul style={{ margin: '.35rem 0 0 1.15rem', fontSize: '.85rem', lineHeight: 1.6 }}>
                  {g.resources.map((r, j) => (
                    <li key={j}>
                      {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pine)', fontWeight: 600, textDecoration: 'none' }}>{r.title} ↗</a> : <span>{r.title}</span>}
                      {r.why && <span style={{ color: 'var(--ink-soft)', fontSize: '.78rem' }}> — {r.why}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="panel" style={{ marginTop: '.9rem', display: 'flex', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <strong style={{ color: 'var(--forest-deep)' }}>{chosen} objectif{chosen > 1 ? 's' : ''} sélectionné{chosen > 1 ? 's' : ''}</strong>
          <div className="quiz-note">Vous pouvez renommer chaque objectif. Rien n’est créé avant votre clic.</div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" onClick={approve} disabled={!chosen}>Créer mon plan ({chosen})</button>
      </div>
    </div>
  );
}
