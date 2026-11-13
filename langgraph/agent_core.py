"""Evolve AI — agent core.

Every specialist in this package is a LangGraph CompiledStateGraph compiled from this module.
Loop:  call_llm ──(tool_call?)──→ run_tool ──→ call_llm ──...──→ END

Protocol enforced on the LLM (plain JSON protocol — deterministic parsing, no extra deps):
  EITHER  {"tool_call": {"name": "<tool>", "arguments": {...}}}        → Python runs the tool, re-prompts
  OR      {"status": "ok|need_info|approved|refused", "result": {...},
            "message_to_user": "...", "evidence": [...],
            "confidence": 0.0, "next_action": "ask_question|request_approval|nothing"}
"""
from __future__ import annotations
import json, re, asyncio
from typing import Any
import httpx
from langgraph.graph import StateGraph, END
from typing import TypedDict

import config
from mcp_client import call_tool as mcp_call


# ───────────────────────── state ─────────────────────────

class AgentState(TypedDict, total=False):
    messages: list[dict[str, str]]          # full running chat, system-first
    authorized_context: dict[str, Any]
    user_message: str
    pending_tool: dict[str, Any]            # parsed tool_call awaiting execution
    tool_results: list[dict[str, Any]]
    envelope: dict[str, Any]                # final parsed envelope
    iterations: int
    last_error: str


# ───────────────────────── optional chat history (continuity) ─────────────────────────

def load_history(conversation_id: str | None, user_id: str, limit: int = 12) -> list[dict[str, str]]:
    """Read backend-stored conversation (read-only). Empty list if unreachable."""
    if not conversation_id or not config.MONGO_URI:
        return []
    try:
        from pymongo import MongoClient
        with MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=4000) as client:
            db = client[config.DATABASE_NAME]
            cur = db.messages.find({"conversationId": conversation_id}).sort("createdAt", -1).limit(limit)
            msgs = list(cur)
    except Exception:
        return []
    history: list[dict[str, str]] = []
    for m in reversed(msgs):
        role = m.get("role") or ("assistant" if m.get("sender") == "assistant" else "user")
        history.append({"role": role, "content": (m.get("content") or "")[:2000]})
    return history


# ───────────────────────── envelope parsing ─────────────────────────

def _extract_envelope(text: str) -> dict[str, Any] | None:
    text = (text or "").strip()
    if not text:
        return None
    # direct JSON?
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            if "status" in parsed:
                return _normalize(parsed)
            msg = parsed.get("message_to_user") or ""
            if isinstance(msg, str) and msg.strip().startswith("{"):
                try:
                    nested = json.loads(msg.strip())
                    if isinstance(nested, dict) and "status" in nested:
                        return _normalize(nested)
                except json.JSONDecodeError:
                    pass
    except json.JSONDecodeError:
        pass
    # regex fallback
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        if isinstance(parsed, dict):
            if "status" in parsed:
                return _normalize(parsed)
            msg = parsed.get("message_to_user") or ""
            if isinstance(msg, str) and msg.strip().startswith("{"):
                try:
                    nested = json.loads(msg.strip())
                    if isinstance(nested, dict) and "status" in nested:
                        return _normalize(nested)
                except json.JSONDecodeError:
                    pass
    except json.JSONDecodeError:
        return None
    return None


def _normalize(env: dict[str, Any]) -> dict[str, Any]:
    if "message_to_user" not in env or not env.get("message_to_user"):
        r = env.get("result") if isinstance(env.get("result"), dict) else {}
        env["message_to_user"] = r.get("message_to_user") or r.get("answer") or "…"
    env.setdefault("status", "ok")
    env.setdefault("evidence", [])
    env.setdefault("confidence", 0.3)
    env.setdefault("next_action", "nothing")
    return env


# ───────────────────────── LLM call ─────────────────────────

async def call_llm(messages: list[dict[str, str]]) -> str:
    if not config.OPENROUTER_API_KEY:
        return "(LLM not configured — set OPENROUTER_API_KEY)"
    hdr = {"Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
           "Content-Type": "application/json",
           "HTTP-Referer": "https://evolve-coach.local",
           "X-Title": "Evolve AI LangGraph"}
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT_SECONDS) as client:
        r = await client.post(config.LLM_URL, headers=hdr, json={
            "model": config.OPENROUTER_MODEL,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 1200,
        })
    if r.status_code != 200:
        return f"__LLM_ERROR__ http {r.status_code} — {r.text[:200]}"
    try:
        return r.json()["choices"][0]["message"]["content"] or ""
    except Exception as exc:
        return f"__LLM_ERROR__ {exc}"


def _pending_tool(content: str) -> dict[str, Any] | None:
    content = (content or "").strip()
    parsed = None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", content)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    if not isinstance(parsed, dict):
        return None
    tc = parsed.get("tool_call")
    if isinstance(tc, dict) and tc.get("name"):
        return tc
    if parsed.get("name") and "arguments" in parsed:
        return parsed
    return None


# ───────────────────────── graph builder ─────────────────────────

def build_agent(system_prompt: str, tool_catalog: dict[str, dict[str, Any]], max_iterations: int = 4):
    tool_desc = "\n".join(
        f"- {name}: {spec.get('description','')} — parameters: {json.dumps(spec.get('parameters', {}), ensure_ascii=False)}"
        for name, spec in tool_catalog.items()
    )
    full_system = (
        system_prompt.rstrip()
        + "\n\nAVAILABLE TOOLS (use ONLY when your answer needs grounded facts):\n"
        + tool_desc
        + "\n\nTOOL PROTOCOL: reply with EITHER one tool call "
          '{"tool_call": {"name": "...", "arguments": {...}}} '
          "OR your final envelope (status/result/message_to_user/evidence/confidence/next_action) and nothing else. "
          "Never invent tool outputs."
    )

    async def call_llm_node(state: AgentState) -> AgentState:
        messages = list(state["messages"])
        content = await call_llm(messages)
        messages.append({"role": "assistant", "content": content})
        update: dict[str, Any] = {"messages": messages, "iterations": state.get("iterations", 0) + 1}
        tc = _pending_tool(content) if not content.startswith("__LLM_ERROR__") else None
        if tc:
            update["pending_tool"] = tc
        elif content.startswith("__LLM_ERROR__"):
            update["last_error"] = content
        return update

    async def run_tool_node(state: AgentState) -> AgentState:
        tc = state.get("pending_tool") or {}
        name, args = tc.get("name"), tc.get("arguments") or {}
        if not isinstance(args, dict):
            args = {"args": args}
        ac = state.get("authorized_context") or {}
        args.setdefault("userId", ac.get("user_id", "unknown"))
        result = await mcp_call(name, args)
        messages = list(state["messages"])
        messages.append({"role": "user", "content": f"TOOL RESULT ({name}):\n" + json.dumps(result, ensure_ascii=False)})
        return {"messages": messages, "tool_results": state.get("tool_results", []) + [{"tool": name, "result": result}], "pending_tool": None}

    async def finalize_node(state: AgentState) -> AgentState:
        content = state["messages"][-1]["content"] if state.get("messages") else ""
        envelope = _extract_envelope(content) or {
            "status": "ok",
            "result": {},
            "message_to_user": content[:4000] if content else "…",
            "evidence": [],
            "confidence": 0.3,
            "next_action": "ask_question",
        }
        if not isinstance(envelope.get("next_action"), str):
            envelope["next_action"] = "nothing"
        if envelope.get("status") not in {"ok", "need_info", "approved", "refused"}:
            envelope["status"] = "ok"
        return {"envelope": envelope}

    def route(state: AgentState) -> str:
        if state.get("iterations", 0) >= max_iterations:
            return "finalize"
        if state.get("pending_tool"):
            return "run_tool"
        return "finalize"

    builder = StateGraph(AgentState)
    builder.add_node("call_llm", call_llm_node)
    builder.add_node("run_tool", run_tool_node)
    builder.add_node("finalize", finalize_node)
    builder.set_entry_point("call_llm")
    builder.add_conditional_edges("call_llm", route, {"run_tool": "run_tool", "finalize": "finalize", "END": END})
    builder.add_edge("run_tool", "call_llm")
    builder.add_edge("finalize", END)
    return builder.compile()


# ───────────────────────── input parsing (Langflow-compatible) ─────────────────────────

def parse_input_value(input_value: str) -> tuple[dict[str, Any], dict[str, Any]]:
    input_value = (input_value or "").strip()
    envelope: dict[str, Any] = {}
    if input_value.startswith("{"):
        try:
            maybe = json.loads(input_value)
            if isinstance(maybe, dict):
                envelope = maybe
        except json.JSONDecodeError:
            pass
    if envelope:
        authorized = envelope.get("authorized_context") or {}
        task = envelope.get("task") or envelope.get("task_payload") or {}
        return authorized, task
    return {}, {"goal": "respond", "user_message": input_value}


def wrap_langflow_output(session_id: str, input_value: str, envelope: dict[str, Any]) -> dict[str, Any]:
    envelope_text = json.dumps(envelope, ensure_ascii=False)
    return {
        "session_id": session_id,
        "outputs": [{
            "inputs": {"input_value": input_value},
            "outputs": [{
                "results": {"message": {"text": envelope_text, "text_key": "text", "data": {"sender": "Machine", "sender_name": "Evolve"}}},
                "messages": [{"message": envelope_text, "sender": "Machine", "sender_name": "Evolve"}],
            }],
        }],
    }
