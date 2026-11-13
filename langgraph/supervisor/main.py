"""Evolve AI — LangGraph Supervisor (all-local by default).

Pipeline: parse envelope → fan-out specialists (HTTP, each on its own port)
          → OpenRouter synthesizes → quality_gate HTTP → reply.

Ports come from config.PORTS. Per-flow URL/TOKEN can still override via <SLUG>_URL / <SLUG>_TOKEN
(identical syntax as the old staging setup).

POST /coaching/chat with {authorized_context, user_message}
GET  /health reports each specialist's URL, token presence, and the six agent cards.
"""
import asyncio
import json
import os
import time
from typing import Any, Optional, TypedDict
from pathlib import Path

import httpx
from fastapi import FastAPI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel
import uvicorn

_THIS = Path(__file__).resolve().parent.parent  # langgraph/
import sys
sys.path.insert(0, str(_THIS))

import config
from config import PORTS


# ───────────────────────── agent cards (mirrors the knowledge registry) ─────────────────────────
AGENT_CARDS = {
    "self_discovery": {
        "tool": "delegate_to_self_discovery", "role": "Progressive onboarding & profile builder",
        "description": "Adaptive interview for ambitions, current situation, strengths, difficulties, motivations, values and aspirations.",
        "use_when": "The user talks about who they are, what they want, motivations, or needs a profile started/enriched.",
        "expected_output": "envelope with profile_update, hypotheses[{name, evidence, confidence}], covered_stages, next_question",
    },
    "skills_assessment": {
        "tool": "delegate_to_skills_assessment", "role": "Skills evaluation (exercise + rubric)",
        "description": "Evaluates a skill through practical exercises with 0-5 criteria. Totals computed server-side.",
        "use_when": "The user wants to be assessed on a skill (communication, leadership, critical thinking, time management, problem solving, decision making).",
        "expected_output": "envelope with skill, criteria_scores[0-5 + evidence], total_score, comparison, recommendations",
    },
    "development_planner": {
        "tool": "delegate_to_development_planner", "role": "SMART goals & 30/60/90-day plans",
        "description": "Turns ambitions into SMART goals and 30/60/90 plans with verified learning resources. Nothing saved without explicit approval.",
        "use_when": "The user wants a goal, a plan, milestones or learning resources.",
        "expected_output": "envelope with goal + smart_check, or plan(plan_name, duration_days, objectives), resources, approval_required",
    },
    "progress_reflection": {
        "tool": "delegate_to_progress_reflection", "role": "Progress follow-up & pattern detection",
        "description": "Daily check-ins, habits, weekly reviews, and ≥3-occurrence patterns. Adapts the plan when evidence repeats.",
        "use_when": "The user asks about progress, habits, check-ins, 'why am I not progressing', or reports a missed habit.",
        "expected_output": "envelope with observations, recurring_obstacles, recommendations, next_week_focus, plan_adaptation_needed",
    },
    "cv_gap_analysis": {
        "tool": "delegate_to_cv_gap_analysis", "role": "CV → evidence-based gap analysis",
        "description": "Coach interview from the CV + target objective. Evidence-based gaps, match_score 0-100.",
        "use_when": "The user wants their CV analysed, fit for a role, a gap analysis, or to prepare toward a target role.",
        "expected_output": "envelope with coverage (interview) or gap report (strengths, gaps, limits, match_score, recommended_focus, plan_handoff)",
    },
    "quality_gate": {
        "tool": "ask_quality_gate", "role": "Final quality & safety filter",
        "description": "Envelope validity, every claim cited, scope safety, no other user data. pass|revise|block.",
        "use_when": "Always, before delivering the final answer.",
        "expected_output": "envelope with verdict pass|revise|block, issues[], revised_message",
    },
}
CARDS_BRIEFING = "\n".join(
    f"- {slug} ({c['role']}): {c['description']}\n    USE WHEN: {c['use_when']}\n    EXPECTED OUTPUT: {c['expected_output']}"
    for slug, c in AGENT_CARDS.items()
)


# ───────────────────────── per-flow URL/TOKEN resolution (env-overridable) ─────────────────────────

def flow_url(slug: str) -> str:
    return (os.environ.get(f"{slug.upper()}_URL") or f"http://127.0.0.1:{PORTS[slug]}/run/{slug}").rstrip("/")

def flow_token(slug: str) -> str:
    t = os.environ.get(f"{slug.upper()}_TOKEN", "").strip()
    if not t:
        return ""  # local trust — no bearer needed on localhost
    return t if t.lower().startswith("bearer ") else f"Bearer {t}"

def headers_for(slug: str) -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "User-Agent": "Evolve-supervisor/1.0"}
    t = flow_token(slug)
    if t:
        h["Authorization"] = t
    return h


SPECIALISTS = ["self_discovery", "skills_assessment", "development_planner", "progress_reflection", "cv_gap_analysis"]

INTENT_KEYWORDS = {
    "self_discovery": ["moi", "qui suis", "ambition", "motivation", "valeur", "connaître", "parcours", "profil"],
    "skills_assessment": ["évalu", "test", "niveau", "compétence", "communication", "leadership", "form"],
    "development_planner": ["plan", "smart", "objectif", "30/60/90", "devenir", "promouvoir"],
    "progress_reflection": ["habitudes", "progrès", "avancement", "bloqué", "stagn", "check-in", "semaine"],
    "cv_gap_analysis": ["cv", "emploi", "poste", "profil", "gap", "analyze"],
}


def detect_intents(message: str) -> list[str]:
    msg = (message or "").lower()
    hits = [k for k, kws in INTENT_KEYWORDS.items() if any(kw.lower() in msg for kw in kws)]
    return hits or ["self_discovery"]


# ───────────────────────── orchestrator graph ─────────────────────────

class GraphState(TypedDict, total=False):
    user_message: str
    authorized_context: dict[str, Any]
    intents: list[str]
    specialist_responses: dict[str, str]
    llm_plan: str
    reply: str
    envelope: dict[str, Any]


async def call_specialist(client: httpx.AsyncClient, slug: str, input_value: str, session_id: str) -> str:
    url = flow_url(slug)
    body = {"input_value": input_value, "input_type": "chat", "output_type": "chat", "session_id": session_id}
    try:
        r = await client.post(url, json=body, headers=headers_for(slug), timeout=120)
    except Exception as exc:
        return f"[{slug}] network error: {exc}"
    if r.status_code != 200:
        return f"[{slug}] http {r.status_code} — {r.text[:180]}"
    try:
        data = r.json()
        return (data.get("outputs", [{}])[0].get("outputs", [{}])[0].get("results", {}).get("message", {}).get("text", "")
                or data.get("output", "") or json.dumps(data)[:1000])
    except Exception:
        return r.text[:1000]


async def llm_completion(client: httpx.AsyncClient, system: str, user: str, max_tokens: int = 900) -> str:
    if not config.OPENROUTER_API_KEY:
        return "(LLM not configured — set OPENROUTER_API_KEY)"
    hdr = {"Authorization": f"Bearer {config.OPENROUTER_API_KEY}", "Content-Type": "application/json",
           "HTTP-Referer": "https://evolve-coach.local", "X-Title": "Evolve AI Supervisor"}
    try:
        r = await client.post(config.LLM_URL, headers=hdr, json={
            "model": config.OPENROUTER_MODEL,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.4,
            "max_tokens": max_tokens,
        })
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
        input_value = json.dumps({"authorized_context": ac, "user_message": state["user_message"]}, ensure_ascii=False)
        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(*[call_specialist(client, slug, input_value, session_id) for slug in intents])
        return {"specialist_responses": dict(zip(intents, results))}

    async def synthesize(state: GraphState) -> GraphState:
        specs = state.get("specialist_responses", {}) or {}
        specs_summary = "\n\n".join(f"— {k.replace('_',' ').title()} —\n{v[:1800]}" for k, v in specs.items()) or "(aucun spécialiste consulté)"
        intents = state.get("intents", [])
        async with httpx.AsyncClient() as client:
            llm_reply = await llm_completion(
                client,
                (
                    "You are EVOLVE SUPERVISOR — orchestrator of a personal-development coach. "
                    "Deliver a concise, motivational, evidence-grounded coaching reply in the user's language. "
                    "Reply in 3 to 4 short sections: (1) Synthèse, (2) Résultats spécialistes consultés (name each specialist and its job), "
                    "(3) Message clair proposé. Keep it under 170 words. No diagnosis, no medical advice.\n\n"
                    "AVAILABLE SPECIALISTS (agent cards — the ONLY ones you may reference):\n" + CARDS_BRIEFING
                ),
                f"Context: {json.dumps(state.get('authorized_context', {}), ensure_ascii=False)}\n"
                f"Intent: {', '.join(intents)}\n"
                f"User says: {state['user_message']}\n\n"
                f"Specialists returned:\n{specs_summary}",
                max_tokens=2400,
            )

        # quality gate — same port family, same HTTP contract
        async with httpx.AsyncClient() as client:
            gate_text = await call_specialist(
                client, "quality_gate",
                json.dumps({"authorized_context": state.get("authorized_context", {}), "draft_answer": llm_reply,
                            "specialist_envelopes": [{"source": k, "text": v[:1500]} for k, v in specs.items()]}, ensure_ascii=False),
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
app = FastAPI(title="Evolve AI Supervisor — LangGraph")


class ChatPayload(BaseModel):
    authorized_context: dict[str, Any] | None = None
    user_message: str

class RunPayload(BaseModel):
    input_value: str
    input_type: str = "chat"
    output_type: str = "chat"
    session_id: Optional[str] = None


@app.post("/coaching/chat")
async def chat(payload: ChatPayload):
	"""Structured supervisor API — returns the full result object (used by /api/chat)."""
	ac = payload.authorized_context or {}
	t0 = time.time()
	result = await graph.ainvoke({"user_message": payload.user_message, "authorized_context": ac})
	dt = time.time() - t0
	return {
		"reply": result.get("reply"),
		"intents": result.get("intents"),
		"specialist_responses": result.get("specialist_responses"),
		"quality_gate": result.get("envelope", {}).get("quality_gate"),
		"latency_ms": int(dt * 1000),
	}


@app.post("/run/supervisor")
async def run_supervisor(body: RunPayload):
    """LangFlow-compatible envelope — the backend's /api/chat fallback invisibly targets this."""
    from agent_core import wrap_langflow_output

    raw = body.input_value or "{}"
    try:
        envelope = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(envelope, dict): envelope = {"user_message": str(raw)}
    except json.JSONDecodeError:
        envelope = {"user_message": str(raw)}

    authorized = envelope.get("authorized_context", {})
    task = envelope.get("task", {})
    user_message = envelope.get("user_message") or task.get("user_message") or str(raw)
    t0 = time.time()
    result = await graph.ainvoke({"user_message": user_message, "authorized_context": authorized})
    dt = time.time() - t0
    outer = {
        "status": "ok",
        "result": {"reply": result.get("reply"), "intents": result.get("intents"), "quality_gate": result.get("envelope", {}).get("quality_gate"), "latency_ms": int(dt * 1000)},
        "message_to_user": result.get("reply") or "",
        "next_action": "ask_question",
        "evidence": [],
        "confidence": 0.5,
    }
    return wrap_langflow_output(body.session_id or f"sup-{int(time.time())}", raw, outer)


@app.get("/health")
def health() -> dict[str, Any]:
    flows = SPECIALISTS + ["quality_gate"]
    return {
        "ok": True,
        "model": config.OPENROUTER_MODEL,
        "llm_configured": bool(config.OPENROUTER_API_KEY),
        "agent_cards": list(AGENT_CARDS.values()),
        "specialists": {s: {"url": flow_url(s), "port": PORTS[s], "token": bool(flow_token(s))} for s in flows},
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8020)
