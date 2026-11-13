// Outils : assessments, goals & habits, mémoire, livres de psychologie, ressources, rapports.
import { connect, toId } from './db.js';
import { formatPassages } from './tools-account-cv.js';
import {
  requireUserId, requireString, optionalString, clampInt, oneOf,
  validateCriteriaScores, handler,
} from './util.js';

const S = (t) => ({ type: 'string', description: t });
const N = (t) => ({ type: 'number', description: t });
const B = (t) => ({ type: 'boolean', description: t });
const arr = (items, t) => ({ type: 'array', items, description: t });
const obj = (t) => ({ type: 'object', description: t });
const okUser = (userId, data = {}) => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, userId, ...data }, null, 2) }] });

export const tools = [
  // ───────────────────────── Assessments ─────────────────────────
  {
    name: 'save_assessment',
    description: 'Enregistre une évaluation de compétence. Les scores (0-5) sont validés et le TOTAL est calculé ici en code fixe — jamais par le LLM.',
    inputSchema: { type: 'object', required: ['userId', 'skill', 'criteriaScores'], properties: { userId: S('JWT sub'), skill: S('compétence'), criteriaScores: arr(obj('criterion, score 0-5, evidence'), 'liste'), confidence: N('0-1'), sourceType: S('assessment|cv_interview') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const skill = requireString(a.skill, 'skill', { max: 100 });
      const criteriaScores = validateCriteriaScores(a.criteriaScores);
      const totalScore = Math.round(criteriaScores.reduce((s, c) => s + c.score, 0) * 10) / 10;
      const confidence = Math.min(1, Math.max(0, Number(a.confidence ?? 0.5)));
      const r = await c.assessments.insertOne({ userId, skill, criteriaScores, totalScore, maxScore: criteriaScores.length * 5, confidence, sourceType: a.sourceType || 'assessment', createdAt: new Date() });
      return okUser(userId, { assessmentId: String(r.insertedId), totalScore, maxScore: criteriaScores.length * 5 });
    }),
  },
  {
    name: 'get_assessment_history',
    description: 'Historique des évaluations de l’utilisateur (toutes compétences ou une skill précise).',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub'), skill: S('filtre optionnel'), limit: N('max 50') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const limit = clampInt(a.limit, { min: 1, max: 50, fallback: 10 });
      const filter = { userId };
      if (a.skill) filter.skill = String(a.skill).slice(0, 100);
      const items = await c.assessments.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
      return okUser(userId, { assessments: items.map(({ _id, ...r }) => ({ id: String(_id), ...r })) });
    }),
  },
  {
    name: 'save_gap_report',
    description: 'Enregistre un rapport de gaps (CV vs objectif). matchScore est validé entre 0 et 100.',
    inputSchema: { type: 'object', required: ['userId', 'payload', 'matchScore'], properties: { userId: S('JWT sub'), cvId: S('id optionnel'), objectiveId: S('id optionnel'), payload: obj('strengths, gaps, limits, recommended_focus…'), matchScore: N('0-100') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      if (!a.payload || typeof a.payload !== 'object') throw new Error('payload requis (objet).');
      const size = JSON.stringify(a.payload).length;
      if (size > 100000) throw new Error('payload trop volumineux (max 100 Ko).');
      const matchScore = Number(a.matchScore);
      if (!Number.isFinite(matchScore) || matchScore < 0 || matchScore > 100) throw new Error('matchScore doit être entre 0 et 100.');
      const r = await c.gapReports.insertOne({ userId, cvId: a.cvId ? String(a.cvId) : null, objectiveId: a.objectiveId ? String(a.objectiveId) : null, payload: a.payload, matchScore: Math.round(matchScore), createdAt: new Date() });
      return okUser(userId, { gapReportId: String(r.insertedId), matchScore: Math.round(matchScore) });
    }),
  },
  {
    name: 'get_latest_gap_report',
    description: 'Retourne le rapport de gaps le plus récent (utilisé pour le plan et la boucle recheck).',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const r = await c.gapReports.findOne({ userId }, { sort: { createdAt: -1 } });
      return okUser(userId, { report: r ? { id: String(r._id), matchScore: r.matchScore, createdAt: r.createdAt, ...r.payload } : null });
    }),
  },

  // ───────────────────────── Goals & habits ─────────────────────────
  {
    name: 'create_goal',
    description: 'Crée un goal. À appeler UNIQUEMENT après approbation explicite de l’utilisateur (SMART validé côté flux).',
    inputSchema: { type: 'object', required: ['userId', 'title', 'successMeasure'], properties: { userId: S('JWT sub'), title: S('titre'), description: S('détails'), successMeasure: S('mesure observable'), deadline: S('YYYY-MM-DD'), priority: oneOfEnum(['high', 'medium', 'low']), linkedGap: S('gap/compétence liée') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const doc = { userId, title: requireString(a.title, 'title', { max: 200 }), description: optionalString(a.description, { max: 2000 }) || '', successMeasure: requireString(a.successMeasure, 'successMeasure', { max: 300 }), deadline: optionalString(a.deadline, { max: 20 }) || null, priority: oneOf(a.priority || 'medium', ['high', 'medium', 'low'], 'priority'), linkedGap: optionalString(a.linkedGap, { max: 100 }) || null, status: 'active', createdAt: new Date(), milestones: [] };
      const r = await c.goals.insertOne(doc);
      return okUser(userId, { goalId: String(r.insertedId), title: doc.title });
    }),
  },
  {
    name: 'get_active_goals',
    description: 'Liste les goals actifs de l’utilisateur.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const goals = await c.goals.find({ userId, status: 'active' }).sort({ createdAt: -1 }).toArray();
      return okUser(userId, { goals: goals.map(({ _id, ...g }) => ({ id: String(_id), ...g })) });
    }),
  },
  {
    name: 'update_goal',
    description: 'Met à jour un goal (titre, description, deadline, priorité, status: active|paused|completed|abandoned).',
    inputSchema: { type: 'object', required: ['userId', 'goalId', 'fields'], properties: { userId: S('JWT sub'), goalId: S('id'), fields: obj('champs partiels') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const goalId = toId(requireString(a.goalId, 'goalId', { max: 64 }));
      const allowed = ['title', 'description', 'deadline', 'priority', 'status'];
      const clean = {};
      for (const k of allowed) if (a.fields?.[k] !== undefined) clean[k] = a.fields[k];
      if (clean.priority) oneOf(clean.priority, ['high', 'medium', 'low'], 'priority');
      if (clean.status) oneOf(clean.status, ['active', 'paused', 'completed', 'abandoned'], 'status');
      if (Object.keys(clean).length === 0) throw new Error('Aucun champ modifiable fourni.');
      const r = await c.goals.updateOne({ _id: goalId, userId }, { $set: { ...clean, updatedAt: new Date() } });
      if (r.matchedCount === 0) throw new Error('Goal introuvable pour cet utilisateur.');
      return okUser(userId, { updated: clean });
    }),
  },
  {
    name: 'complete_milestone',
    description: 'Marque un milestone comme complété. Si tous les milestones du goal sont faits, le goal passe en completed.',
    inputSchema: { type: 'object', required: ['userId', 'goalId', 'milestoneIndex'], properties: { userId: S('JWT sub'), goalId: S('id'), milestoneIndex: N('index 0..n-1') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const goalId = toId(requireString(a.goalId, 'goalId', { max: 64 }));
      const idx = clampInt(a.milestoneIndex, { min: 0, max: 99, fallback: -1 });
      if (idx < 0) throw new Error('milestoneIndex invalide.');
      const goal = await c.goals.findOne({ _id: goalId, userId });
      if (!goal) throw new Error('Goal introuvable.');
      const milestones = Array.isArray(goal.milestones) ? [...goal.milestones] : [];
      if (!milestones[idx]) throw new Error('milestoneIndex hors limites.');
      milestones[idx] = { ...milestones[idx], done: true, completedAt: new Date() };
      const allDone = milestones.length > 0 && milestones.every(m => m.done);
      await c.goals.updateOne({ _id: goalId, userId }, { $set: { milestones, ...(allDone ? { status: 'completed' } : {}), updatedAt: new Date() } });
      return okUser(userId, { milestoneIndex: idx, goalCompleted: allDone });
    }),
  },
  {
    name: 'get_goal_progress',
    description: 'Progression d’un goal : milestones faits / total + %.',
    inputSchema: { type: 'object', required: ['userId', 'goalId'], properties: { userId: S('JWT sub'), goalId: S('id') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const goalId = toId(requireString(a.goalId, 'goalId', { max: 64 }));
      const goal = await c.goals.findOne({ _id: goalId, userId });
      if (!goal) throw new Error('Goal introuvable.');
      const ms = Array.isArray(goal.milestones) ? goal.milestones : [];
      const done = ms.filter(m => m.done).length;
      return okUser(userId, { goalId: String(goal._id), title: goal.title, status: goal.status, done, total: ms.length, percent: ms.length ? Math.round(done / ms.length * 100) : 0 });
    }),
  },
  {
    name: 'create_habit',
    description: 'Crée une habitude à suivre (nom, fréquence daily|weekly, cible).',
    inputSchema: { type: 'object', required: ['userId', 'name'], properties: { userId: S('JWT sub'), name: S('nom'), frequency: oneOfEnum(['daily', 'weekly']), target: N('occurrences par période') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const doc = { userId, name: requireString(a.name, 'name', { max: 120 }), frequency: oneOf(a.frequency || 'daily', ['daily', 'weekly'], 'frequency'), target: clampInt(a.target ?? 1, { min: 1, max: 30, fallback: 1 }), active: true, createdAt: new Date() };
      const r = await c.habits.insertOne(doc);
      return okUser(userId, { habitId: String(r.insertedId) });
    }),
  },
  {
    name: 'get_habits',
    description: 'Liste les habitudes actives de l’utilisateur.',
    inputSchema: { type: 'object', required: ['userId'], properties: { userId: S('JWT sub') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const items = await c.habits.find({ userId, active: true }).toArray();
      return okUser(userId, { habits: items.map(({ _id, ...h }) => ({ id: String(_id), ...h })) });
    }),
  },
  {
    name: 'track_habit',
    description: 'Enregistre un check-in d’habitude pour une date (YYYY-MM-DD, défaut aujourd’hui).',
    inputSchema: { type: 'object', required: ['userId', 'habitId', 'done'], properties: { userId: S('JWT sub'), habitId: S('id'), date: S('YYYY-MM-DD'), done: B('fait ou non'), note: S('note optionnelle') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const habitId = toId(requireString(a.habitId, 'habitId', { max: 64 }));
      const habit = await c.habits.findOne({ _id: habitId, userId });
      if (!habit) throw new Error('Habitude introuvable.');
      const date = optionalString(a.date, { max: 10 }) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date doit être YYYY-MM-DD.');
      await c.habitLogs.updateOne({ userId, habitId, date }, { $set: { userId, habitId, date, done: Boolean(a.done), note: optionalString(a.note, { max: 500 }) || '', updatedAt: new Date() } }, { upsert: true });
      return okUser(userId, { date, done: Boolean(a.done) });
    }),
  },
  {
    name: 'get_habit_history',
    description: 'Historique des check-ins d’une habitude sur N jours (défaut 30).',
    inputSchema: { type: 'object', required: ['userId', 'habitId'], properties: { userId: S('JWT sub'), habitId: S('id'), periodDays: N('7-365') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const habitId = toId(requireString(a.habitId, 'habitId', { max: 64 }));
      const periodDays = clampInt(a.periodDays, { min: 7, max: 365, fallback: 30 });
      const since = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
      const logs = await c.habitLogs.find({ userId, habitId, date: { $gte: since } }).sort({ date: 1 }).toArray();
      return okUser(userId, { periodDays, logs: logs.map(({ _id, ...l }) => ({ ...l, habitId: String(l.habitId) })) });
    }),
  },
  {
    name: 'calculate_consistency',
    description: 'Taux de consistance calculé en code fixe: % de check-ins "done" sur la période (habitudes daily/weekly).',
    inputSchema: { type: 'object', required: ['userId', 'habitId'], properties: { userId: S('JWT sub'), habitId: S('id'), periodDays: N('7-365') } },
    handler: handler(async (a) => {
      const c = await connect();
      const userId = requireUserId(a);
      const habitId = toId(requireString(a.habitId, 'habitId', { max: 64 }));
      const periodDays = clampInt(a.periodDays, { min: 7, max: 365, fallback: 30 });
      const habit = await c.habits.findOne({ _id: habitId, userId });
      if (!habit) throw new Error('Habitude introuvable.');
      const since = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
      const logs = await c.habitLogs.find({ userId, habitId, date: { $gte: since } }).toArray();
      const done = logs.filter(l => l.done).length;
      const expected = habit.frequency === 'weekly' ? Math.max(1, Math.floor(periodDays / 7)) * habit.target : periodDays * habit.target;
      const rate = Math.min(100, Math.round(done / expected * 100));
      return okUser(userId, { habitId: String(habitId), frequency: habit.frequency, periodDays, doneCheckins: done, expected, consistency: rate, streak: computeStreak(logs) });
    }),
  },
];

function oneOfEnum(values) { return { type: 'string', enum: values, description: `one of: ${values.join('|')}` }; }

function computeStreak(logs) {
  const days = [...new Set(logs.filter(l => l.done).map(l => l.date))].sort().reverse();
  let streak = 0;
  let cursor = new Date().toISOString().slice(0, 10);
  for (const d of days) {
    if (d === cursor) { streak++; cursor = shiftDate(cursor, -1); } else if (d < cursor) break;
  }
  return streak;
}
const shiftDate = (d, delta) => { const dt = new Date(d); dt.setDate(dt.getDate() + delta); return dt.toISOString().slice(0, 10); };
