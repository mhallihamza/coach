'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboard, type DashboardData } from '@/lib/api';

export default function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, []);

  const match = data?.matchScore ?? null;
  const goals = data?.goals ?? [];
  const habits = data?.habits ?? [];
  const latest = data?.latestAssessment ?? null;
  const goal = goals[0];
  const hasAnyData = goals.length > 0 || habits.length > 0 || latest != null || match != null;

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      <div className="kpi-grid">
        <div className="kpi"><small>Score de préparation</small><b>{match != null ? match : '—'}</b><em>{match != null ? 'depuis votre dernier rapport' : 'aucun rapport pour l’instant'}</em></div>
        <div className="kpi"><small>Objectifs actifs</small><b>{goals.length}</b><em>{goal ? goal.priority?.toUpperCase() + ' priorité' : 'aucun objectif pour l’instant'}</em></div>
        <div className="kpi"><small>Constance habitudes</small><b>{habits.length ? `${habits[0].consistency}%` : '—'}</b><em>{habits.length ? habits[0].name : 'pas encore de suivi'}</em></div>
        <div className="kpi"><small>Dernière évaluation</small><b>{latest ? `${latest.totalScore}/${latest.maxScore}` : '—'}</b><em>{latest?.skill ?? 'à faire en entretien'}</em></div>
      </div>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head"><h2>Votre progression</h2><Link href="/dashboard/evaluation" className="btn btn-ghost" style={{ padding: '.35rem .9rem', fontSize: '.78rem' }}>Continuer l’entretien →</Link></div>
          {hasAnyData ? (
            <p style={{ fontSize: '.9rem', lineHeight: 1.65 }}>Votre progression reflète vos données réelles : chaque score est calculé depuis vos preuves citées, jamais estimé par le modèle. Revenez après votre prochain re-mesure mensuel pour voir l’évolution consignée ici.</p>
          ) : (
            <div style={{ padding: '1.4rem 0 .6rem', textAlign: 'center' }}>
              <strong style={{ display: 'block', fontSize: '1.02rem', color: 'var(--forest-deep)', marginBottom: '.4rem' }}>Pas encore de données</strong>
              <span style={{ fontSize: '.88rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}>Votre progression apparaîtra ici après votre premier rapport — construit à partir de vos propres mots, jamais inventée.</span>
              <div style={{ marginTop: '.9rem' }}>
                <Link href="/dashboard/evaluation" className="btn btn-primary" style={{ padding: '.55rem 1.3rem', fontSize: '.88rem' }}>Démarrer l’entretien →</Link>
              </div>
            </div>
          )}
          <div style={{ marginTop: '1.1rem', display: 'grid', gap: '.5rem' }}>
            <span className="mini-label">Focus de la semaine</span>
            <p style={{ fontSize: '.92rem', lineHeight: 1.6 }}>{goal ? <>Mettre le cap sur <strong>{goal.title}</strong> — mesure : {goal.successMeasure ?? 'à définir'}.</> : <>Définir votre prochaine cible — <Link href="/dashboard/evaluation" style={{ color: 'var(--pine)', fontWeight: 600, textDecoration: 'none' }}>lancez l’entretien</Link>, 15 questions, 4 minutes.</>}</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Limites identifiées</h2><Link href="/dashboard/rapport" style={{ fontSize: '.8rem', color: 'var(--pine)', textDecoration: 'none', fontWeight: 600 }}>Voir le rapport complet →</Link></div>
          <div style={{ display: 'grid', gap: '.7rem' }}>
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: '1.1rem .9rem', textAlign: 'center' }}>
              <strong style={{ display: 'block', fontSize: '.95rem', color: 'var(--forest-deep)' }}>Aucune limite identifiée</strong>
              <span style={{ fontSize: '.84rem', color: 'var(--ink-soft)', lineHeight: 1.55, display: 'block', marginTop: '.3rem' }}>Elles apparaîtront ici après votre entretien — toujours citées avec vos propres réponses ou votre CV, jamais décrétées sans preuve.</span>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Objectifs actifs</h2><Link href="/dashboard/goals" style={{ fontSize: '.8rem', color: 'var(--pine)', textDecoration: 'none', fontWeight: 600 }}>Tous les objectifs →</Link></div>
        {goals.length ? goals.map((g) => (
          <div className="goal-row" key={g.id} style={{ fontSize: '.88rem' }}>
            <span style={{ flex: 1 }}>{g.title}</span>
            <span className="chip chip-ok">{g.priority ?? 'medium'}</span>
            <span style={{ color: 'var(--ink-soft)', fontSize: '.8rem' }}>{g.deadline ?? 'sans date'}</span>
          </div>
        )) : (
          <p style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>Aucun objectif encore — <Link href="/dashboard/evaluation" style={{ color: 'var(--pine)', fontWeight: 600 }}>démarrez l’entretien</Link> et laissez Evolve en proposer.</p>
        )}
      </section>
    </>
  );
}

