"""Evolve AI — LangGraph Supervisor.

Pipeline: parse envelope → route intents → fan-out specialists (parallel, HTTP)
         → LLM synthesizes final coaching reply → quality_gate HTTP check → reply.

AGENT_CARDS registry — mirrors the cards embedded in the staging Supervisor prompt: each specialist
is named, role/description/use-when/expected-output, so the supervisor knows when and how to call it.

LLM backend: OpenRouter (deepseek/deepseek-v4-flash). API key via env var:
    $env:OPENROUTER_API_KEY = "sk-or-v1-..."
    $env:OPENROUTER_MODEL   = "deepseek/deepseek-v4-flash"   (default)

Usage (PowerShell):
    py main.py                        # port 8020 (charge .env automatiquement)

Configuration workflows (tout est optionnel, dans le .env à côté de ce service) :
    STG_BASE                       # base partagée, défaut https://stg-agentic.abafusion.ai/api/v1/run
    AGENTIC_TOKEN                  # jeton partagé par tous les workflows (ou ANALYSIS_API_TOKEN)
    <SLUG>_URL / <SLUG>_TOKEN      # surcharge par workflow : SELF_DISCOVERY_URL/TOKEN,
                                   # SKILLS_ASSESSMENT_*, DEVELOPMENT_PLANNER_*, PROGRESS_REFLECTION_*,
                                   # CV_GAP_ANALYSIS_*, QUALITY_GATE_*
    Résolution par workflow : <SLUG>_URL/<SLUG>_TOKEN → STG_BASE + AGENTIC_TOKEN → valeur par défaut publique.
POST /coaching/chat with {authorized_context, user_message}
"""
import asyncio
import json
import os
import time
from typing import Any, TypedDict

import httpx
from fastapi import FastAPI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel
import uvicorn

# ───────────────────────── config ─────────────────────────

def _load_env() -> None:
    """Hydrate os.environ from the .env sitting next to this service (no python-dotenv dependency)."""
    from pathlib import Path
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env()

STG_BASE = os.environ.get("STG_BASE", "https://stg-agentic.abafusion.ai/api/v1/run").rstrip("/")


def _bearer(token: str) -> str:
    token = (token or "").strip()
    if not token:
        return ""
    return token if token.lower().startswith("bearer ") else f"Bearer {token}"


# Shared jeton — used by every workflow unless a per-flow token is set.
SHARED_TOKEN = _bearer(os.environ.get("AGENTIC_TOKEN") or os.environ.get("ANALYSIS_API_TOKEN") or "")


def flow_url(slug: str) -> str:
    """Per-flow URL wins; otherwise fall back to STG_BASE/<slug>."""
    return (os.environ.get(f"{slug.upper()}_URL") or f"{STG_BASE}/{slug}").rstrip("/")


def flow_token(slug: str) -> str:
    """Per-flow token wins; otherwise the shared AGENTIC_TOKEN / ANALYSIS_API_TOKEN."""
    return _bearer(os.environ.get(f"{slug.upper()}_TOKEN")) or SHARED_TOKEN


def headers_for(slug: str) -> dict:
    h = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "User-Agent": "Mozilla/5.0",
    }
    tok = flow_token(slug)
    if tok:
        h["Authorization"] = tok
    return h


OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
LLM_HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://evolve-coach.local",
    "X-Title": "Evolve AI Supervisor",
}
LLM_URL = "https://openrouter.ai/api/v1/chat/completions"

SPECIALISTS = {
    "self_discovery": "self_discovery",
    "skills_assessment": "skills_assessment",
    "development_planner": "development_planner",
    "progress_reflection": "progress_reflection",
    "cv_gap_analysis": "cv_gap_analysis",
}

# ─────────── Agent Cards — what each specialist does (mirrors the staging registry) ───────────
# This is the SAME registry the staging Supervisor embeds in its system prompt:
# name + role + skills + use-when + expected output. The supervisor routes on it and cites it in replies.
AGENT_CARDS = {
    "self_discovery": {
        "tool": "delegate_to_self_discovery",
        "role": "Progressive onboarding & profile builder",
        "description": "Adaptive interview for ambitions, current situation, strengths, difficulties, motivations, values and aspirations.",
        "use_when": "The user talks about who they are, what they want, motivations, or needs a profile started/enriched.",
        "expected_output": "envelope with profile_update, hypotheses[{name, evidence, confidence}], covered_stages, next_question",
    },
    "skills_assessment": {
        "tool": "delegate_to_skills_assessment",
        "role": "Skills evaluation (exercise + rubric)",
        "description": "Evaluates a skill through practical exercises with 0-5 criteria. Scores computed server-side, never by the LLM.",
        "use_when": "The user wants to be assessed on a skill (communication, leadership, critical thinking, time management, problem solving, decision making).",
        "expected_output": "envelope with skill, criteria_scores[0-5 + evidence], total_score, comparison, recommendations",
    },
    "development_planner": {
        "tool": "delegate_to_development_planner",
        "role": "SMART goals & 30/60/90-day plans",
        "description": "Turns ambitions into SMART goals and 30/60/90-day plans with verified learning resources. Nothing saved without approval.",
        "use_when": "The user wants a goal, a plan, milestones, milestones or learning resources.",
        "expected_output": "envelope with goal + smart_check, or plan (plan_name, duration_days, objectives), resources, approval_required",
    },
    "progress_reflection": {
        "tool": "delegate_to_progress_reflection",
        "role": "Progress follow-up & pattern detection",
        "description": "Daily check-ins, habit tracking, weekly reviews and ≥3-occurrence pattern detection; adapts the plan when evidence repeats.",
        "use_when": "The user asks about progress, habits, check-ins, 'why am I not progressing', or reports a missed habit.",
        "expected_output": "envelope with observations (with numbers), recurring_obstacles, recommendations, next_week_focus, plan_adaptation_needed",
    },
    "cv_gap_analysis": {
        "tool": "delegate_to_cv_gap_analysis",
        "role": "CV → evidence-based gap analysis",
        "description": "Coach interview from the CV plus target objective. Evidence-based gaps, match_score 0-100.",
        "use_when": "The user wants their CV analysed, fit for a role, a gap analysis toward a target, or to prepare toward a target role.",
        "expected_output": "envelope with coverage (interview) or gap report (strengths, gaps, limits, match_score, recommended_focus, plan_handoff)",
    },
    "quality_gate": {
        "tool": "ask_quality_gate",
        "role": "Final quality & safety filter",
        "description": "Checks envelope validity, every claim cited, scope (no diagnosis/out-of-scope), and no other-user data before anything reaches the user.",
        "use_when": "Always, before delivering the final answer to the user.",
        "expected_output": "envelope with verdict pass|revise|block, issues[], revised_message",
    },
}


def cards_briefing() -> str:
    return "\n".join(
        f"- {slug} ({c['role']}): {c['description']}\n    USE WHEN: {c['use_when']}\n    EXPECTED OUTPUT: {c['expected_output']}"
        for slug, c in AGENT_CARDS.items()
    )

# ───────────────────────── state ─────────────────────────

class GraphState(TypedDict, total=False):
    user_message: str
    authorized_context: dict[str, Any]
    intents: list[str]
    specialist_responses: dict[str, str]
    llm_plan: str
    reply: str
    envelope: dict[str, Any]


INTENT_KEYWORDS = {
    "self_discovery": ["moi", "découvre", "qui suis", "ambition", "motivation", "valeur", "connaître", "parcours"],
    "skills_assessment": ["évalue", "évaluer", "test", "niveau", "compétence", "communication", "leadership", "form"],
    "development_planner": ["plan", "SMART", "objectif", "30/60/90", "feuill", "devenir", "promouv", "promotion"],
    "progress_reflection": ["habitudes", "progrès", "avancer", "avancement", "bloqué", "stagn"],
    "cv_gap_analysis": ["CV", "cv", "emploi", "poste", "profil", "gap"],
}


def detect_intents(message: str) -> list[str]:
    msg = message.lower()
    hits = [k for k, kws in INTENT_KEYWORDS.items() if any(k.lower() in msg for k in kws)]
    return hits or ["self_discovery"]


async def call_specialist(client: httpx.AsyncClient, slug: str, input_value: str, session_id: str) -> str:
    url = flow_url(slug)
    body = {
        "input_value": input_value,
        "input_type": "chat",
        "output_type": "chat",
        "session_id": session_id,
    }
    try:
        r = await client.post(url, json=body, headers=headers_for(slug), timeout=90)
    except Exception as exc:
        return f"[{slug}] network error: {exc}"
    if r.status_code != 200:
        return f"[{slug}] http {r.status_code} — {r.text[:180]}"
    data = r.json()
    try:
        text = (
            data.get("outputs", [{}])[0]
            .get("outputs", [{}])[0]
            .get("results", {}).get("message", {}).get("text", "")
        )
    except Exception:
        text = r.text[:1000]
    return text or f"[{slug}] empty"


async def llm_completion(client: httpx.AsyncClient, system: str, user: str, max_tokens: int = 900) -> str:
    if not OPENROUTER_API_KEY:
        return "(LLM not configured — set OPENROUTER_API_KEY)"
    try:
        r = await client.post(LLM_URL, headers=LLM_HEADERS, json={
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.4,
        }, timeout=60)
        if r.status_code != 200:
            return f"(LLM http {r.status_code} — {r.text[:200]})"
        return r.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        return f"(LLM error: {exc})"


def build_graph():
    builder = StateGraph(GraphState)

    async def parse(state: GraphState) -> GraphState:
        return {"intents": detect_intents(state.get("user_message", ""))}

    async def delegate(state: GraphState) -> GraphState:
        intents = state.get("intents", ["self_discovery"])
        ac = state.get("authorized_context", {})
        session_id = f"lg-{int(time.time())}"
        input_value = json.dumps({
            "authorized_context": ac,
            "user_message": state["user_message"],
        }, ensure_ascii=False)
        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(*[
                call_specialist(client, SPECIALISTS[i], input_value, session_id) for i in intents
            ])
        return {"specialist_responses": dict(zip(intents, results))}

    async def synthesize(state: GraphState) -> GraphState:
        specs = state.get("specialist_responses", {})
        specs_summary = "\n\n".join([
            f"— {k.replace('_', ' ').title()} —\n{v[:1800]}" for k, v in specs.items()
        ]) or "(aucun spécialiste consulté)"
        intents = state.get("intents", [])
        async with httpx.AsyncClient() as client:
            llm_reply = await llm_completion(
                client,
                (
                    "You are EVOLVE SUPERVISOR — orchestrator of a personal-development coach. "
                    "Your job: deliver a concise, motivational, evidence-grounded coaching reply in the user's language "
                    "to the user's question, using the specialist inputs below and the user's context. "
                    "Reply in 3 to 4 short sections: (1) Synthèse, (2) Résultats spécialistes consultés (name each specialist "
                    "and its job, grounded in the agent cards), (3) Message clair proposé. Keep it under 170 words. "
                    "No diagnosis, no medical advice.\n\n"
                    "AVAILABLE SPECIALISTS (agent cards — the ONLY specialists you may reference):\n"
                    + cards_briefing()
                ),
                f"Context: {json.dumps(state.get('authorized_context', {}), ensure_ascii=False)}\n"
                f"Intent: {', '.join(intents)}\n"
                f"User says: {state['user_message']}\n\n"
                f"Specialists returned:\n{specs_summary}",
                max_tokens=500,
            )
        async with httpx.AsyncClient() as client:
            gate_text = await call_specialist(
                client, "quality_gate",
                json.dumps({
                    "authorized_context": state.get("authorized_context", {}),
                    "draft_answer": llm_reply,
                    "specialist_envelopes": [{"source": k, "text": v[:1500]} for k, v in specs.items()],
                }, ensure_ascii=False),
                f"gate-{int(time.time())}",
            )
        return {"reply": llm_reply, "llm_plan": llm_reply, "envelope": {"quality_gate": gate_text[:4000]}}

    builder.add_node("parse", parse)
    builder.add_node("delegate", delegate)
    builder.add_node("synthesize", synthesize)
    builder.set_entry_point("parse")
    builder.add_edge("parse", "delegate")
    builder.add_edge("delegate", "synthesize")
    builder.add_edge("synthesize", END)
    return builder.compile()


graph = build_graph()

# ───────────────────────── fastapi wrapper ─────────────────────────

app = FastAPI(title="Evolve AI Supervisor (LangGraph)")

class ChatPayload(BaseModel):
    authorized_context: dict[str, Any] | None = None
    user_message: str

@app.post("/coaching/chat")
async def chat(payload: ChatPayload):
    ac = payload.authorized_context or {}
    t0 = time.time()
    result = await graph.ainvoke({
        "user_message": payload.user_message,
        "authorized_context": ac,
    })
    dt = time.time() - t0
    return {
        "reply": result.get("reply"),
        "intents": result.get("intents"),
        "specialist_responses": result.get("specialist_responses"),
        "quality_gate": result.get("envelope", {}).get("quality_gate"),
        "latency_ms": int(dt * 1000),
    }

@app.get("/health")
def health():
    flows = list(SPECIALISTS) + ["quality_gate"]
    return {
        "ok": True,
        "model": OPENROUTER_MODEL,
        "llm_configured": bool(OPENROUTER_API_KEY),
        "stg_base": STG_BASE,
        "agent_cards": list(AGENT_CARDS.values()),
        # URL + token-presence per flow — never the secret values
        "specialists": {
            s: {"url": flow_url(s), "token": bool(flow_token(s))}
            for s in flows
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8020)
