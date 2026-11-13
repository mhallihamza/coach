// Orchestration tools — the Supervisor calls these through MCP with unique, unambiguous names.
// Each delegation POST hits the specialist Langflow /run endpoint (S7 pattern), parses the
// /run wrapper and extracts the inner envelope. No LLM code here.

// Lit l'env paresseusement (au moment de l'appel) — l'ordre d'import des modules ne compte plus.
// Surcharge par flow : e.g. SELF_DISCOVERY_URL / SELF_DISCOVERY_TOKEN,
// avec repli sur LANGFLOW_URL + ANALYSIS_API_TOKEN (ou LANGFLOW_API_KEY).
// Le token peut être fourni avec ou sans préfixe "Bearer " — normalisé ici.
function flowConfig(flow) {
  const key = String(flow || '').toUpperCase().replace(/-/g, '_');
  const baseUrl = (process.env.LANGFLOW_URL || 'http://localhost:7860').replace(/\/$/, '');
  const url = (process.env[`${key}_URL`] || '').replace(/\/$/, '');
  const rawToken = process.env[`${key}_TOKEN`] || process.env.ANALYSIS_API_TOKEN || process.env.LANGFLOW_API_KEY || '';
  const token = rawToken ? (rawToken.toLowerCase().startsWith('bearer ') ? rawToken : `Bearer ${rawToken}`) : '';
  return { baseUrl, url, token, timeoutMs: Number(process.env.LANGFLOW_TIMEOUT_MS || 90000) };
}

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }, null, 2) }] });
const fail = (error) => ({ content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(error) }) }], isError: true });

const AGENT_CARDS = [
  { name: 'self_discovery', endpoint: 'self_discovery', description: 'Progressive onboarding: personal ambitions, current situation, strengths, difficulties, motivations, values, aspirations. Builds the user profile + tentative development areas with evidence quotes.', use_when: 'User talks about who they are, what they want, their motivations, or needs a profile started/enriched.', expected_output: 'Envelope with profile_update, hypotheses[{name, evidence, confidence}], covered_stages, next_question.', tool: 'delegate_to_self_discovery' },
  { name: 'skills_assessment', endpoint: 'skills_assessment', description: 'Evaluates a skill with practical exercises and rubrics. Scores computed server-side (Python), evidence-based.', use_when: 'User wants to be assessed on a skill (communication, leadership, critical thinking, time management, problem solving, decision making).', expected_output: 'Envelope with skill, criteria_scores[0-5 + evidence], total_score, comparison, recommendations.', tool: 'delegate_to_skills_assessment' },
  { name: 'development_planner', endpoint: 'development_planner', description: 'Turns ambitions into SMART goals and 30/60/90-day plans with verified learning resources. Nothing saved without explicit approval.', use_when: 'User wants a goal, a plan, milestones or learning resources.', expected_output: 'Envelope with goal + smart_check, or plan (plan_name, duration_days, objectives), resources, approval_required.', tool: 'delegate_to_development_planner' },
  { name: 'progress_reflection', endpoint: 'progress_reflection', description: 'Adaptive follow-up: daily check-ins, habit tracking, weekly reviews, pattern detection (≥3 occurrences).', use_when: 'User asks about progress, habits, check-ins, "why am I not progressing", or reports a missed habit.', expected_output: 'Envelope with observations (with numbers), recurring_obstacles, recommendations, next_week_focus, plan_adaptation_needed.', tool: 'delegate_to_progress_reflection' },
  { name: 'cv_gap_analysis', endpoint: 'cv_gap_analysis', description: 'Coach-style interview from a CV upload + target objective -> evidence-based gap analysis (strengths, gaps, limits, match_score 0-100).', use_when: 'User wants their CV analyzed, fit for a role, a career gap analysis, or to start toward a target role.', expected_output: 'Envelope with coverage (interview) or gap report (strengths, gaps, limits, match_score, recommended_focus, plan_handoff).', tool: 'delegate_to_cv_gap_analysis' },
  { name: 'quality_gate', endpoint: 'quality_gate', description: 'Final filter before anything reaches the user: verifies envelope validity, every claim cited, scope safety, no other-user data.', use_when: 'Always — before the final answer is delivered to the user.', expected_output: 'Envelope with verdict pass|revise|block, issues[], revised_message.', tool: 'ask_quality_gate' },
];

function extractEnvelope(text) {
  if (!text || typeof text !== 'string') return null;
  const hasStatus = (o) => o && typeof o === 'object' && 'status' in o;
  try {
    const parsed = JSON.parse(text);
    if (hasStatus(parsed)) return parsed;
  } catch { /* not direct JSON */ }
  // Fenced ```json ... ``` blocks (common LLM wrapper habit)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim());
      if (hasStatus(parsed)) return parsed;
    } catch { /* not valid fenced JSON */ }
  }
  const start = text.indexOf('{"status"');
  if (start >= 0) {
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    }
  }
  return null;
}

async function callLangflowRun(flow, inputValue, sessionId) {
  const cfg = flowConfig(flow);
  const url = cfg.url || `${cfg.baseUrl}/api/v1/run/${flow}`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (cfg.token) headers.Authorization = cfg.token;
  const body = { input_value: inputValue, input_type: 'any', output_type: 'any' };
  if (sessionId) body.session_id = sessionId;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(cfg.timeoutMs) });
  if (!res.ok) return { ok: false, error: `langflow_${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` };
  const raw = await res.text();
  let wrapper = null;
  try { wrapper = JSON.parse(raw); } catch { return { ok: true, envelope: null, raw_text: raw.slice(0, 2000) }; }
  // 1.7 shapes: ChatOutput → results.message.text ; TextOutput → results.text.data.text
  let text = null;
  try { text = wrapper?.outputs?.[0]?.outputs?.[0]?.results?.message?.text ?? null; } catch { text = null; }
  if (!text) {
    try {
      const results = wrapper?.outputs?.[0]?.outputs?.[0]?.results || {};
      for (const v of Object.values(results)) {
        const t = v?.data?.text ?? v?.text ?? v?.message?.text;
        if (typeof t === 'string' && t.trim()) { text = t; break; }
      }
    } catch { text = null; }
  }
  const envelope = extractEnvelope(text ?? raw);
  return { ok: true, envelope: envelope || null, raw_text: (text || raw).slice(0, 4000) };
}

const S = (d, t = 'string') => ({ type: t, description: d });

export const tools = [
  {
    name: 'list_agent_cards',
    description: 'Returns the Evolve agent cards (name, endpoint, description, when to call, expected output, tool name). Use once per request if unsure which specialist fits.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ok({ agents: AGENT_CARDS, registry_note: 'Evolve built-in registry. Unregistered specialist = refused.' }),
  },
  ...AGENT_CARDS.map(card => ({
    name: card.tool,
    description: `${card.name} — ${card.description} USE WHEN: ${card.use_when} Returns: ${card.expected_output}`,
    inputSchema: {
      type: 'object',
      required: ['input_value'],
      properties: {
        input_value: S('Message in 3 lines: TASK: <goal> | REFERENCE: REQ-<id or none> | CONTEXT: <authorized_context JSON + dependent results>'),
        session_id: S('Optional session id (conversation continuity)'),
      },
    },
    handler: async (args) => {
      const inputValue = args?.input_value;
      if (!inputValue || typeof inputValue !== 'string' || inputValue.trim().length < 2) {
        return fail('input_value manquant (TASK/REFERENCE/CONTEXT requis).');
      }
      try {
        const r = await callLangflowRun(card.endpoint, inputValue, args?.session_id);
        if (!r.ok) return fail(r.error);
        if (!r.envelope) return ok({ agent: card.name, envelope: null, raw_text: r.raw_text, note: 'Réponse reçue mais enveloppe non parsable — à vérifier par l’agent.' });
        return ok({ agent: card.name, envelope: r.envelope });
      } catch (e) {
        return fail(`${card.tool} a échoué: ${e?.message || e}`);
      }
    },
  })),
];
