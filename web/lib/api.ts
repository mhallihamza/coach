// Client API — toute communication avec le backend FastAPI passe par ici.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001';
const KEY = 'evolve_token';

export type User = { userId: string; email: string; fullName: string; language: string };
export type AuthResponse = { token: string; user: User };

export function getToken() { if (typeof window === 'undefined') return null; return localStorage.getItem(KEY); }
export function setToken(t: string) { localStorage.setItem(KEY, t); }
export function clearToken() { localStorage.removeItem(KEY); }

async function req<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
  if (auth) {
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' });
  if (res.status === 401 && auth) { clearToken(); if (typeof window !== 'undefined') window.location.href = '/auth'; throw new Error('Session expirée'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Erreur ${res.status}`);
  return data as T;
}

export const signup = (email: string, password: string, fullName: string, language = 'fr') =>
  req<AuthResponse>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, fullName, language }) }, false);

export const login = (email: string, password: string) =>
  req<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);

export const getMe = () => req<{ user: User }>('/api/me');

export const getDashboard = () => req<DashboardData>('/api/dashboard');

export type DashboardData = {
  goals: { id: string; title: string; priority?: string; deadline?: string | null; successMeasure?: string }[];
  habits: { id: string; name: string; consistency: number }[];
  latestAssessment: { skill: string; totalScore: number; maxScore: number; createdAt: string } | null;
  matchScore: number | null;
  objective: { targetRole: string; horizonMonths: number; weeklyHours: number; motivation?: string } | null;
};

export const listGoals = () => req<{ goals: { id: string; title: string; status: string; deadline?: string | null; priority?: string; milestonesDone: number; milestonesTotal: number; successMeasure?: string }[] }>('/api/goals');

export type ChatResponse = { conversationId: string; reply: string; next_action: string; source: string; langflow: boolean };
export const sendChat = (message: string, conversationId?: string) =>
  req<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) });

export const getHistory = (conversationId: string) =>
  req<{ messages: { role: string; content: string; createdAt: string }[] }>(`/api/chat/${conversationId}`);

// CV upload (multipart → backend → LangGraph CV service)
export async function uploadCv(file: File, language = 'fr'): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('file', file);
  form.append('language', language);
  const t = getToken();
  const res = await fetch(`${BASE}/api/career/cv`, { method: 'POST', body: form, headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (res.status === 401) { clearToken(); if (typeof window !== 'undefined') window.location.href = '/auth'; throw new Error('Session expirée'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Erreur ${res.status}`);
  return data as Record<string, unknown>;
}


// Rapport de développement (gap report → affiché dans /dashboard/rapport + PDF)
export type GapReportItem = string | { text?: string; title?: string; label?: string; name?: string; gap?: string; strength?: string; limit?: string; skill?: string; evidence?: string; source?: string; excerpt?: string; quote?: string; [k: string]: unknown };

export interface GapReportResponse {
  has_report: boolean;
  id?: string;
  createdAt?: string | null;
  matchScore?: number | null;
  cvId?: string | null;
  objective: { targetRole?: string; horizonMonths?: number; weeklyHours?: number; motivation?: string } | null;
  strengths?: GapReportItem[];
  gaps?: GapReportItem[];
  limits?: GapReportItem[];
  recommended_focus?: string | null;
  raw_payload?: Record<string, unknown>;
}

export const getGapReport = () => req<GapReportResponse>('/api/reports/gap');

export async function downloadGapPdf(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/api/reports/gap/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401) { clearToken(); if (typeof window !== 'undefined') window.location.href = '/auth'; throw new Error('Session expirée'); }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail ?? `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const match = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/);
  a.download = match?.[1] ?? 'Evolve_Rapport.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
