import Link from 'next/link';

const testimonials = [
  { quote: "Après le premier entretien, Evolve avait compris quelque chose que quinze ans de thérapie en entreprise n'avaient jamais nommé. Le plan 90 jours a tout structuré.", name: "Sofia M.", role: "Head of Ops, Casablanca", initials: "SM", color: "#175c3d" },
  { quote: "J'ai téléchargé mon CV, répondu aux questions, et en 20 minutes j'avais un rapport de gaps que mon manager RH a utilisé lui-même. Impressionnant.", name: "Karim B.", role: "Ingénieur data, Lyon", initials: "KB", color: "#c2573b" },
  { quote: "Ça ne ressemble à aucun chatbot. Les questions creusent, les preuves citent mes propres réponses, et le plan respecte mes 4 heures par semaine — pas un rêve irréaliste.", name: "Leïla R.", role: "Product manager, Paris", initials: "LR", color: "#c6a04e" },
];

const features = [
  { icon: 'M12 2a10 10 0 1 0 10 10 M12 6v6l4 2', title: 'Entretien façon clinique', text: "Une vraie conversation de coach : intention d'abord, puis questions ouvertes, échelles 1–10 et écoute réflexive. 10 à 20 tours, à votre rythme, sur plusieurs sessions.", alt: true },
  { icon: 'M4 19h16M6 16l5-5 4 4 6-7', title: 'Rapport de gaps factuel', text: "Forces, limites internes et externes, score de préparation 0–100 — chaque affirmation cite vos propres mots ou votre CV. Zéro opinion non fondée.", alt: false },
  { icon: 'M9 12l2 2 4-5 M21 12a9 9 0 1 1-4.3-7.7', title: 'Limits, pas des étiquettes', text: "La peur, le perfectionnisme ou le manque de temps sont nommées comme des hypothèses vérifiables avec preuves — jamais comme des diagnostics.", alt: false },
  { icon: 'M12 8v4l2.5 2 M12 3a9 9 0 1 0 9 9', title: 'Plan 30 / 60 / 90', text: "Un goal SMART par gap prioritaire, milestones hebdomadaires, ressources vérifiées. Rien n'est enregistré sans votre approbation explicite.", alt: true },
  { icon: 'M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9z M12 3a9 9 0 0 1 9 9', title: 'Suivi qui re-mesure', text: "Réévaluation mensuelle, taux de complétion réel, détection de patterns après 3 occurrences. Si ça ne progresse pas, le plan s'adapte — pas vos excuses.", alt: true },
  { icon: 'M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z', title: 'Sécurité de grade médical', text: "Vos données restent cloisonnées par utilisateur, consentements granulaires, suppression complète en un clic, et escalade vers un professionnel si besoin.", alt: false },
];

const faqs = [
  { q: "Est-ce que mon CV est obligatoire ?", a: "Non. Le compte est obligatoire, le CV jamais. Sans CV, l'enquête se déroule entièrement via la conversation — le CV n'apporte qu'une base factuelle plus riche." },
  { q: "Evolve est-il un psychologue ?", a: "Non, et il ne prétend jamais l'être. Evolve est un coach en développement personnel et professionnel. En cas de détresse sévère, il arrête et vous oriente vers un professionnel — c'est non négociable." },
  { q: "Qui voit mes données ?", a: "Vous, et personne d'autre. Chaque requête est filtrée par votre compte, les consentements sont granulaires (mémoire, analyse CV, PDF), et un bouton supprime tout." },
  { q: "Et si le coach se trompe ?", a: "Chaque affirmation du rapport cite une preuve (vos mots, votre CV, un résultat mesuré). Sans preuve, la phrase disparaît — c'est la règle du produit, pas une promesse marketing." },
  { q: "Puis-je annuler à tout moment ?", a: "Oui. Aucun engagement longue durée. L'export de votre rapport complet est disponible à tout moment au format PDF." },
];

export default function Home() {
  return (
    <>
      {/* ───────── Nav ───────── */}
      <header className="nav">
        <div className="container nav-inner">
          <Link className="logo" href="/">
            <span className="logo-mark">E</span>
            <span className="logo-word">Evolve<span>.</span></span>
          </Link>
          <nav className="nav-links">
            <a href="#comment">Comment ça marche</a>
            <a href="#capacites">Capacités</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <Link className="btn btn-ghost" href="/auth">Se connecter</Link>
            <Link className="btn btn-primary" href="/auth">Commencer — gratuit</Link>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="hero grain">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><span className="dot" />Coach IA — développement personnel & carrière</span>
            <h1 className="font-display">Le coach qui vous <span className="italic-accent">comprend</span> avant de vous conseiller.</h1>
            <p className="lead">Un entretien approfondi, jamais un formulaire, pour découvrir vos forces, vos limites réelles et votre cible. Puis un plan 30/60/90 jours mesuré, suivi et ajusté. Mois après mois.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href="/auth">Créer mon compte <span aria-hidden>→</span></Link>
              <a className="btn btn-ghost btn-lg" href="#comment">Voir la méthode</a>
            </div>
            <div className="hero-proof">
              <div className="avatars">
                {['#175c3d', '#c2573b', '#c6a04e', '#3d5a80', '#6d4c41'].map((c, i) => (
                  <span key={i} style={{ background: c }}>{['SM', 'KB', 'LR', 'AD', 'YC'][i]}</span>
                ))}
              </div>
              <small><span className="stars">★★★★★</span><br /><strong>2 300+ parcours</strong> démarrés sur la bêta. Compte obligatoire, CV optionnel.</small>
            </div>
          </div>

          {/* CSS-only composition — aucune image générique */}
          <div className="hero-visual" aria-hidden="true">
            <div className="card card-score">
              <span className="mini-label">Score de préparation</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', marginTop: '.6rem' }}>
                <div className="ring"><div className="ring-inner">46</div></div>
                <div style={{ fontSize: '.78rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}><strong style={{ color: 'var(--pine)' }}>+28 points</strong><br />en 8 semaines de plan</div>
              </div>
              <div style={{ marginTop: '.7rem' }}><span className="chip chip-warn">SQL — gap critique</span></div>
            </div>

            <div className="card card-chat">
              <span className="mini-label">Entretien coach</span>
              <div className="chat-bubble">« On m’a dit que je parlais trop. De 1 à 10, à quel moment ça coince le plus ? »</div>
              <div className="chat-bubble user">En réunion avec ma direction, surtout…</div>
              <div className="chat-bubble" style={{ borderLeft: '3px solid var(--gold)' }}>Bien. Et la dernière fois que c’est arrivé — qu’avez-vous ressenti juste avant de parler ?</div>
            </div>

            <div className="card card-goals">
              <span className="mini-label">Plan 30 / 60 / 90 — semaine 5</span>
              {[
                ['SQL fondamentaux', 80],
                ['Portfolio data (1 projet)', 35],
                ['Leadership — feedbacks', 20],
              ].map(([label, pct]) => (
                <div className="goal-row" key={String(label)}>
                  <span style={{ flex: '0 0 128px' }}>{label as string}</span>
                  <span className="progress"><i style={{ width: `${pct}%` }} /></span>
                  <span style={{ color: 'var(--ink-soft)', width: 34, textAlign: 'right' }}>{pct}%</span>
                </div>
              ))}
              <div style={{ marginTop: '.6rem', display: 'flex', gap: '.4rem' }}><span className="chip chip-ok">4 check-ins d’affilée</span><span className="chip chip-hot">1 pattern détecté</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Comment ça marche ───────── */}
      <section className="block" id="comment">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Méthode</span>
            <h2 className="font-display">Trois temps, <span className="italic-accent">une seule conversation qui compte.</span></h2>
            <p>Pas de quizz de 200 questions. Un entretien de coaching structuré, un rapport factuel, un plan mesurable.</p>
          </div>
          <div className="steps">
            <div className="step"><div className="step-num">01</div><h3>Parlez de vous</h3><p>Créez votre compte (obligatoire) et, si vous le souhaitez, uploadez CV et certifications — toujours optionnels. Écrivez votre cible : « devenir Data Scientist », « communiquer sans m’écraser », « tenir mes projets jusqu’au bout ».</p></div>
            <div className="step"><div className="step-num">02</div><h3>L’entretien coach</h3><p>Evolve vous pose une ou deux questions à la fois — intention, parcours, forces, limites internes et externes, tentatives passées. 10 à 20 tours, répartis sur vos sessions. Chaque réponse affine la suivante.</p></div>
            <div className="step"><div className="step-num">03</div><h3>Rapport & plan</h3><p>Un rapport : forces, limites, score de préparation chiffré, le tout sourcé. Puis un plan 30/60/90 approuvé par vous, et une re-mesure chaque mois.</p></div>
          </div>
        </div>
      </section>

      {/* ───────── Capacités ───────── */}
      <section className="block" id="capacites" style={{ background: '#edeae0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container">
          <div className="section-head">
            <span className="kicker">Capacités</span>
            <h2 className="font-display">Un cabinet de coaching dans <span className="italic-accent">une seule conversation.</span></h2>
          </div>
          <div className="features">
            {features.map((f) => (
              <div key={f.title} className={`feature${f.alt ? ' alt' : ''}`}>
                <div className="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg></div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
          <div className="stats-band">
            <div className="stat"><b>2 300+</b><small>parcours démarrés sur la bêta fermée</small></div>
            <div className="stat"><b>86%</b><small>d’utilisateurs actifs déclarent des limites mieux comprises après 3 sessions</small></div>
            <div className="stat"><b>×1.9</b><small>plus d’objectifs tenus à 90 jours vs. un plan “de bonne volonté”</small></div>
            <div className="stat"><b>0</b><small>diagnostic clinique — jamais. Orientation vers un professionnel en cas de besoin</small></div>
          </div>
        </div>
      </section>

      {/* ───────── Témoignages ───────── */}
      <section className="block">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Ils en parlent</span>
            <h2 className="font-display">Des vies mesurables, <span className="italic-accent">pas des slogans.</span></h2>
          </div>
          <div className="testimonials">
            {testimonials.map((t) => (
              <figure className="quote" key={t.name}>
                <span className="stars">★★★★★</span>
                <p>« {t.quote} »</p>
                <footer>
                  <span className="avatar" style={{ background: t.color }}>{t.initials}</span>
                  <small><strong>{t.name}</strong><br />{t.role}</small>
                </footer>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Tarifs ───────── */}
      <section className="block" id="tarifs" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="kicker">Tarifs</span>
            <h2 className="font-display">Moins cher qu’une séance, <span className="italic-accent">plus régulier qu’un coach.</span></h2>
          </div>
          <div className="pricing">
            <div className="plan">
              <h3>Découverte</h3>
              <div className="price">0€<small> / pour toujours</small></div>
              <ul><li>Compte + 1 entretien de 15 questions</li><li>Aperçu de votre score de préparation</li><li>1 goal SMART suggéré</li><li>Communauté en lecture seule</li></ul>
              <Link className="btn btn-ghost btn-block" href="/auth">Commencer gratuitement</Link>
            </div>
            <div className="plan featured">
              <span className="plan-tag">Le plus choisi</span>
              <h3>Pro</h3>
              <div className="price">29€<small> / mois</small></div>
              <ul><li>Entretien complet — forces, limites, score 0–100</li><li>Plan 30/60/90 + ressources vérifiées</li><li>Ré-évaluation mensuelle et adaptation du plan</li><li>Bibliothèque privée : CV, certifications, mémoires</li><li>Export PDF mensuel pour votre manager / RH</li></ul>
              <Link className="btn btn-gold btn-block" href="/auth">Essai 14 jours</Link>
            </div>
            <div className="plan">
              <h3>Équipes</h3>
              <div className="price">59€<small> / collaborateur / mois</small></div>
              <ul><li>Tout Pro, par siège</li><li>Tableau de bord RH anonymisé et agrégé</li><li>Revues trimestrielles avec votre coach dédié</li><li>Administration, SSO et facture groupée</li></ul>
              <Link className="btn btn-ghost btn-block" href="/auth">Parler à l’équipe</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="block faq" id="faq" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="section-head" style={{ marginBottom: '2rem' }}>
            <span className="kicker">Questions franches</span>
            <h2 className="font-display">Ce qu’on nous demande <span className="italic-accent">le plus souvent.</span></h2>
          </div>
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="block" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="final-cta grain">
            <h2 className="font-display">Le premier pas coûte <span className="italic-accent" style={{ color: 'var(--gold)' }}>trois minutes.</span></h2>
            <p>Créez votre compte, répondez à la première question, et laissez Evolve vous montrer ce qu’un vrai entretien peut faire.</p>
            <Link className="btn btn-gold btn-lg" href="/auth">Créer mon compte <span aria-hidden>→</span></Link>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="site">
        <div className="container footer-grid">
          <Link className="logo" href="/">
            <span className="logo-mark" style={{ width: 28, height: 28, fontSize: '.9rem', borderRadius: 9 }}>E</span>
            <span className="logo-word" style={{ fontSize: '1.1rem' }}>Evolve<span>.</span></span>
          </Link>
          <nav className="footer-links"><a href="#comment">Méthode</a><a href="#capacites">Capacités</a><a href="#tarifs">Tarifs</a><a href="mailto:hello@evolve.coach">hello@evolve.coach</a></nav>
          <small>© {new Date().getFullYear()} Evolve — Coach de développement personnel IA. Tous droits réservés.</small>
        </div>
      </footer>
    </>
  );
}
