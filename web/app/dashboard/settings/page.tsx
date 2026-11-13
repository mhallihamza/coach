'use client';
import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '@/lib/api';

const CONSENTS = [
  { key: 'longTermMemory', label: 'Mémoire long terme', desc: 'Evolve retient votre parcours entre les sessions pour éviter de re-poser les mêmes questions.' },
  { key: 'cvAnalysis', label: 'Analyse du CV', desc: 'Si vous uploadez un CV, il sert à enrichir votre ligne de base. Vous pouvez le supprimer à tout moment.' },
  { key: 'pdfReports', label: 'Rapports PDF', desc: 'Chaque ré-évaluation mensuelle génère un PDF partageable (manager, RH, coach humain).' },
  { key: 'weeklyEmail', label: 'Email hebdomadaire', desc: 'Un résumé de votre semaine chaque dimanche : progrès, limites, prochaine étape.' },
];

const LANG_OPTIONS: { key: 'fr' | 'ar' | 'en'; label: string; hint: string }[] = [
  { key: 'fr', label: 'Français', hint: 'Questions, réponses et rapports générés en français.' },
  { key: 'ar', label: 'العربية', hint: 'أسئلة وردود وتقارير مولّدة باللغة العربية.' },
  { key: 'en', label: 'English', hint: 'Questions, answers and reports generated in English.' },
];

export default function SettingsPage() {
  const [state, setState] = useState<Record<string, boolean>>({
    longTermMemory: false, cvAnalysis: false, pdfReports: false, weeklyEmail: false,
  });
  const [language, setLanguage] = useState<'fr' | 'ar' | 'en'>('fr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((d) => {
        setState((prev) => {
          const next: Record<string, boolean> = { ...prev };
          for (const k of Object.keys(next)) next[k] = bool(d.consents[k]);
          return next;
        });
        const lang = (d.language as 'fr' | 'ar' | 'en') ?? 'fr';
        if (lang === 'fr' || lang === 'ar' || lang === 'en') setLanguage(lang);
        setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Erreur de chargement'); setLoading(false); });
  }, []);

  function toggle(key: string) {
    const nextValue = !state[key];
    setState({ ...state, [key]: nextValue });
    updateSettings({ [key]: nextValue }).catch((e) => {
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      setState({ ...state, [key]: !nextValue });
    });
  }

  function pickLang(next: 'fr' | 'ar' | 'en') {
    setLanguage(next);
    updateSettings({}, next).catch(() => { /* persistence optional — UI still updates */ });
  }

  if (loading) {
    return (
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-head"><h2>Réglages & confidentialité</h2></div>
        <p style={{ color: 'var(--ink-soft)', padding: '1rem 0' }}>Chargement des réglages…</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-head"><h2>Réglages & confidentialité</h2><span className="chip chip-ok">enregistré automatiquement</span></div>
      {error && <div className="form-error">{error}</div>}
      <p style={{ fontSize: '.9rem', color: 'var(--ink-soft)', lineHeight: 1.65, marginBottom: '1.2rem' }}>Chaque consentement est indépendant. Désactiver n’efface rien immédiatement ; la suppression complète est disponible ci-dessous.</p>

      <span className="mini-label">Langue coach</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem', marginTop: '.4rem' }}>
        {LANG_OPTIONS.map(opt => (
          <button key={opt.key} type="button" onClick={() => pickLang(opt.key)}
            style={{ border: `2px solid ${language === opt.key ? 'var(--pine)' : 'var(--line)'}`, background: language === opt.key ? 'rgba(23,92,61,.08)' : '#fff', color: 'var(--forest-deep)', borderRadius: 14, padding: '.6rem .6rem', textAlign: 'left', cursor: 'pointer', fontSize: '.88rem', fontWeight: 600 }}>
            {opt.label}<br /><small style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: '.78rem', lineHeight: 1.35 }}>{opt.hint}</small>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '.7rem', marginTop: '1.2rem' }}>
        {CONSENTS.map((c) => (
          <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '.9rem', border: '1px solid var(--line)', borderRadius: 14, padding: '.9rem 1rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={state[c.key]} onChange={() => toggle(c.key)} style={{ width: 20, height: 20, accentColor: 'var(--pine)' }} />
            <span><strong style={{ fontSize: '.92rem' }}>{c.label}</strong><br /><small style={{ color: 'var(--ink-soft)', lineHeight: 1.5 }}>{c.desc}</small></span>
          </label>
        ))}
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1.4rem 0' }} />
      <span className="mini-label" style={{ color: 'var(--clay)' }}>Zone de danger</span>
      <p style={{ fontSize: '.85rem', color: 'var(--ink-soft)', margin: '.4rem 0 .7rem' }}>La suppression est définitive et concerne vos messages, CV, mémoires, rapports et objectifs.</p>
      <button className="btn btn-ghost" style={{ color: 'var(--clay)', borderColor: 'rgba(194,87,59,.4)' }} onClick={() => alert('Démo — la suppression complète serait confirmée par email.')}>Supprimer toutes mes données</button>
    </section>
  );
}

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}
