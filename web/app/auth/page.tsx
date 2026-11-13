'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signup, login, setToken, getToken } from '@/lib/api';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('fr');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (getToken()) router.replace('/dashboard'); }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = mode === 'signup'
        ? await signup(email.trim(), password, fullName.trim(), language)
        : await login(email.trim(), password);
      setToken(res.token);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Panneau latéral premium */}
      <aside className="auth-panel grain">
        <Link className="logo" href="/" style={{ position: 'relative', zIndex: 1 }}>
          <span className="logo-mark">E</span>
          <span className="logo-word" style={{ color: '#f6f3ec' }}>Evolve<span style={{ color: 'var(--gold)' }}>.</span></span>
        </Link>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="font-display">Le premier entretien <span className="italic-accent" style={{ color: 'var(--gold)' }}>change tout.</span></h1>
          <p style={{ marginTop: '1.2rem' }}>Quinze questions honnêtes, un rapport que personne n’ose vous dire, et un plan qui respecte vos vraies heures disponibles.</p>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem' }}>
            {[['2 300+', 'parcours'], ['86%', 'limites mieux comprises'], ['×1.9', 'objectifs tenus à 90 jours']].map(([b, s]) => (
              <div key={String(b)}><b className="font-display" style={{ fontSize: '1.5rem', color: 'var(--gold)' }}>{b}</b><br /><small style={{ color: 'rgba(246,243,236,.6)', fontSize: '.72rem' }}>{s}</small></div>
            ))}
          </div>
        </div>
        <small style={{ position: 'relative', zIndex: 1, color: 'rgba(246,243,236,.45)' }}>Compte obligatoire. CV optionnel. Données cloisonnées, suppressibles en un clic.</small>
      </aside>

      {/* Formulaire */}
      <main className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          <h2 className="font-display">{mode === 'signup' ? 'Créer votre compte' : 'Bon retour'}</h2>
          <p>{mode === 'signup' ? 'Trois minutes pour commencer l’entretien.' : 'Reprenez où vous vous êtes arrêté.'}</p>

          <div className="toggle-row">
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Créer un compte</button>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Se connecter</button>
          </div>

          {error && <div className="form-error">{error}</div>}

          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="fullName">Nom complet</label>
              <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Yasmine Benali" required minLength={2} autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe {mode === 'signup' && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>(8+ caractères)</span>}</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </div>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="language">Langue de coaching</label>
              <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          )}

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
            {loading ? 'Un instant…' : mode === 'signup' ? 'Créer mon compte →' : 'Se connecter →'}
          </button>
          <p className="demo-note">En créant votre compte, vous acceptez nos conditions. Aucune carte bancaire requise pour la bêta.<br />Vous pourrez uploader votre CV plus tard — jamais obligatoire.</p>
        </form>
      </main>
    </div>
  );
}
