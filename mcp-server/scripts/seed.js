// Seed : bibliothèque de psychologie (notes ORIGINALES rédigées pour ce projet —
// pas de texte de livre sous copyright) + un utilisateur démo.
// Usage: npm run seed
import { connect, close } from '../src/db.js';

const DEMO_USER = 'demo-user';

const BOOKS = [
  {
    title: "Comprendre et transformer la procrastination (notes du coach)",
    author: 'Notes Evolve AI',
    topics: ['procrastination', 'habitudes', 'gestion du temps'],
    language: 'fr',
    chunks: [
      "La procrastination n'est pas un défaut de caractère mais un problème de régulation émotionnelle: on évite la tâche parce qu'elle déclenche un inconfort (ennui, peur de l'échec, perfectionnisme). La solution commence par réduire la friction: définir la plus petite action possible de 5 minutes.",
      "Le calendrier est un outil de décision: si une tâche n'est pas planifiée dans le calendrier, elle est une intention, pas un engagement. Planifier la tâche au moment précis où l'on est le plus en forme (énergie haute) multiplie le taux de complétion.",
      "Le suivi public (accountability) réduit le taux d'abandon: partager un objectif précis avec une personne et une date limite augmente significativement la probabilité de réalisation. À adapter selon le consentement de l'utilisateur.",
      "La règle des 2 minutes: si une tâche prend moins de 2 minutes, la faire immédiatement au lieu de la reporter. Pour les tâches longues, définir un premier pas minuscule et ridicule de facilité (ouvrir le document, écrire une ligne).",
      "L'évaluation par les pairs et le journal de bord hebdomadaire: noter chaque semaine ce qui a été fait, pas fait, et pourquoi. Après 3+ occurrences du même obstacle, il s'agit d'un pattern — traiter la cause, pas le symptôme.",
    ],
  },
  {
    title: "L'art de la communication interpersonnelle (notes du coach)",
    author: 'Notes Evolve AI',
    topics: ['communication', 'écoute', 'conflits', 'feedback'],
    language: 'fr',
    chunks: [
      "L'écoute active: reformuler ce que l'interlocuteur a dit avant de répondre ('Si j'ai bien compris…'). La plupart des conflits de communication viennent d'une écoute insuffisante, pas d'un désaccord de fond.",
      "Le feedback structuré SBI: Situation — Behavior — Impact. Décrire le contexte précis, le comportement observable (pas l'intention supposée), puis l'impact ressenti. Éviter les étiquettes ('tu es toujours…') qui enferment l'autre et déclenchent la défensive.",
      "Les questions ouvertes révèlent les besoins: 'Qu'est-ce qui compte le plus pour toi dans cette décision ?' fait émerger la motivation réelle là où les questions fermées ne donnent que des oui/non.",
      "Le silence est un outil: après une question importante, résister à l'envie de combler le silence. Les réponses les plus honnêtes arrivent après 3 à 5 secondes de pause.",
      "Assertivité ≠ agressivité: exprimer son besoin clairement ('J'ai besoin de…') sans accuser. Une demande précise et limitée dans le temps ('peux-tu m'envoyer X d'ici jeudi ?') obtient un meilleur résultat qu'une reproche vague.",
    ],
  },
  {
    title: "Intelligence émotionnelle et régulation (notes du coach)",
    author: 'Notes Evolve AI',
    topics: ['émotions', 'stress', 'confiance en soi', 'motivation'],
    language: 'fr',
    chunks: [
      "Nommer l'émotion réduit son intensité: mettre un mot précis sur ce qu'on ressent ('je me sens débordé et frustré') active des zones du cerveau qui régulent la réponse émotionnelle. Pratique: le journal d'émotions en 3 lignes/jour.",
      "L'auto-efficacité se construit par accumulation de petites victoires prouvées: choisir des objectifs atteignables, enregistrer les réussites avec preuves, et revisiter cette banque de preuves avant les moments difficiles.",
      "La motivation intrinsèque > extrinsèque: les objectifs alignés sur les valeurs profondes (pourquoi cet objectif compte pour vous) résistent à l'abandon bien mieux que les objectifs liés à la pression sociale.",
      "Le stress aigu vs chronique: un stress ponctuel avant un entretien peut améliorer la performance; un stress chronique épuise le sommeil, la concentration et l'apprentissage. Les signaux à surveiller: irritabilité, rumination, évitement.",
      "Les croyances limitantes ('je ne suis pas fait pour ça') sont des hypothèses testables, pas des vérités: les confronter à des preuves concrètes dans les deux sens — c'est le cœur du travail du coach.",
    ],
  },
  {
    title: "Construire des habitudes durables (notes du coach)",
    author: 'Notes Evolve AI',
    topics: ['habitudes', 'routines', 'discipline', 'suivi'],
    language: 'fr',
    chunks: [
      "Un empilement d'habitudes (habit stacking): attacher la nouvelle habitude à une habitude existante ('Après mon café du matin, j'écris 10 minutes du rapport'). Le déclencheur existant tire la nouvelle habitude.",
      "La constance bat l'intensité: 20 minutes chaque jour > 3 heures une fois par mois. Le cerveau consolide les apprentissages et les identités par répétition, pas par épiphanie.",
      "Concevoir l'environnement plutôt que combattre la volonté: rendre l'habitude désirée évidente et l'ancienne difficile (livre sur le bureau, téléphone hors de la chambre).",
      "La mesure précède le progrès: sans compteur (streak, taux de complétion), la perception du progrès est systématiquement faussée. Un check-in quotidien de 10 secondes suffit.",
      "La règle du 'reprendre vite': ce n'est pas la chute qui définit l'habitude mais le délai entre la chute et la reprise. Un écart de 1 jour est normal; deux semaines est un abandon — signaler, ne pas culpabiliser.",
    ],
  },
];

const c = await connect();

// 1) Utilisateur démo (compte fictif — à supprimer en prod)
await c.users.updateOne({ userId: DEMO_USER }, { $set: { userId: DEMO_USER, email: 'demo@example.com', fullName: 'Utilisateur Démo', language: 'fr', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });

// 2) Livres (idempotent : ne pas dupliquer si déjà seedés)
for (const book of BOOKS) {
  const exists = await c.books.findOne({ title: book.title });
  if (exists) { console.log('livre déjà présent:', book.title); continue; }
  const r = await c.books.insertOne({ userId: 'system-seed', ...book, chunksCount: book.chunks.length, createdAt: new Date() });
  await c.bookChunks.insertMany(book.chunks.map((text, i) => ({ bookId: r.insertedId, seq: i, text, createdAt: new Date() })));
  console.log('livre seedé:', book.title);
}

// 3) Quelques ressources d'apprentissage curées (sans liens inventés)
const RESOURCES = [
  { title: 'Documentation SQLite + SQL Tutorial (Mode Analytics)', type: 'article', url: 'https://mode.com/sql-tutorial/', description: 'Tutoriel SQL gratuit, idéal pour débutants data', skills: ['sql', 'data'] },
  { title: 'Python for Data Analysis (Wes McKinney, O\'Reilly)', type: 'book', description: 'Référence pandas/NumPy par le créateur de pandas', skills: ['python', 'pandas', 'data'] },
  { title: 'Kaggle Learn — Pandas & Intro to SQL', type: 'course', url: 'https://www.kaggle.com/learn', description: 'Mini-cours gratuits avec notebooks pratiques', skills: ['python', 'sql', 'data'] },
  { title: 'Coursera — Learning How to Learn (McMaster)', type: 'course', url: 'https://www.coursera.org/learn/learning-how-to-learn', description: 'Méthodes d’apprentissage fondées sur les sciences cognitives', skills: ['learning', 'metacognition'] },
];
for (const r of RESOURCES) {
  const exists = await c.learningResources.findOne({ title: r.title });
  if (!exists) await c.learningResources.insertOne({ userId: 'system-seed', ...r, createdAt: new Date() });
}
console.log('ressources d’apprentissage seedées.');

await close();
console.log('\nSeed terminé. Base: coach');
