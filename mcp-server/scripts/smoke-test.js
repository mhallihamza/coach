// Smoke test : exécute les outils de bout en bout avec l'utilisateur démo.
// Usage: npm test
import { connect, close } from '../src/db.js';
import { tools as accountCvTools } from '../src/tools-account-cv.js';
import { tools as coachingTools } from '../src/tools-coaching.js';
import { tools as memoryBooksTools } from '../src/tools-memory-books.js';

const all = [...accountCvTools, ...coachingTools, ...memoryBooksTools];
const call = async (name, args) => {
  const t = all.find(t => t.name === name);
  if (!t) throw new Error('outil inconnu: ' + name);
  const res = await t.handler(args);
  const text = res?.content?.[0]?.text ?? '{}';
  if (res?.isError) throw new Error(`${name} → ${text}`);
  return JSON.parse(text);
};

const U = 'demo-user';
const log = (label, obj) => console.log('\n▶ ' + label, JSON.stringify(obj).slice(0, 300));

await connect();
console.log('Connecté à MongoDB (db=coach) —', all.length, 'outils chargés.\n');

log('health_check', await call('health_check', {}));

log('create_user', await call('create_user', { userId: U, email: 'demo@example.com', fullName: 'Utilisateur Démo', language: 'fr' }));
log('update_user_profile', await call('update_user_profile', { userId: U, fields: { coachingStyle: 'supportive', bio: 'Profil de démonstration' } }));
log('set_consent', await call('set_consent', { userId: U, consentType: 'longTermMemory', granted: true }));
log('get_user_profile', await call('get_user_profile', { userId: U }));

const cv = await call('save_cv', { userId: U, fileName: 'cv-demo.pdf', parsedText: 'Ahmed — Marketing digital 3 ans. Excel avancé. Python bases (cours Udemy). Campagnes mesurées +15% ventes. Objectif: Data Scientist.', language: 'fr' });
log('save_cv', cv);
log('search_cv', await call('search_cv', { userId: U, query: 'Python Excel campagnes', limit: 3 }));
log('save_certification', await call('save_certification', { userId: U, name: 'Google Data Analytics', issuer: 'Coursera', date: '2026-03', skills: ['sql', 'spreadsheet', 'data'] }));
log('save_career_objective', await call('save_career_objective', { userId: U, targetRole: 'Data Scientist', horizonMonths: 12, weeklyHours: 5, motivation: 'Fasciné par les insights des données de mes campagnes' }));

const assess = await call('save_assessment', { userId: U, skill: 'communication', criteriaScores: [ { criterion: 'clarté', score: 4, evidence: 'explication structurée avec chiffres' }, { criterion: 'concision', score: 3, evidence: 'réponse complète mais longue' } ], confidence: 0.6 });
log('save_assessment', assess);
log('get_assessment_history', await call('get_assessment_history', { userId: U, skill: 'communication' }));

log('save_gap_report', await call('save_gap_report', { userId: U, cvId: cv.cvId, payload: { strengths: ['Excel avancé'], gaps: [{ skill: 'SQL', current_level: 0, required_level: 4, evidence: 'aucune mention dans le CV ni réponses', priority: 'high' }], limits: [{ type: 'internal', description: 'peur du retard vs diplômés', evidence: 'réponse interview', severity: 'high' }], recommended_focus: ['SQL', 'Python data', 'portfolio'] }, matchScore: 46 }));
log('get_latest_gap_report', await call('get_latest_gap_report', { userId: U }));

const goal = await call('create_goal', { userId: U, title: 'Maîtriser SQL (SELECT/JOIN)', description: 'Prépa entretien data', successMeasure: 'Écrire 20 requêtes correctes sur la base Northwind', deadline: '2027-01-15', priority: 'high', linkedGap: 'SQL' });
log('create_goal', goal);
log('get_active_goals', await call('get_active_goals', { userId: U }));

const habit = await call('create_habit', { userId: U, name: 'Pratiquer SQL 20 min', frequency: 'daily', target: 1 });
log('create_habit', habit);
const today = new Date().toISOString().slice(0, 10);
log('track_habit', await call('track_habit', { userId: U, habitId: habit.habitId, date: today, done: true }));
log('calculate_consistency', await call('calculate_consistency', { userId: U, habitId: habit.habitId, periodDays: 30 }));

log('save_memory', await call('save_memory', { userId: U, type: 'interview_answer', content: 'A peur d’être en retard par rapport aux diplômés en data science', sourceType: 'interview', sourceId: 'session-1', tags: ['peur', 'limit'], evidence: 'réponse directe à Q: qu’est-ce qui t’a arrêté ?' }));
log('search_memories', await call('search_memories', { userId: U, query: 'peur retard', limit: 3 }));

log('search_books', await call('search_books', { query: 'procrastination planifier', limit: 3 }));
log('search_learning_resources', await call('search_learning_resources', { query: 'sql data', limit: 3 }));

log('save_report', await call('save_report', { userId: U, type: 'weekly_review', title: 'Revue semaine 1 (démo)', payload: { observations: ['1 check-in habitude effectué'], next_week_focus: 'SQL chaque matin' } }));
log('list_reports', await call('list_reports', { userId: U, limit: 3 }));

log('log_agent_execution', await call('log_agent_execution', { userId: U, flowName: 'CV_Gap_Analysis', taskId: 'task-smoke-1', tools: ['search_cv', 'save_assessment'], status: 'ok', durationMs: 1234 }));
log('health_check (final)', await call('health_check', {}));

console.log('\n✅ Smoke test terminé sans erreur.');
await close();
