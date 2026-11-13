// Utilitaires partagés : validation stricte des arguments.
// Règle d'or : userId vient TOUJOURS du contexte autorisé (backend → gateway → MCP),
// jamais d'un argument librement écrit par le modèle dans Langflow.

export function requireUserId(args) {
  const userId = args?.userId;
  if (!userId || typeof userId !== 'string' || userId.trim().length < 2) {
    throw new Error('userId manquant ou invalide. Il doit être injecté par le contexte autorisé, jamais choisi par le modèle.');
  }
  return userId.trim();
}

export function requireString(value, field, { max = 10000 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Champ requis manquant: ${field}`);
  }
  return value.trim().slice(0, max);
}

export function optionalString(value, { max = 10000 } = {}) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Chaîne attendue');
  return value.trim().slice(0, max);
}

export function clampInt(value, { min = 1, max = 50, fallback = 10 } = {}) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} doit être l'un de: ${allowed.join(', ')}`);
  }
  return value;
}

// Score de compétence : chaque critère 0..5. Le total est calculé ici (code fixe), jamais par le LLM.
export function validateCriteriaScores(criteriaScores) {
  if (!Array.isArray(criteriaScores) || criteriaScores.length === 0) {
    throw new Error('criteriaScores doit être une liste non vide');
  }
  return criteriaScores.map((c, i) => {
    const criterion = requireString(c?.criterion, `criteriaScores[${i}].criterion`, { max: 120 });
    const score = Number(c?.score);
    if (!Number.isFinite(score) || score < 0 || score > 5) {
      throw new Error(`Score hors bornes (0-5) pour "${criterion}": ${c?.score}`);
    }
    const evidence = requireString(c?.evidence, `criteriaScores[${i}].evidence`, { max: 2000 });
    return { criterion, score: Math.round(score * 10) / 10, evidence };
  });
}

export function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }, null, 2) }] };
}

export function fail(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(message) }) }], isError: true };
}

export function handler(fn) {
  return async (args) => {
    try {
      return await fn(args ?? {});
    } catch (err) {
      return fail(err?.message || err);
    }
  };
}
