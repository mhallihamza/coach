// Outils : mémoire personnelle (RAG-lite), bibliothèque de livres de psychologie, ressources d'apprentissage, rapports, logs.
import { connect, toId } from './db.js';
import { formatPassages } from './tools-account-cv.js';
import {
  requireUserId, requireString, optionalString, clampInt, oneOf, handler,
} from './util.js';

const S = (t) => ({ type: 'string', description: t });
const N = (t) => ({ type: 'number', description: t });
const arr = (items, t) => ({ type: 'array', items, description: t });
const okUser = (userId, data = {}) => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, userId, ...data }, null, 2) }] });

export const tools = [
  // ───────────────────────── Mémoire personnelle ─────────────────────────
  {
    name: 'save_memory',
    description: 'Enregistre une mémoire personnelle (fait profil, insight, réflexion approuvée). Respecter le consentement longTermMemory.',
    inputSchema: { type: 'object', required: ['userId', 'type', 'content', 'sourceType', 'sourceId'], properties: { userId: S('JWT sub'), type: oneOfEnum(['profile_fact', 'insight', 'reflection', 'assessment_note', 'cv_fact', 'interview_answer']), content: S('contenu'), sourceType: S('checkin|assessment|reflection|cv|interview'), sourceId: S('id source'), tags: arr({ type: 'string' }, 'tags'), evidence: S('excerpt source') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const doc = { userId, type: oneOf(a.type, ['profile_fact', 'insight', 'reflection', 'assessment_note', 'cv_fact', 'interview_answer'], 'type'), content: requireString(a.content, 'content', { max: 5000 }), sourceType: requireString(a.sourceType, 'sourceType', { max: 50 }), sourceId: requireString(a.sourceId, 'sourceId', { max: 64 }), tags: (a.tags || []).slice(0, 15).map(t => String(t).slice(0, 50)), evidence: optionalString(a.evidence, { max: 500 }) || '', createdAt: new Date() };
      const r = await c.memories.insertOne(doc);
      return okUser(userId, { memoryId: String(r.insertedId) });
    }),
  },
  {
    name: 'search_memories',
    description: 'Recherche dans les mémoires de l’utilisateur. Retourne les passages + occurrences (pour la règle des 3 occurrences) et sufficiency.',
    inputSchema: { type: 'object', required: ['userId', 'query'], properties: { userId: S('JWT sub'), query: S('requête'), limit: N('max 20') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const query = requireString(a.query, 'query', { max: 500 });
      const limit = clampInt(a.limit, { min: 1, max: 20, fallback: 5 });
      const passages = await c.memories.find({ userId, $text: { $search: query } }, { projection: { content: 1, type: 1, sourceType: 1, sourceId: 1, tags: 1, score: { $meta: 'textScore' } } }).sort({ score: { $meta: 'textScore' } }).limit(limit).toArray();
      const docs = passages.map(p => ({ ...p, text: p.content }));
      return okUser(userId, formatPassages(docs, 'memory'));
    }),
  },
  {
    name: 'delete_memory',
    description: 'Supprime une mémoire précise (droit à l’oubli granulaire).',
    inputSchema: { type: 'object', required: ['userId', 'memoryId'], properties: { userId: S('JWT sub'), memoryId: S('id') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const memoryId = toId(requireString(a.memoryId, 'memoryId', { max: 64 }));
      const r = await c.memories.deleteOne({ _id: memoryId, userId });
      if (r.deletedCount === 0) throw new Error('Mémoire introuvable pour cet utilisateur.');
      return okUser(userId, { deleted: true });
    }),
  },

  // ───────────────────────── Bibliothèque de psychologie ─────────────────────────
  {
    name: 'add_book',
    description: 'Ajoute un livre/un résumé à la bibliothèque partagée de psychologie (chunké + indexé pour la recherche). N’y mettre que des textes dont l’usage est autorisé (notes originales, domaines publics, accords).',
    inputSchema: { type: 'object', required: ['userId', 'title', 'chunks'], properties: { userId: S('JWT sub (uploader)'), title: S('titre'), author: S('auteur'), topics: arr({ type: 'string' }, 'communication, procrastination…'), language: S('ar|fr|en'), chunks: arr({ type: 'string' }, 'passages du livre/notes') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const title = requireString(a.title, 'title', { max: 300 });
      const chunks = (a.chunks || []).map(t => String(t).slice(0, 2000)).filter(t => t.trim().length > 20).slice(0, 1000);
      if (chunks.length === 0) throw new Error('chunks vide : fournir des passages d’au moins 20 caractères.');
      const book = await c.books.insertOne({ userId, title, author: optionalString(a.author, { max: 200 }) || 'Inconnu', topics: (a.topics || []).slice(0, 10).map(t => String(t).slice(0, 60)), language: a.language || 'fr', chunksCount: chunks.length, createdAt: new Date() });
      await c.bookChunks.insertMany(chunks.map((text, i) => ({ bookId: book.insertedId, seq: i, text, createdAt: new Date() })));
      return okUser(userId, { bookId: String(book.insertedId), chunks: chunks.length });
    }),
  },
  {
    name: 'search_books',
    description: 'AGENTIC RAG — recherche dans la bibliothèque partagée de psychologie. Stratégie automatique: direct → expansion par synonymes psy (procrastination, communication, émotions, habitudes, objectifs) → termes de contenu → parcours récents. Retourne passages + occurrences + sufficiency (règle des 3 occurrences) + notes sur la stratégie utilisée. Seul du texte libre/notes originales est stocké (jamais de livres sous copyright intégral).',
    inputSchema: { type: 'object', required: ['query'], properties: { query: S('requête'), topics: arr({ type: 'string' }, 'filtrer par thème'), limit: N('max 20') } },
    handler: handler(async (a) => {
      const c = await connect();
      const query = requireString(a.query, 'query', { max: 500 });
      const limit = clampInt(a.limit, { min: 1, max: 20, fallback: 5 });
      const notes = [];

      const retrieve = async (q, maxDocs) => c.bookChunks
        .find({ $text: { $search: q } }, { projection: { text: 1, bookId: 1, score: { $meta: 'textScore' } } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(maxDocs).toArray();

      const PSYCH_ALIASES = [
        [/procrast|remettre|paresse|attendre demain|ajourner/i, 'procrastination régulation émotionnelle habits'],
        [/communiqu|parler|écoute|feedback|conflit|assert/i, 'communication écoute conflits feedback assertivité'],
        [/émotion|stress|anxie|peur|confiance|estime|auto-efficac/i, "intelligence émotionnelle régulation émotions auto-efficacité stress"],
        [/habitude|routine|discipline|constance|streak/i, 'habitudes routines constance discipline suivi'],
        [/objectif|but|goal|smart|plan.*action/i, 'objectifs SMART planification'],
        [/sommeil|fatigue|énergie|épuis/i, 'énergie sommeil récupération stress'],
        [/motivation|ambition|persévé/i, 'motivation intrinsèque valeurs engagement'],
      ];
      const STOP = new Set(['pour', 'avec', 'sans', 'dans', 'sur', 'chez', 'comment', 'pourquoi', 'quand', 'avec', 'vous', 'nous', 'ils', 'elles', 'este', 'sont', 'avec']);

      let docs = await retrieve(query, limit * 3);
      let strategy = 'direct';

      if (!docs.length) {
        const expanded = PSYCH_ALIASES.filter(([re]) => re.test(query)).map(([, e]) => e);
        if (expanded.length) {
          const q = [...new Set(expanded.join(' ').split(/\s+/))].join(' ');
          docs = await retrieve(q, limit * 3);
          if (docs.length) { strategy = 'alias_expansion'; notes.push(`0 résultat direct — requête élargie (synonymes psy): « ${q} »`); }
        }
      }
      if (!docs.length) {
        const words = query.toLowerCase().split(/[^a-zàâäéèêëïîôöùûüç]+/i).filter(w => w.length > 3 && !STOP.has(w));
        if (words.length) {
          docs = await retrieve(words.join(' '), limit * 3);
          if (docs.length) { strategy = 'content_terms'; notes.push(`Recherche élargie aux termes de contenu: « ${words.join(' ')} »`); }
        }
      }

      const byId = new Map();
      if (docs.length) {
        const books = await c.books.find({ _id: { $in: [...new Set(docs.map(d => d.bookId))] } }, { projection: { title: 1, author: 1, topics: 1 } }).toArray();
        for (const b of books) byId.set(String(b._id), b);
      }

      let passages = docs.map(d => {
        const book = byId.get(String(d.bookId));
        return { sourceType: 'book', sourceId: String(d.bookId), title: book?.title, author: book?.author, topics: book?.topics, excerpt: d.text.slice(0, 400), score: d.score, collection: 'books' };
      });

      if (Array.isArray(a.topics) && a.topics.length) {
        const wanted = a.topics.map(t => String(t).toLowerCase());
        passages = passages.filter(p => (p.topics || []).some(t => wanted.includes(String(t).toLowerCase())));
      }
      passages = passages.slice(0, limit);

      if (!passages.length && !notes.length) notes.push('Aucun passage trouvé — bibliothèque psy insuffisamment alimentée sur ce thème. Considérez d’ajouter un livre (add_book) sur ce sujet.');
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, strategy, passages, occurrences: passages.length, sufficiency: passages.length >= 3 ? 'enough' : passages.length >= 1 ? 'partial' : 'insufficient', notes }, null, 2) }] };
    }),
  },
  {
    name: 'list_books',
    description: 'Liste les livres/notes disponibles dans la bibliothèque partagée.',
    inputSchema: { type: 'object', properties: { limit: N('max 50') } },
    handler: handler(async (a) => {
      const c = await connect();
      const books = await c.books.find({}, { projection: { userId: 0 } }).sort({ createdAt: -1 }).limit(clampInt(a?.limit, { min: 1, max: 50, fallback: 20 })).toArray();
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, books: books.map(({ _id, ...b }) => ({ id: String(_id), ...b })) }, null, 2) }] };
    }),
  },

  // ───────────────────────── Ressources d'apprentissage ─────────────────────────
  {
    name: 'add_learning_resource',
    description: 'Ajoute une ressource curée (cours, article, vidéo) à la bibliothèque. Le modèle ne doit PAS créer d’URL : uniquement des ressources vérifiées et fournies.',
    inputSchema: { type: 'object', required: ['userId', 'title', 'type'], properties: { userId: S('JWT sub'), title: S('titre'), type: oneOfEnum(['course', 'book', 'article', 'video', 'tool']), url: S('URL vérifiée'), description: S('résumé'), skills: arr({ type: 'string' }, 'compétences couvertes') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const doc = { userId, title: requireString(a.title, 'title', { max: 300 }), type: oneOf(a.type, ['course', 'book', 'article', 'video', 'tool'], 'type'), url: optionalString(a.url, { max: 500 }) || null, description: optionalString(a.description, { max: 2000 }) || '', skills: (a.skills || []).slice(0, 20).map(s => String(s).slice(0, 80)), createdAt: new Date() };
      const r = await c.learningResources.insertOne(doc);
      return okUser(userId, { resourceId: String(r.insertedId) });
    }),
  },
  {
    name: 'search_learning_resources',
    description: 'Recherche dans les ressources curées par compétence/mot-clé. Jamais de ressource inventée : seul ce qui est en bibliothèque est retourné.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: S('requête'), limit: N('max 20') } },
    handler: handler(async (a) => {
      const c = await connect();
      const query = requireString(a.query, 'query', { max: 500 });
      const limit = clampInt(a.limit, { min: 1, max: 20, fallback: 5 });
      const items = await c.learningResources.find({ $text: { $search: query } }, { projection: { score: { $meta: 'textScore' } } }).sort({ score: { $meta: 'textScore' } }).limit(limit).toArray();
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, resources: items.map(({ _id, score, ...r }) => ({ id: String(_id), ...r, score })) }, null, 2) }] };
    }),
  },

  // ───────────────────────── Rapports & logs ─────────────────────────
  {
    name: 'save_report',
    description: 'Archive un rapport généré (weekly_review, gap_report, pdf_export…) pour l’historique et l’export PDF.',
    inputSchema: { type: 'object', required: ['userId', 'type', 'title', 'payload'], properties: { userId: S('JWT sub'), type: oneOfEnum(['weekly_review', 'gap_report', 'goal_review', 'pdf_export']), title: S('titre'), payload: { type: 'object', description: 'contenu du rapport' } } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      if (!a.payload || typeof a.payload !== 'object') throw new Error('payload requis (objet).');
      if (JSON.stringify(a.payload).length > 200000) throw new Error('payload trop volumineux (max 200 Ko).');
      const r = await c.reports.insertOne({ userId, type: oneOf(a.type, ['weekly_review', 'gap_report', 'goal_review', 'pdf_export'], 'type'), title: requireString(a.title, 'title', { max: 300 }), payload: a.payload, createdAt: new Date() });
      return okUser(userId, { reportId: String(r.insertedId) });
    }),
  },
  {
    name: 'list_reports',
    description: 'Liste les rapports archivés de l’utilisateur.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub'), type: S('filtre optionnel'), limit: N('max 50') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const filter = { userId };
      if (a.type) filter.type = String(a.type).slice(0, 40);
      const items = await c.reports.find(filter, { projection: { payload: 0 } }).sort({ createdAt: -1 }).limit(clampInt(a.limit, { min: 1, max: 50, fallback: 10 })).toArray();
      return okUser(userId, { reports: items.map(({ _id, ...r }) => ({ id: String(_id), ...r })) });
    }),
  },
  {
    name: 'log_agent_execution',
    description: 'Journalise une exécution d’agent (flow, taskId, outils appelés, status, durée). À appeler par la fin de chaque flux.',
    inputSchema: { type: 'object', required: ['userId', 'flowName', 'status'], properties: { userId: S('JWT sub'), flowName: S('Supervisor'), taskId: S('tâche A2A'), tools: arr({ type: 'string' }, 'outils appelés'), status: oneOfEnum(['ok', 'needs_info', 'failed', 'blocked']), durationMs: N('durée') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const r = await c.agentExecutions.insertOne({ userId, flowName: requireString(a.flowName, 'flowName', { max: 80 }), taskId: optionalString(a.taskId, { max: 80 }) || null, tools: (a.tools || []).slice(0, 30).map(t => String(t).slice(0, 80)), status: oneOf(a.status, ['ok', 'needs_info', 'failed', 'blocked'], 'status'), durationMs: Number.isFinite(Number(a.durationMs)) ? Math.max(0, Math.round(Number(a.durationMs))) : null, createdAt: new Date() });
      return okUser(userId, { executionId: String(r.insertedId) });
    }),
  },
  {
    name: 'health_check',
    description: 'Vérifie la connexion MongoDB et retourne le nombre de documents par collection.',
    inputSchema: { type: 'object', properties: {} },
    handler: handler(async () => {
      const c = await connect();
      const counts = {};
      for (const [name, col] of Object.entries(c)) counts[name] = await col.estimatedDocumentCount();
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, db: 'coach', counts }, null, 2) }] };
    }),
  },
];

function oneOfEnum(values) { return { type: 'string', enum: values, description: `one of: ${values.join('|')}` }; }
