'use client';
import { useState, useEffect } from 'react';
import { uploadCv, listMyCvs } from '@/lib/api';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function CareerPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [cvError, setCvError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [horizon, setHorizon] = useState('12');
  const [hours, setHours] = useState('5');
  const [saved, setSaved] = useState(false);

  // Rehydrate persisted CV after navigation / refresh
  useEffect(() => {
    listMyCvs()
      .then(({ cvs }) => {
        const latest = cvs[0];
        if (latest && latest.status === 'ready') {
          setFileName(latest.fileName);
          setUploadState('done');
        }
      })
      .catch(() => {
        /* silently ignore — UI stays in idle state */
      });
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setFileName(f.name);
      setUploadState('error');
      setCvError('Fichier trop volumineux (max 8 Mo).');
      return;
    }
    setFileName(f.name);
    setUploadState('uploading');
    setCvError(null);
    try {
      await uploadCv(f, 'fr');
      setUploadState('done');
    } catch (err) {
      setUploadState('error');
      setCvError(err instanceof Error ? err.message : 'Échec de l’envoi du CV.');
    }
  }

  const dropClass = `cv-drop${uploadState === 'error' ? ' error' : ''}`;
  const canSave = targetRole.trim().length > 0 && uploadState !== 'uploading';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1rem' }}>
      <section className="panel">
        <div className="panel-head"><h2>Votre cible</h2><span className="chip chip-ok">CV optionnel</span></div>

        <label className={dropClass} htmlFor="cv">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: 'var(--pine)' }} aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" /></svg>
          {uploadState === 'uploading' && <><strong>Envoi de {fileName}…</strong><br /><small>Analyse en cours dans votre espace.</small></>}
          {uploadState === 'done' && <><strong>{fileName}</strong><br /><span className="chip chip-ok" style={{ marginTop: '.2rem' }}>✓ prêt pour analyse</span></>}
          {uploadState === 'error' && <><strong>Échec de l’envoi</strong><br /><small>{cvError ?? 'Réessayez avec un autre fichier.'}</small></>}
          {uploadState === 'idle' && <>Glissez votre CV ici (PDF, DOCX, TXT)<small>Optionnel — l’entretien fonctionne sans. Restez maître de vos données : supprimez-le à tout moment.</small></>}
          <input id="cv" type="file" accept=".pdf,.docx,.txt" onChange={onFile} hidden />
        </label>

        <div className="field" style={{ marginTop: '1.1rem' }}>
          <label htmlFor="target">Je veux devenir…</label>
          <input id="target" value={targetRole} onChange={(e) => { setTargetRole(e.target.value); setSaved(false); }} placeholder="Data Scientist, Product Manager, Consultant…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem' }}>
          <div className="field">
            <label htmlFor="horizon">Horizon (mois)</label>
            <select id="horizon" value={horizon} onChange={(e) => { setHorizon(e.target.value); setSaved(false); }}>{['3', '6', '12', '18', '24'].map(h => <option key={h} value={h}>{h} mois</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="hours">Heures / semaine</label>
            <select id="hours" value={hours} onChange={(e) => { setHours(e.target.value); setSaved(false); }}>{['2', '5', '8', '12', '20'].map(h => <option key={h} value={h}>{h} h</option>)}</select>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => setSaved(true)} disabled={!canSave}>{uploadState === 'uploading' ? "Analyse du CV…" : "Enregistrer ma cible & préparer l’entretien"}</button>
        {saved && <p style={{ fontSize: '.83rem', color: 'var(--pine)', marginTop: '.6rem', fontWeight: 600 }}>✓ Votre cible est enregistrée{uploadState === 'done' ? ' et votre CV analysé' : ''}. Le coach vous posera ses questions lors de la prochaine session.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Aperçu de votre rapport de gaps</h2><span className="chip chip-warn">à venir</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginBottom: '1rem' }}>
          <div className="ring" style={{ width: 110, height: 110 }}><div className="ring-inner" style={{ width: 82, height: 82, fontSize: '1.7rem' }}>—</div></div>
          <div style={{ fontSize: '.85rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}><strong style={{ color: 'var(--forest-deep)' }}>Readiness Score</strong><br />Votre score apparaîtra ici après l’entretien — chaque écart cite vos propres réponses ou votre CV.</div>
        </div>
        <span className="mini-label">Écarts vs. votre cible</span>
        <div style={{ display: 'grid', gap: '.55rem', marginTop: '.6rem' }}>
          {['Forces', 'Limites internes', 'Limites externes', 'Écarts vs. cible'].map((label) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: '.55rem .8rem', fontSize: '.85rem' }}>
              <span style={{ color: 'var(--ink)' }}>{label}</span>
              <span style={{ color: 'var(--ink-soft)' }}>à documenter</span>
            </div>
          ))}
        </div>
        <span className="mini-label" style={{ display: 'block', marginTop: '1.1rem' }}>Comment ça se passe</span>
        <p style={{ margin: '.5rem 0 0', fontSize: '.86rem', lineHeight: 1.7, color: 'var(--ink-soft)' }}>10 à 20 questions posées une par une par le coach IA, ancrées dans votre CV et vos réponses. Aucune étiquette, aucune invention : chaque ligne du rapport porte une preuve citée.</p>
        <a className="btn btn-ghost btn-block" href="/dashboard/chat" style={{ marginTop: '1.2rem' }}>Démarrer l’entretien →</a>
      </section>
    </div>
  );
}
