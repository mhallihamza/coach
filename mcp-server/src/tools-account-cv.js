// Tous les outils du coach — un seul serveur MCP pour tous les agents.
// NOTE ARCHITECTURE : le RAG = bibliothèque de livres de psychologie (search_books/add_book/list_books).
// Les CVs sont gérés par le service LangGraph (coach-cv-service, port 8300) ; les outils
// save_cv / search_cv / list_cvs / delete_cv ici délèguent à ce service via HTTP.
import { connect } from './db.js';
import {
  requireUserId, requireString, optionalString, clampInt, oneOf,
  validateCriteriaScores, handler,
} from './util.js';

const S = (t) => ({ type: 'string', description: t });
const N = (t) => ({ type: 'number', description: t });
const B = (t) => ({ type: 'boolean', description: t });
const arr = (items, t) => ({ type: 'array', items, description: t });

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || 'http://localhost:8300';

async function cvService(path, { method = 'POST', body, timeoutMs = 8000 } = {}) {
  try {
    const res = await fetch(`${CV_SERVICE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'cv_service_unreadable' }));
    if (!res.ok) return { ok: false, error: data?.detail || `cv_service_${res.status}` };
    return data;
  } catch (err) {
    return { ok: false, error: `cv_service_unreachable (${CV_SERVICE_URL}): ${err?.message || err}` };
  }
}

export const tools = [
  // ───────────────────────── Compte & profil ─────────────────────────
  {
    name: 'create_user',
    description: 'Provisionne un compte utilisateur (compte obligatoire dans Evolve AI). Appelé par le backend après signup Supabase Auth.',
    inputSchema: { type: 'object', required: ['userId', 'email', 'fullName'], properties: { userId: S('JWT sub'), email: S('email'), fullName: S('nom'), language: S('ar|fr|en') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const email = requireString(a.email, 'email', { max: 200 });
      const fullName = requireString(a.fullName, 'fullName', { max: 120 });
      await c.users.updateOne({ userId }, { $set: { userId, email, fullName, language: a.language || 'fr', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      return okUser(userId);
    }),
  },
  {
    name: 'get_user_profile',
    description: 'Retourne le profil (identité, préférences, coaching_style, langue) de l’utilisateur authentifié.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const [user, profile, consents] = await Promise.all([
        c.users.findOne({ userId }, { projection: { _id: 0, passwordHash: 0 } }),
        c.profiles.findOne({ userId }, { projection: { _id: 0 } }),
        c.consents.find({ userId }, { projection: { _id: 0 } }).toArray(),
      ]);
      return okUser(userId, { user, profile, consents });
    }),
  },
  {
    name: 'update_user_profile',
    description: 'Met à jour UNIQUEMENT les champs autorisés du profil (fullName, language, coachingStyle, bio, avatarUrl).',
    inputSchema: { type: 'object', required: ['userId', 'fields'], properties: { userId: S('JWT sub'), fields: { type: 'object', description: 'Champs autorisés uniquement' } } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const allowed = ['fullName', 'language', 'coachingStyle', 'bio', 'avatarUrl'];
      const fields = a.fields && typeof a.fields === 'object' ? a.fields : {};
      const clean = {};
      for (const k of allowed) if (fields[k] !== undefined) clean[k] = typeof fields[k] === 'string' ? fields[k].slice(0, 2000) : fields[k];
      if (Object.keys(clean).length === 0) throw new Error('Aucun champ autorisé fourni (fullName, language, coachingStyle, bio, avatarUrl).');
      if (clean.coachingStyle) oneOf(clean.coachingStyle, ['supportive', 'direct', 'challenging'], 'coachingStyle');
      if (clean.language) oneOf(clean.language, ['ar', 'fr', 'en'], 'language');
      await c.profiles.updateOne({ userId }, { $set: { ...clean, updatedAt: new Date() } }, { upsert: true });
      return okUser(userId, { updated: clean });
    }),
  },
  {
    name: 'set_consent',
    description: 'Active/désactive un consentement granulaire: longTermMemory, cvAnalysis, pdfReports, weeklyEmail, marketing.',
    inputSchema: { type: 'object', required: ['userId', 'consentType', 'granted'], properties: { userId: S('JWT sub'), consentType: S('type'), granted: B('true/false') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const consentType = oneOf(a.consentType, ['longTermMemory', 'cvAnalysis', 'pdfReports', 'weeklyEmail', 'marketing'], 'consentType');
      const granted = Boolean(a.granted);
      await c.consents.updateOne({ userId, consentType }, { $set: { userId, consentType, granted, updatedAt: new Date() } }, { upsert: true });
      return okUser(userId, { consentType, granted });
    }),
  },

  // ───────────────────────── CV & certifications ─────────────────────────
  {
    name: 'save_cv',
    description: 'Enregistre le CV analysé — délègue au service LangGraph (coach-cv-service). Appelé après upload + parsing côté backend.',
    inputSchema: { type: 'object', required: ['userId', 'fileName', 'parsedText'], properties: { userId: S('JWT sub'), fileName: S('nom du fichier'), parsedText: S('texte extrait'), chunks: arr({ type: 'string' }, 'chunks optionnels (ignorés par le service)'), language: S('langue détectée') } },
    handler: handler(async (a) => {
      const userId = requireUserId(a);
      const fileName = requireString(a.fileName, 'fileName', { max: 300 });
      const parsedText = requireString(a.parsedText, 'parsedText', { max: 200000 });
      const r = await cvService('/ingest-text', { body: { user_id: userId, filename: fileName, language: a.language || 'unknown', parsed_text: parsedText } });
      if (!r.ok) throw new Error(r.error || 'cv_service_failed');
      return okUser(userId, { cvId: r.cvId, chunks: r.chunks, engine: 'langgraph' });
    }),
  },
  {
    name: 'search_cv',
    description: 'Recherche dans les CVs de l’utilisateur — délègue au service LangGraph. Retourne passages + occurrences + sufficiency (règle des 3 occurrences).',
    inputSchema: { type: 'object', required: ['userId', 'query'], properties: { userId: S('JWT sub'), query: S('requête'), limit: N('max 20') } },
    handler: handler(async (a) => {
      const userId = requireUserId(a);
      const query = requireString(a.query, 'query', { max: 500 });
      const limit = clampInt(a.limit, { min: 1, max: 20, fallback: 5 });
      const r = await cvService('/search', { body: { user_id: userId, query, limit } });
      if (!r.ok) throw new Error(r.error || 'cv_service_failed');
      const passages = (r.passages || []).map(p => ({ sourceType: 'cv', sourceId: String(p.source_id || p.sourceId || ''), excerpt: p.excerpt, score: p.score ?? null }));
      return okUser(userId, { passages, occurrences: r.occurrences ?? passages.length, sufficiency: r.sufficiency ?? 'insufficient', notes: r.notes || [] });
    }),
  },
  {
    name: 'list_cvs',
    description: 'Liste les CVs de l’utilisateur (métadonnées uniquement) — délègue au service LangGraph.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const userId = requireUserId(a);
      const r = await cvService(`/cvs/${encodeURIComponent(userId)}`, { method: 'GET' });
      if (!r.ok) throw new Error(r.error || 'cv_service_failed');
      return okUser(userId, { cvs: r.cvs || [] });
    }),
  },
  {
    name: 'delete_cv',
    description: 'Supprime définitivement un CV et tous ses chunks/mémoires dérivées — délègue au service LangGraph.',
    inputSchema: { type: 'object', required: ['userId', 'cvId'], properties: { userId: S('JWT sub'), cvId: S('id du CV') } },
    handler: handler(async (a) => {
      const userId = requireUserId(a);
      const cvId = requireString(a.cvId, 'cvId', { max: 64 });
      const r = await cvService(`/cvs/${encodeURIComponent(userId)}/${encodeURIComponent(cvId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(r.error || 'cv_service_failed');
      return okUser(userId, { deleted: true, chunksRemoved: r.chunksRemoved ?? 0, memoriesRemoved: r.memoriesRemoved ?? 0 });
    }),
  },
  {
    name: 'save_certification',
    description: 'Enregistre une certification/formation (nom, organisme, date, compétences extraites).',
    inputSchema: { type: 'object', required: ['userId', 'name'], properties: { userId: S('JWT sub'), name: S('nom'), issuer: S('organisme'), date: S('YYYY-MM'), skills: arr({ type: 'string' }, 'compétences') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const doc = { userId, name: requireString(a.name, 'name', { max: 200 }), issuer: optionalString(a.issuer, { max: 200 }), date: optionalString(a.date, { max: 20 }), skills: (a.skills || []).slice(0, 30).map(String), createdAt: new Date() };
      const r = await c.certifications.insertOne(doc);
      return okUser(userId, { certificationId: String(r.insertedId) });
    }),
  },
  {
    name: 'list_certifications',
    description: 'Liste les certifications/formations de l’utilisateur.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const items = await c.certifications.find({ userId }).sort({ createdAt: -1 }).toArray();
      return okUser(userId, { certifications: items.map(({ _id, ...r }) => ({ id: String(_id), ...r })) });
    }),
  },
  {
    name: 'save_career_objective',
    description: 'Crée/remplace l’objectif de carrière (rôle cible, horizon, motivation, heures/semaine). Un seul objectif actif par utilisateur.',
    inputSchema: { type: 'object', required: ['userId', 'targetRole', 'horizonMonths'], properties: { userId: S('JWT sub'), targetRole: S('rôle cible'), horizonMonths: N('1-60'), motivation: S('pourquoi'), weeklyHours: N('heures dispo/semaine') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const targetRole = requireString(a.targetRole, 'targetRole', { max: 200 });
      const horizonMonths = clampInt(a.horizonMonths, { min: 1, max: 60, fallback: 12 });
      const weeklyHours = clampInt(a.weeklyHours ?? 5, { min: 1, max: 80, fallback: 5 });
      await c.careerObjectives.updateOne({ userId }, { $set: { userId, targetRole, horizonMonths, motivation: optionalString(a.motivation, { max: 1000 }) || '', weeklyHours, updatedAt: new Date() } }, { upsert: true });
      return okUser(userId, { targetRole, horizonMonths, weeklyHours });
    }),
  },
  {
    name: 'get_career_objective',
    description: 'Retourne l’objectif de carrière actif, ou null si l’utilisateur n’en a pas encore défini.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const objective = await c.careerObjectives.findOne({ userId }, { projection: { _id: 0 } });
      return okUser(userId, { objective });
    }),
  },
];

export function formatPassages(docs, sourceType) {
  const passages = docs.map(d => ({
    sourceType,
    sourceId: String(d.cvId || d.bookId || d._id || ''),
    excerpt: (d.text || '').slice(0, 400),
    score: d.score ?? null,
  }));
  return { passages, occurrences: passages.length, sufficiency: passages.length >= 3 ? 'enough' : passages.length >= 1 ? 'partial' : 'insufficient' };
}


function okUser(userId, data = {}) {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, userId, ...data }, null, 2) }] };
}

