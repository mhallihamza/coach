'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getMe, clearToken, type User } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Vue d’ensemble', icon: 'M3 12l9-8 9 8M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9' },
  { href: '/dashboard/evaluation', label: 'Évaluation Evolve', icon: 'M9 12l2 2 4-5 M21 12a9 9 0 1 1-4.3-7.7' },
  { href: '/dashboard/chat', label: 'Coach IA', icon: 'M8 12h8M8 16h5M21 12a9 9 0 1 1-4-7.5' },
  { href: '/dashboard/goals', label: 'Objectifs', icon: 'M12 3l2.7 5.4 6 .9-4.3 4.2 1 5.9L12 17l-5.4 2.8 1-5.9L3.3 9.3l6-.9L12 3z' },
  { href: '/dashboard/career', label: 'Carrière & CV', icon: 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m4 0H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z' },
  { href: '/dashboard/rapport', label: 'Mon rapport', icon: 'M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 2v6h6M9 13h6M9 17h4' },
  { href: '/dashboard/settings', label: 'Réglages & confidentialité', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/auth'); return; }
    getMe().then((d) => setUser(d.user)).catch(() => {});
  }, [router]);

  // Ferme le drawer à chaque navigation
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Verrouille le scroll du body quand le drawer est ouvert (mobile)
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  if (!user) return <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', color: 'var(--ink-soft)' }}>Chargement du tableau de bord…</div>;

  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  const sidebar = (
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Navigation principale">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link className="logo" href="/dashboard" style={{ padding: '.2rem .6rem' }}>
          <span className="logo-mark">E</span>
          <span className="logo-word" style={{ color: '#f6f3ec' }}>Evolve<span style={{ color: 'var(--gold)' }}>.</span></span>
        </Link>
        <button className="burger" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} style={{ borderColor: 'rgba(255,255,255,.2)', background: 'transparent', color: '#f6f3ec' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <nav className="side-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`side-link${pathname === item.href ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '1rem .6rem .2rem', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: '.72rem', color: 'rgba(236,234,223,.45)', lineHeight: 1.5 }}>Compte<br /><span style={{ color: 'rgba(236,234,223,.75)' }}>{user.email}</span></div>
      </div>
      <button className="side-link" onClick={() => { clearToken(); router.replace('/'); }} style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', marginTop: '.4rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        Se déconnecter
      </button>
    </aside>
  );

  return (
    <div className="dash mesh-bg">
      {sidebar}
      <div className={`side-overlay${menuOpen ? ' open' : ''}`} aria-hidden="true" onClick={() => setMenuOpen(false)} />
      <main className="dash-main">
        <div className="dash-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <button className="burger" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
            </button>
            <div><h1 className="font-display">Bonjour, {user.fullName.split(' ')[0]}</h1><span>Voici où vous en êtes aujourd&apos;hui.</span></div>
          </div>
          <div className="avatar-pill"><span className="avatar">{initials}</span>{user.fullName}</div>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
