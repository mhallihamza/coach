'use client';
import { useEffect, useState } from 'react';
import { listGoals } from '@/lib/api';

type Goal = { id: string; title: string; status: string; deadline?: string | null; priority?: string; milestonesDone: number; milestonesTotal: number; successMeasure?: string };

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGoals().then((d) => setGoals(d.goals)).catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, []);

  return (
    <section className="panel">
      <div className="panel-head"><h2>Objectifs</h2><span className="chip chip-ok">approuvés par vous uniquement</span></div>
      {error && <div className="form-error">{error}</div>}
      {goals === null && !error && <p style={{ color: 'var(--ink-soft)' }}>Chargement…</p>}
      {goals?.length === 0 && (
        <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>Aucun objectif encore. Les objectifs apparaissent ici après l’entretien coach et votre approbation — jamais sans votre accord. <a href="/dashboard/chat" style={{ color: 'var(--pine)', fontWeight: 650 }}>Démarrer l’entretien →</a></p>
      )}
      <div style={{ display: 'grid', gap: '.8rem' }}>
        {goals?.map((g) => {
          const pct = g.milestonesTotal ? Math.round(g.milestonesDone / g.milestonesTotal * 100) : 0;
          return (
            <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 16, padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '.98rem' }}>{g.title}</strong>
                <span className="chip chip-ok">{g.status}</span>
              </div>
              <p style={{ fontSize: '.83rem', color: 'var(--ink-soft)', margin: '.4rem 0 .7rem' }}>{g.successMeasure ?? 'Mesure à définir'} · {g.deadline ?? 'sans échéance'} · {g.priority ?? 'medium'}</p>
              <div className="goal-row" style={{ border: 0, padding: 0 }}>
                <span className="progress"><i style={{ width: `${pct}%` }} /></span>
                <span style={{ fontSize: '.8rem', color: 'var(--ink-soft)', width: 90, textAlign: 'right' }}>{g.milestonesDone}/{g.milestonesTotal} jalons</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
