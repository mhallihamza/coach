import { MongoClient, ObjectId } from 'mongodb';
import dns from 'node:dns';
import { readFileSync, existsSync } from 'node:fs';

// Charge .env manuellement (dotenv affiche un bandeau sur stdout — fatal pour un serveur MCP stdio).
// Hydrate process.env depuis .env (sans écraser les variables déjà définies du processus).
function loadEnv() {
  try {
    if (existsSync('.env')) {
      const raw = readFileSync('.env', 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i <= 0) continue;
        const key = t.slice(0, i).trim();
        let value = t.slice(i + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    }
  } catch { /* ignore .env parse errors — fall back to process env / defaults */ }
  return process.env.MONGODB_URI;
}

const uri = loadEnv();
if (!uri) {
  console.error('MONGODB_URI manquant. Copier .env.example vers .env et renseigner la connexion.');
  process.exit(1);
}

let client = new MongoClient(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 8000 });
let db;

export const collections = {};

export async function connect() {
  if (db) return collections;
  try {
    await client.connect();
  } catch (err) {
    // Le DNS local refuse parfois les requêtes SRV de Node (c-ares). Repli sur des résolveurs publics.
    const msg = String(err?.message || err);
    if (/querySrv|ENOTFOUND|ECONNREFUSED|ETIMEOUT/i.test(msg)) {
      console.error('DNS par défaut refusé pour mongodb+srv — repli sur 8.8.8.8 / 1.1.1.1');
      try { await client.close(); } catch {}
      dns.setServers(['8.8.8.8', '1.1.1.1', '208.67.222.222']);
      client = new MongoClient(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 });
      await client.connect();
    } else {
      throw err;
    }
  }
  db = client.db('coach'); // قاعدة البيانات: coach
  Object.assign(collections, {
    users: db.collection('users'),
    profiles: db.collection('user_profiles'),
    consents: db.collection('consents'),
    cvs: db.collection('cvs'),
    cvChunks: db.collection('cv_chunks'),
    certifications: db.collection('certifications'),
    careerObjectives: db.collection('career_objectives'),
    assessments: db.collection('assessments'),
    gapReports: db.collection('gap_reports'),
    goals: db.collection('goals'),
    milestones: db.collection('milestones'),
    habits: db.collection('habits'),
    habitLogs: db.collection('habit_logs'),
    memories: db.collection('memories'),
    books: db.collection('books'),
    bookChunks: db.collection('book_chunks'),
    learningResources: db.collection('learning_resources'),
    reports: db.collection('reports'),
    agentExecutions: db.collection('agent_executions'),
  });
  await ensureIndexes(collections);
  return collections;
}

async function ensureIndexes({ users, profiles, cvs, cvChunks, assessments, goals, habits, habitLogs, memories, bookChunks, learningResources, agentExecutions, gapReports, certifications }) {
  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true, sparse: true }),
    profiles.createIndex({ userId: 1 }, { unique: true }),
    cvs.createIndex({ userId: 1, createdAt: -1 }),
    cvChunks.createIndex({ text: 'text' }),
    cvChunks.createIndex({ userId: 1, cvId: 1 }),
    certifications.createIndex({ userId: 1 }),
    assessments.createIndex({ userId: 1, createdAt: -1 }),
    gapReports.createIndex({ userId: 1, createdAt: -1 }),
    goals.createIndex({ userId: 1, status: 1 }),
    habits.createIndex({ userId: 1 }),
    habitLogs.createIndex({ userId: 1, habitId: 1, date: 1 }),
    memories.createIndex({ content: 'text', tags: 'text' }),
    memories.createIndex({ userId: 1, createdAt: -1 }),
    bookChunks.createIndex({ text: 'text' }),
    learningResources.createIndex({ title: 'text', description: 'text', skills: 'text' }),
    agentExecutions.createIndex({ userId: 1, createdAt: -1 }),
  ]);
}

export function isValidId(id) {
  return typeof id === 'string' && (ObjectId.isValid(id) || id.length > 0);
}

export function toId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

export async function close() {
  await client.close();
  db = undefined;
}
