"""Evolve AI — generic agent HTTP service.

One process = one agent. Which agent is served is taken from the environment variable
AGENT_SERVICE_NAME (default: self_discovery). Each service exposes two endpoints:

  GET  /health            -> liveness + LLM + MCP status
  POST /run/<slug>        -> Langflow-compatible envelope (same output shape as stg-agentic)

The specialised flow per agent (prompt, tools, port) is selected at import time.
"""
from __future__ import annotations
import asyncio
import json
import os
import time
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from starlette.responses import JSONResponse

import config
import agent_core
from agent_core import build_agent, parse_input_value, wrap_langflow_output, load_history, call_llm
from agents.definitions import AGENT_SYSTEMS, AGENT_TOOLS, TOOL_CATALOG
from agents.knowledge import run_knowledge_rag

AGENT_NAME = os.environ.get("AGENT_SERVICE_NAME", "self_discovery")
AGENT_PORT = config.PORTS.get(AGENT_NAME, 8510)

if AGENT_NAME == "knowledge_rag":
    _COMPILED = None          # RAG is deterministic — no LangGraph agent needed
else:
    _tools = {t: TOOL_CATALOG[t] for t in AGENT_TOOLS[AGENT_NAME]}
    _COMPILED = build_agent(AGENT_SYSTEMS[AGENT_NAME], _tools)

PORTS = config.PORTS

app = FastAPI(title=f"Evolve AI — agent[{AGENT_NAME}]")


class RunIn(BaseModel):
    input_value: str
    input_type: str = "chat"
    output_type: str = "chat"
    session_id: Optional[str] = None


@app.get("/health")
async def health() -> dict[str, Any]:
    import httpx
    mcp_status = "unreachable"
    try:
        r = httpx.post(config.MCP_URL, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}, timeout=5)
        mcp_status = "reachable" if r.status_code < 500 else "error"
    except Exception:
        pass
    return {"ok": True, "agent": AGENT_NAME, "port": AGENT_PORT, "llm_configured": bool(config.OPENROUTER_API_KEY), "mcp": mcp_status}


@app.get("/agents")
async def agents() -> dict[str, Any]:
    return {
        "agents": {k: {"tools": AGENT_TOOLS[k], "port": PORTS[k]} for k in PORTS if k != "supervisor"},
        "current": AGENT_NAME,
    }


@app.post("/run/{slug}")
async def run(slug: str, body: RunIn) -> JSONResponse:
    if slug.lower() != AGENT_NAME:
        # a client addressed a different slug on this port — forward the request to the right agent's port
        # by returning redirect info instead of running the wrong agent here
        target = PORTS.get(slug.lower())
        if target:
            return JSONResponse({"redirect_to": f"http://127.0.0.1:{target}/run/{slug}", "hint": "this port serves a single agent; call the agent's own port"}, status_code=307)
        raise HTTPException(404, f"Unknown agent: {slug}. Served: {AGENT_NAME}")

    session_id = body.session_id or f"ca-{AGENT_NAME}-{int(time.time())}"
    authorized, task = parse_input_value(body.input_value)
    user_id = authorized.get("user_id", "unknown")
    language = authorized.get("language", "fr")

    if AGENT_NAME == "knowledge_rag":
        envelope = await run_knowledge_rag(task.get("user_message", body.input_value), authorized)
        return JSONResponse(wrap_langflow_output(session_id, body.input_value, envelope))

    history = load_history(authorized.get("conversation_id"), user_id)
    messages = [
        {"role": "system", "content": f"Reply in {language}.\n\n{AGENT_SYSTEMS[AGENT_NAME]}"},
        *history,
        {"role": "user", "content": (
            "authorized_context: " + json.dumps(authorized, ensure_ascii=False) + "\n\n"
            f"TASK: {task.get('goal', 'respond')} | REFERENCE: none | CONTEXT: {json.dumps(task, ensure_ascii=False)}"
        )},
    ]
    final_state = await _COMPILED.ainvoke({
        "messages": messages,
        "authorized_context": authorized,
        "user_message": task.get("user_message", body.input_value),
        "iterations": 0,
        "tool_results": [],
    })
    envelope = final_state.get("envelope") or {}
    if not envelope.get("message_to_user"):
        envelope["message_to_user"] = "…"
    return JSONResponse(wrap_langflow_output(session_id, body.input_value, envelope))


@app.post("/run")
async def run_direct(body: RunIn) -> JSONResponse:
    return await run(AGENT_NAME, body)
