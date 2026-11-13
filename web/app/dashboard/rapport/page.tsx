'use client';
import { useEffect, useState } from 'react';
import { getGapReport, downloadGapPdf, type GapReportResponse, type GapReportItem } from '@/lib/api';

function itemText(i: GapReportItem): string {
  if (typeof i === 'string') return i;
  return i.text ?? i.title ?? i.label ?? i.name ?? i.gap ?? i.strength ?? i.limit ?? i.skill ?? Object.values(i).filter(v => typeof v === 'string')[0] ?? JSON.stringify(i);
}
function itemEvidence(i: GapReportItem): string | null {
  if (typeof i !== 'object' || i === null) return null;
  return (i.evidence as string | undefined) ?? (i.source as string | undefined) ?? (i.excerpt as string | undefined) ?? (i.quote as string | undefined) ?? null;
}

export default function RapportPage() {
  const [report, setReport] = useState<GapReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getGapReport().then(setReport).catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, []);

  async function handleDownload() {
    setDownloading(true);
    try { await downloadGapPdf(); } catch (e) { setError(e instanceof Error ? e.message : 'Téléchargement impossible'); } finally { setDownloading(false); }
  }

  const score = report?.matchScore ?? null;
  const strengths = report?.strengths ?? [];
  const gaps = report?.gaps ?? [];
  const limits = report?.limits ?? [];
  const target = report?.objective?.targetRole;
  const horizon = report?.objective?.horizonMonths;
  const hours = report?.objective?.weeklyHours;
  const motivation = report?.objective?.motivation;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1rem' }}>
      {error && <div className="form-error" style={{ gridColumn: '1 / -1' }}>{error}</div>}

      <section className="panel">
        <div className="panel-head"><h2>Mon rapport</h2>{score != null && <button className="btn btn-primary" style={{ padding: '.5rem 1.1rem', fontSize: '.85rem' }} onClick={handleDownload} disabled={downloading}>{downloading ? 'Génération…' : '↓ Télécharger PDF'}</button>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.3rem', marginBottom: '1.2rem' }}>
          <div className="ring" style={{ width: 120, height: 120 }}><div className="ring-inner" style={{ width: 90, height: 90, fontSize: '1.9rem' }}>{score != null ? score : '—'}</div></div>
          <div style={{ fontSize: '.9rem', color: 'var(--ink-soft)', lineHeight: 1.6 }}><strong style={{ color: 'var(--forest-deep)' }}>Readiness Score</strong><br />{score != null ? 'Calculé depuis vos preuves — jamais estimé.' : 'Disponible après votre entretien.'}</div>
        </div>
        <span className="mini-label">Votre cible</span>
        {target ? (
          <p style={{ margin: '.4rem 0 0', fontSize: '.92rem', lineHeight: 1.6 }}><strong>{target}</strong>{horizon ? ` · ${horizon} mois` : ''}{hours ? ` · ${hours} h/semaine` : ''}{motivation ? <><br /><span style={{ color: 'var(--ink-soft)' }}>{motivation}</span></> : null}</p>
        ) : (
          <p style={{ margin: '.4rem 0 0', fontSize: '.92rem', lineHeight: 1.6 }}><strong>Aucune cible définie</strong><br /><span style={{ color: 'var(--ink-soft)' }}>Définissez votre objectif et lancez l’entretien pour générer ce rapport.</span></p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Forces & écarts</h2></div>
        <ReportBlock title="Forces documentées" items={strengths} empty="À documenter avec vos preuves." tone="ok" />
        <ReportBlock title="Gaps — écarts vs. la cible" items={gaps} empty="À documenter avec vos preuves." tone="hot" />
        <ReportBlock title="Limites identifiées" items={limits} empty="Aucune limite identifiée pour l’instant." tone="warn" />
        {report?.recommended_focus && (
          <>
            <span className="mini-label" style={{ display: 'block', marginTop: '1rem' }}>Focus recommandé</span>
            <p style={{ margin: '.4rem 0 0 .9rem', fontSize: '.9rem', lineHeight: 1.6 }}>{String(report.recommended_focus)}</p>
          </>
        )}
        {!report?.has_report && (
          <a className="btn btn-ghost btn-block" href="/dashboard/chat" style={{ marginTop: '1.2rem' }}>Commencer l’entretien →</a>
        )}
      </section>
    </div>
  );
}

function ReportBlock({ title, items, empty, tone }: { title: string; items: GapReportItem[]; empty: string; tone: 'ok' | 'hot' | 'warn' }) {
  return (
    <>
      <span className="mini-label" style={{ display: 'block', marginTop: '1.2rem' }}>{title}</span>
      {items.length ? (
        <ul style={{ margin: '.45rem 0 0 .9rem', fontSize: '.88rem', lineHeight: 1.65 }}>
          {items.map((it, idx) => {
            const ev = itemEvidence(it);
            return (
              <li key={idx} style={{ marginBottom: '.35rem' }}>
                {itemText(it)}
                {ev && <span style={{ color: 'var(--ink-soft)', fontSize: '.8rem' }}> — preuve : « {ev} »</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ margin: '.35rem 0 0 .9rem', fontSize: '.86rem', color: 'var(--ink-soft)' }}>{empty}</p>
      )}
    </>
  );
}
