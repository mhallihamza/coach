"""Minimal JSON-RPC client for coach-mcp (stateless StreamableHTTP, POST-only).

- POST `Accept: application/json, text/event-stream`; servers may answer JSON or SSE-framed payloads.
- Deterministic, no external dependency: just httpx.
- Every call MUST carry userId — the MCP tools refuse silently otherwise.
"""
from __future__ import annotations
import json
from typing import Any
import httpx
import config


def _unpack(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        lines = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")]
        if lines:
            try:
                return json.loads(lines[-1])
            except json.JSONDecodeError:
                pass
        return {"ok": False, "error": "unparseable_mcp_response", "raw": raw[:300]}


async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    args = dict(arguments or {})
    if "userId" not in args:
        return {"ok": False, "error": "userId_required"}
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    try:
        async with httpx.AsyncClient(timeout=config.MCP_TIMEOUT_SECONDS) as client:
            r = await client.post(config.MCP_URL, json=body, headers=headers)
        payload = _unpack(r.text)
        content = (payload.get("result") or {}).get("content") or []
        if not content:
            if payload.get("error"):
                return {"ok": False, "error": (payload["error"] or {}).get("message", "mcp_error")}
            return {"ok": False, "error": "empty_content"}
        text = content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"ok": False, "error": "unparseable_tool_payload", "raw": text[:300]}
    except Exception as exc:
        return {"ok": False, "error": f"mcp_exception: {exc}"}
