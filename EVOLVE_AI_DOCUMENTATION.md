# Evolve AI — Complete Documentation (Technology & Business)

**Version** 1.1 · **Date** 13 November 2026 · **Status** Beta — local stack fully working; staging agentic pipeline wired via env and verified (staging edge is intermittently slow/504)
**Audience** founders, engineering, product, investors, partners · **Language** English
**Companion docs**: `CLAUDE.md` (AI-operator context) · `PROJECT_DOCUMENTATION.md` (French engineering log) · `README.md` (quick start)

> **Secret policy**: this document contains **no credentials**. All secrets live in `.env` files (git-ignored). Every token/key mentioned below is a placeholder.

---

# Part I — Business

## 1. Executive summary

**Evolve AI is an AI personal-development coach** that combines a clinically-inspired interview style with an evidence-first methodology: it understands the user through conversation (not quizzes), documents findings with proof (the user's own words, CV, or measured data), builds SMART 30/60/90-day plans, and re-measures monthly.

- Mandatory account; **CV upload optional** — the coach interviews instead.
- Every claim is **evidence-cited**; no diagnosis, no permanent labels, no invented resources.
- Runs as a product: Next.js frontend + FastAPI backend + MongoDB, with an agentic AI layer (Langflow flows + one MCP tool server + a LangGraph supervisor) that mirrors the architecture of the proven **S7 / Arwaj** microfinance credit-analysis system.
- Distribution wedge: individuals in career/personal transition first, then B2B coaching-at-scale.

## 2. The problem

Personal development content is everywhere; personal development *outcomes* are rare.

1. **Generic plans that don't stick.** Templates and 90-day plans ignore context, motivation and constraints; adherence collapses within weeks.
2. **Quizzes masquerading as insight.** "You are 73% introverted" is a verdict without evidence, and a label users can't act on.
3. **No follow-through.** Nothing re-measures progress, detects "week 3 abandonment" patterns, or adapts the plan.
4. **Privacy anxiety.** People won't share psychological data with a product they don't trust — and rightly: health-adjacent data is the most abusable class of data.
5. **Expensive human alternatives.** A human coach costs 50–300+ per session — accessible to executives, not to the median worker.

## 3. The solution — the Evolve method

| Step | What the product does | What it refuses to do |
|---|---|---|
| **Understand** | One question at a time, coach-style; interviews goals, situation, strengths, blockers, motivations, values | Multi-page forms; verdicts ("you are an X person") |
| **Document** | Every observation cites evidence — the user's words, quotes, measured scores | Unverifiable claims; horoscope language |
| **Plan** | SMART goals, 30/60/90-day milestones, resources only from verified libraries | Invented courses/links/books; one-size plans |
| **Follow** | Daily check-ins, weekly reviews, monthly re-scoring (0–100), pattern detection (≥3 occurrences), plan adaptation | Guilt-trip streak mechanics; dark-pattern reminders |

### Product modules

| Module | User-visible value |
|---|---|
| **Self-Discovery interview** | Progressive onboarding — who you are, what you want, what blocks you; builds your profile with evidence quotes |
| **Skills assessment** | Evaluate 6 core skills (communication, leadership, critical thinking, time management, problem solving, decision making) with exercises + server-computed 0–5 rubrics |
| **Development planner** | Turns ambitions into SMART goals and 30/60/90 plans; nothing saved without explicit user approval |
| **Progress & reflection** | Habit tracking, check-ins, weekly review, pattern detection, plan adaptation |
| **CV gap analysis** | Upload your CV, say where you want to go → evidence-based gap report (strengths, gaps, match score 0–100) |
| **Coach chat** | The conversational front door — free conversation grounded in your profile and memory |
| **Knowledge library** | 5 curated psychology reference books, cited when relevant (provenance attached) |
| **Dashboard** | KPIs (readiness, goals, consistency, last score), limits identified, this week's focus |
| **Privacy & consent** | Granular consents (memory, CV analysis, PDF reports, weekly email, marketing); one-click data wipe |

## 4. Differentiation

1. **Evidence-first, not verdict-first.** Every line of a report traces to a quote or a measurement. This is a *product promise* and an architectural constraint (Quality Gate agent enforces it on every answer).
2. **Honest failure.** If evidence is insufficient, the coach says so — it never fabricates. (Sufficiency levels: `enough ≥ 3 occurrences · partial ≥ 1 · insufficient otherwise`.)
3. **Privacy by design.** `user_id` flows from the JWT into an *authorized context*; LLMs never choose it; data stays in the user's isolated scope; right-to-erasure cascades everywhere (CV → chunks → derived memories).
4. **Human-in-the-loop persistence.** Goals, reports, memory are written only after explicit user approval — trust is structural, not policy-deep.
5. **The S7 heritage.** Built on the reference architecture of Arwaj/S7 (production credit-analysis AI for microfinance): agent cards, A2A delegation, MCP tools, envelope contracts, quality gates. The team has shipped this pattern with real users.

**Moat (honest assessment):** the moat is the *methodology + evaluation discipline* (evidence rules, ≥3-occurrence patterns, human approval gates, psychological-safety guardrails) and the accumulated, consented user memory — not the LLM itself, which is a commodity (OpenRouter/DeepSeek/Mistral).

## 5. Target segments & personas

**B2C — primary launch wedge**
- **The career transitioner** (25–40): "I'm a senior dev, my manager doesn't back me, do I leave?" Needs clarity + a plan + evidence.
- **The blocked achiever**: talented, inconsistent execution (procrastination, burnout signals, scattered goals). Needs structure and re-measurement.
- **The confidence rebuilder**: coming back to work (parental leave, layoff, immigration). Needs interview-style support and a trajectory.

**B2B — expansion motion**
- **Engineering/Product orgs (50–500 FTE)**: team gap analysis, coaching at scale, RH-readable PDF exports.
- **Outplacement & career services**: white-labeled gap reports and plans.
- **Coaching institutes / universities**: supervised AI practice for student coaches.

**Not a fit:** clinical mental-health treatment. Evolve detects distress signals and redirects to professionals; it never diagnoses. (This is enforced in the prompts and by the Quality Gate; see Part II §8.)

## 6. Market context (indicative, not audited)

- Global personal-development and life-coaching spend is a multi-billion-dollar category; AI coaching apps are among the fastest-growing consumer AI segments since 2023–2026.
- Corporate coaching/L&D budgets are shifting from episodic human sessions toward always-on AI programs (cost per seat drops ~10x; measurement becomes continuous).
- Morocco/MENA note: French- and Arabic-first AI coaching is under-served; Morocco's Law 09-08 (CNDP) makes privacy-first design a *market-access* advantage, not just ethics.

*(Figures are directional industry estimates; a formal TAM/SAM/SOM study is a roadmap item before fundraising.)*

## 7. Business model

Three tiers are presented on the landing page (**Découverte / Pro / Équipes** — final pricing to be set before GA):

| Tier | Positioning | Indicative logic |
|---|---|---|
| **Découverte** | Free forever-light | Conversation + basic dashboard; capped memory; no CV gap report |
| **Pro** (subscription) | Individual coach at the price of a coffee subscription | Full modules: assessments, plans, monthly re-scores, gap reports, PDF export, unlimited memory |
| **Équipes** (B2B) | Per-seat licensing with RH console | Team gap heatmaps, cohort programs, admin exports, DPA/CNDP paperwork |

**Revenue model:** subscription (B2C Pro) + per-seat B2B contracts + (later) coach-institute tooling licenses.
**Cost model:** LLM tokens (dominant variable cost, currently DeepSeek via OpenRouter at ~zero-margin pricing tiers — watch unit economics), MongoDB Atlas, hosting, support.
**Illustrative unit economics (assumptions, not audited):** if Pro is ~€20–30/mo and average session cost is ~€0.02–0.08 (Flash-class models, caching), gross margin is healthy (>80%); the risk is support cost and churn, not inference.

## 8. Go-to-market

1. **Founder-led beta (now → 90 days):** 100 private users from the network; weekly feedback loops; activation = first interview + first saved goal.
2. **Content wedge:** the methodology *is* the content — public posts/notes on evidence-based self-coaching (FR + AR + EN), build the audience before the app.
3. **Coaching-institute partnerships:** pilot with 1–2 institutes; coaches supervise AI output (human-in-the-loop), they become evangelists.
4. **B2B pilot (quarter 2):** one engineering org, 20–50 seats, before/after gap measurement; publish a case study.
5. **SEO/ASO:** "bilan de compétences IA", "AI career coach", "coach développement personnel IA" etc.

## 9. Success metrics (North Star + funnel)

**North Star Metric:** *Weekly active users with an approved development goal + ≥1 logged check-in* (engagement with intent, not vanity chatting).

| Stage | Metric | Target (first 6 months, indicative) |
|---|---|---|
| Acquisition | Signup → first message | > 60% |
| Activation | First approved goal created | > 30% of signups |
| Engagement | W1 retention / W4 retention | > 35% / > 15% |
| Outcome | Self-reported goal progress at day 30 | > 50% report progress |
| Quality | Quality Gate block rate on safety issues | 100% caught |
| Trust | Data-deletion requests honored < 24h | 100% |
| Economics (B2B) | Seat gross margin | > 75% |

## 10. Roadmap — product

**Now (beta):** local stack verified; staging agentic pipeline env-driven & live; flows verified on staging (200s, intermittent edge 504s); psy knowledge library ingested (16,704 chunks, 5 books).
**+30 days:** import flows to local/staging UI; run the 15 evals in `langflow/EVALS.md`; polish Arabic UX; vector search for books.
**+90 days:** closed beta (100 users); weekly email opt-in; PDF reports; full French/Arabic localization QA; public launch of Pro tier.
**+6 months:** B2B pilot; coach-institute licensing; mobile PWA; GDPR/CNDP attestation; SOC2-ish audit trail.

## 11. Business risks & mitigations

| Risk | Mitigation (built-in) |
|---|---|
| AI says something harmful to a vulnerable user | Quality Gate agent blocks out-of-scope; prompts redirect to professionals; no diagnosis ever |
| Hallucinated book citations | RAG answers only from retrieval; `insufficient` reported honestly; provenance attached |
| Privacy breach of psychological data | user_id isolation, consent granularity, one-click wipe, no secrets in repo, Atlas scoped user (roadmap) |
| LLM price/provider volatility | OpenRouter abstraction; model swappable via env (`OPENROUTER_MODEL`); local Langflow fallback; demo-coach floor |
| Copycat clones | Methodology + evaluation discipline + consented memory data are the moat; brand as "evidence-first coach" |
| Regulatory (GDPR, Law 09-08) | Data residency choice (EU Atlas region), DPA templates, CNDP-compliant consent flow (already granular) |
| Single-founder/bus-factor | Docs (this file, CLAUDE.md), runbooks, S7 reference architecture shared with a second engineer |

## 12. Team & organization

Original delivery plan (~10 contributors, briefs in `Downloads/evolve-ai-workflow-briefs/`):
Supervisor+A2A · Self_Discovery · Skills_Assessment · Development_Planner · Progress_Reflection · CV_Gap_Analysis · Quality_Gate · backend+MCP · frontend.
Realistically, **2–3 people can now operate the whole system** because the operational surface is env-driven (one `.env` per service) and health-checkable.

---

# Part II — Technology

## 13. Architecture at a glance

```
 User → Next.js web :3000
          │  HTTPS + JWT (signup mandatory, CV optional)
          ▼
     FastAPI backend :8001 ──► MongoDB Atlas (db `coach`)   ← backend talks to Mongo DIRECTLY (never via MCP)
          │  │
          │  └─ POST /api/career/cv (multipart) ──► coach-cv-service :8300 (LangGraph)
          │                                        ingest: parse→clean→chunk→store · retrieve: reformulate→$text
          ▼
   Chat routing (per-flow env, see §17)
          │
          ├──(1) Agentic pipeline on staging: POST {FLOW_URL}  stg-agentic.abafusion.ai/api/v1/run/<slug>
          │        • Supervisor flow (OpenRouter deepseek-v4-flash, temp 0.1, agent-card registry)
          │        • Delegates via MCP Tools → coach-mcp (stateless HTTP :8310/mcp or stdio)
          ├──(2) LangGraph supervisor :8020 (self-hosted A2A)
          │        parse → fan-out specialists (parallel HTTP) → LLM synthesize → quality_gate
          └──(3) Local Langflow :7860 or built-in demo coach — graceful fallbacks

   MCP server `coach-mcp` (45 tools, stdio + StreamableHTTP :8310) ← ALL Langflow agents
          │ pymongo                                    │ HTTP proxy
          ▼                                           ▼
   MongoDB Atlas `coach`                     coach-cv-service :8300 (facts for CVs)

   AstraDB (default_keyspace.coach) — 16,704 chunks, 5 psychology PDFs, NV-EmbedQA-e5-v5 1024-dim cosine
          ▲ used by Knowledge_RAG flow
```

## 14. Component catalog

| Component | Port | Stack | Responsibility | Status |
|---|---|---|---|---|
| **web/** | 3000 | Next.js 15.5, TS, CSS-only design system | Landing, auth, dashboard, chat, goals, career (CV), settings/consents | ✅ builds & serves |
| **backend/** | 8001 | FastAPI, pymongo, PyJWT (pbkdf2_sha256) | Auth, dashboard aggregation, chat orchestration, CV proxy, `/api/health` | ✅ E2E tested |
| **coach-cv-service/** | 8300 | FastAPI + LangGraph | CV ingest/retrieve/delete (cascade) — deterministic parsers, no LLM reads CVs | ✅ E2E tested |
| **mcp-server/** | stdio + 8310 | Node, @modelcontextprotocol/sdk | Single MCP for all agents — 45 tools: profile, consent, CV proxy, assessments, goals, habits, memory ($text), psy books, resources, reports, **A2A orchestration** (`list_agent_cards`, `delegate_to_*`, `ask_quality_gate`) | ✅ 45 tools, verify-stdio/http green |
| **langgraph-supervisor/** | 8020 | FastAPI + LangGraph | Self-hosted A2A: intent → parallel specialist fan-out (staging `/run`) → LLM synthesis → quality gate | ✅ live, `/health` per-flow config |
| **langflow/*.json** | 7860 (local) / staging UI | Langflow 1.7 | 9 flows: Supervisor + 6 specialists + Knowledge_RAG + Knowledge_Ingest | ✅ 200 on staging; structural validation; import to UI pending |
| **MongoDB Atlas** | — | Mongo (cluster0.f4idzbv.mongodb.net, db `coach`) | System of record | ✅ indexed, seeded demo data |
| **AstraDB** | — | DataStax Astra (default_keyspace.coach) | Psychology reference library | ✅ ingested 5 PDFs |
| **OpenRouter** | — | deepseek/deepseek-v4-flash (configurable) | LLMs for flows and synthesis | ✅ key live in staging Global Variables |
| **Staging** | 443 | `stg-agentic.abafusion.ai` | Cloudflare-fronted Langflow 1.7 | ⚠️ reachable; intermittent 504 |

## 15. Data model (MongoDB `coach`)

`users` (email sparse unique) · `user_profiles` · `consents` · `cvs` (**fileBinary** + parsedText + metadata) · `cv_chunks` (`$text`) · `certifications` · `career_objectives` · `assessments` (scores 0–5, totals computed in code) · `gap_reports` (match_score 0–100, code-computed) · `goals` · `milestones` · `habits` · `habit_logs` · `memories` (`$text`) · `books` · `book_chunks` (`$text`) · `learning_resources` (`$text`) · `reports` · `agent_executions` (audit).

**Access pattern:** every query filters by `userId` (application-enforced row-level security); indexes on `userId` everywhere; `$text` for retrieval; Atlas Atlas-scoped dedicated user recommended (roadmap).

**AstraDB:** `default_keyspace.coach` — NV-EmbedQA-e5-v5 embeddings (1024 dims, cosine), ~16,704 chunks from `intro_psycho_soc_t1`, `jodelet_psycho_sociale`, `Nahoum — La entrevista psicológica`, `Principles-of-Social-Psychology`, `Psychology2e`. Managed **inside** AstraDB (no external embedding key needed).

## 16. AI architecture — how a request flows

### 16.1 Inbound chat (happy path)
1. Web `POST /api/chat` (JWT) → backend builds **authorized context** `{user_id, conversation_id, language, coaching_style, consent_flags, email, fullName}`.
2. Backend picks pipeline (§17) and POSTs `{input_value: JSON.stringify({authorized_context, user_message})}` to the chosen URL, with `Authorization: Bearer <per-flow or shared token>`.
3. Langflow **Supervisor** (deepseek-v4-flash, temp 0.1, agent-card registry embedded in prompt) decides: small talk (reply itself) or delegate.
4. Delegation via **MCP Tools node** → `delegate_to_<specialist>` → MCP POSTs to `…/run/<slug>` with 3-line `TASK / REFERENCE / CONTEXT` envelope → specialist runs → envelope `{status, result, evidence, confidence, next_action, message_to_user}` returned.
5. Supervisor synthesizes → **Quality Gate** (`ask_quality_gate`) verifies evidence/scope/envelope → final answer → backend stores `conversations/messages` → UI renders.

### 16.2 The specialists

| Flow | Trick up its sleeve |
|---|---|
| Self_Discovery | Progressive onboarding; budgets per stage; never re-asks what you already know |
| Skills_Assessment | Rubric 0–5 per criterion; **total computed server-side**, never by LLM |
| Development_Planner | SMART validation code-side; resources **only** from `search_learning_resources`; approval-gated persistence |
| Progress_Reflection | Streak/consistency via code (`calculate_consistency`); pattern needs **≥3 occurrences** |
| CV_Gap_Analysis | Coach interview (10–20 turns, prompt-enforced) → gap report with match_score from code |
| Quality_Gate | `pass | revise | block`; verifies citations against `search_memories`; blocks diagnostic language |
| Knowledge_RAG | Agentic RAG on AstraDB: research → sufficiency judge → SmartRouter → rewrite loop — no self-answering |

### 16.3 Rules every agent obeys (the product spec)
Hypotheses-not-verdicts · evidence-first · ≥3-occurrence patterns · no inventory of invented resources · writes need explicit approval · capabilities computed, not guessed · language = user's language (FR default, AR/EN) · prompts in English, answers in user language.

## 17. Configuration — env-driven workflows (this is deliberate)

**Every** workflow URL and token is read from `.env`. Resolution order per workflow:

```
<SLUG>_URL / <SLUG>_TOKEN     (e.g. SELF_DISCOVERY_TOKEN)   → per-flow override
        │ unset?
        ▼
shared ANALYSIS_API_TOKEN / AGENTIC_TOKEN  (+ ANALYSIS_API_URL or STG_BASE)
        │ unset?
        ▼
local LANGFLOW_URL + LANGFLOW_FLOW_ID (Langflow on 7860)
        │ unset?
        ▼
built-in empathetic demo coach  (the product never dead-ends)
```

**Where the resolver lives (same contract in 3 codebases):**

| Codebase | Env keys | Resolver |
|---|---|---|
| `backend/app/config.py` + `main.py (ask_flow)` | `*_URL`, `*_TOKEN`, `ANALYSIS_*`, `LANGFLOW_*` | `flow_url() / flow_token()` |
| `mcp-server/src/orchestration.js` | `LANGFLOW_URL`, per-flow `<SLUG>_URL/TOKEN`, `ANALYSIS_API_TOKEN` | `flowConfig()` |
| `langgraph-supervisor/app/main.py` | `STG_BASE` (base fallback), per-flow `<SLUG>_URL`/`<SLUG>_TOKEN` (named — all set) | `flow_url() / flow_token() / headers_for()` |

**Token normalization:** `Bearer ` prefix optional everywhere — added if missing.
**Observability:** LangGraph supervisor `GET /health` shows each flow's URL and token **presence** (booleans only) — no secrets ever logged or printed.
**Today:** every workflow carries its own **named** jeton entry (`SELF_DISCOVERY_TOKEN`, `SKILLS_ASSESSMENT_TOKEN`, …) — all identical today, with the legacy shared `AGENTIC_TOKEN`/`ANALYSIS_API_TOKEN` deliberately commented out so there is one source of truth per workflow. To change a single workflow later: edit its named line, restart the service — done. The identical value means you can rotate them one at a time without touching the others.

## 18. APIs (backend, `:8001`)

| Endpoint | Description |
|---|---|
| `POST /api/auth/signup` · `POST /api/auth/login` | Account (pbkdf2, JWT 30d) |
| `GET /api/me` · `GET /api/dashboard` | Profile · aggregated KPIs |
| `GET /api/goals` · `GET /api/goals/{id}` | Goals + milestone progress |
| `POST /api/chat` · `GET /api/chat/{id}` | Coaching chat (pipeline of §17) · history |
| `POST /api/career/cv` · `DELETE /api/career/cv/{id}` · `GET /api/career/cv/{id}/file` | CV upload (proxy to LangGraph service) · cascade delete · original file download |
| `GET /api/health` | Mongo ping + config state |

MCP tools (45) exposed to agents only: `list_agent_cards`, `delegate_to_*`, `ask_quality_gate`, `get/update_user_profile`, `set_consent`, CV proxy tools, `save_assessment`, `create_goal`, `track_habit`, `search_memories`, `search_books`, `add_learning_resource`, `save_report`, `health_check`, …

## 19. Security & privacy architecture

- **Identity**: user_id comes only from the verified JWT (backend) → authorized context → agents/MCP. LLMs never choose it.
- **Backend ≠ MCP**: backend talks to Mongo directly; MCP serves agents only.
- **Consent ledger**: granular, revocable consents; writes require explicit approval.
- **Anti-injection**: retrieved content (CV/memory/books) is data, never instructions; backend sanitizer strips control chars and flags injection hints into `agent_executions` (blocked-but-delivered semantics).
- **Scope guard**: Quality Gate blocks diagnostic/medical out-of-scope output and redirects to professionals.
- **Secrets**: git-ignored `.env` per service; `.env.example` placeholders only; tokens normalized, never printed; no secrets in this document or in code (the LangGraph supervisor previously had an embedded fallback JWT — removed 2026-11-13).
- **Data rights**: `delete_cv` cascades (chunks + derived memories); full account erasure available in-app (settings) and counted in `agent_executions`.
- **CORS** locked to the web origin; **401** without token everywhere.
- **Compliance stance**: design aligned with GDPR and Moroccan Law 09-08 (CNDP); DPA/CNDP dossier is a B2B gating item.

## 20. Environments & operations

| Env | URL | Notes |
|---|---|---|
| Local dev | web :3000 · backend :8001 · LangGraph supervisor :8020 · CV :8300 · MCP stdio/:8310 · Langflow :7860 | `langflow/` JSONs imported manually (or via UI import) |
| Staging | `stg-agentic.abafusion.ai` | Langflow 1.7 behind Cloudflare; Global Variable `openRouter` rotated 2026-11-13; flows answer 200 (intermittent 504 edge timeouts) |
| Production | TBD | Same containers behind a domain; dedicated Atlas user scoped to `coach` |

**Start/restart (PowerShell)** — supervisor: `cd langgraph-supervisor && py app\main.py` · backend: `py -m uvicorn app.main:app --port 8001` · MCP http: `node src/http.js` (verify: `node scripts/verify-http.mjs`) · CV: `py -m uvicorn app.main:app --port 8300` · web: `npm start`.

**Known gaps to fix before GA**
1. JWT in localStorage → httpOnly cookie + SameSite=Strict.
2. Dedicated Mongo user scoped to `coach` (currently shares S7's credentials — cluster-wise isolated, user-wise not).
3. Atlas Vector Search for the book library (chunk shape ready).
4. Full Arabic/Darija UX QA; `$text` is thin for Arabic today.
5. Enforce 15 evals in `langflow/EVALS.md` as release gates.
6. Flow JSONs still carry a `http://localhost:7860/.../knowledge_rag` endpoint inside each flow — parameterize via generator scripts (`build_flows.py`) for staging.
7. Persist Langflow imports + eval baselines; remove demo/test users from Atlas.

## 21. Tech risks & mitigations

| Risk | Mitigation |
|---|---|
| Staging Cloudflare 504 under load | Automatic pipeline fallback (shared → local Langflow → demo coach); retry-once specialist semantics |
| LLM provider outage/cost | OpenRouter models swappable via env; synthesis temp 0.1–0.4; no model lock-in |
| Envelope parsing drift across flows | Defensive parsers (ChatOutput + TextOutput shapes), fenced-JSON tolerant, honest "non-parsable" notes instead of crashes |
| Prompt injection via CV/memory | Data-as-data rule + sanitizer + Quality Gate |
| RAG hallucination | Sufficiency reporting; answer only from retrieved passages with provenance |
| Machine restarts kill services | No pm2/Docker yet — add systemd/pm2 or containers + health-check supervision before GA (roadmap) |
| Local `langflow` not installed on dev machine | Flow JSONs validated structurally + cloned from user's real 1.7 exports; staging UI is the execution target today |

## 22. Engineering quickstart

```bash
# CV service :8300
cd coach-cv-service && py -m pip install -r requirements.txt && py -m uvicorn app.main:app --port 8300
# MCP (stdio) — Langflow agents
cd mcp-server && npm install && npm run seed && npm test && node scripts/verify-stdio.mjs
# MCP over HTTP :8310 (for Flow-side HTTP/ngrok)
node src/http.js && node scripts/verify-http.mjs
# Backend :8001
cd backend && py -m pip install -r requirements.txt && py -m uvicorn app.main:app --port 8001
# Frontend :3000
cd web && npm install && npm run build && npm start    # http://localhost:3000
# LangGraph supervisor :8020
cd langgraph-supervisor && py app/main.py              # GET /health shows per-flow config
```
**Test the happy path without any LLM**: backend falls back to a built-in empathetic demo coach — signup → chat works out of the box.

## 23. Glossary

| Term | Meaning |
|---|---|
| **Envelope** | Common agent output contract: `{status, result, evidence, confidence, next_action, message_to_user}` |
| **Authorized context** | `{user_id, conversation_id, language, coaching_style, consent_flags}` built by backend from the JWT |
| **A2A** | Agent-to-Agent delegation over HTTP `/run` (S7 pattern) |
| **Agent cards** | Registry entries per specialist embedded in the Supervisor prompt + served by `list_agent_cards` |
| **MCP** | Model Context Protocol — one server (`coach-mcp`), 45 tools, all agents |
| **Sufficiency** | RAG evidence verdict: `enough ≥ 3 · partial ≥ 1 · insufficient` |
| **Readiness/match score** | `sum(min(current, required)) / sum(required)` × 100, computed server-side |
| **Quality Gate** | Final pass/revise/block filter before any answer reaches the user |

---

**Document owner**: the Evolve AI team · **Next review**: on flows import-completion + EVALS run · **Contact**: repo root (`CLAUDE.md` for operator context, `PROJECT_DOCUMENTATION.md` for the French build log).
