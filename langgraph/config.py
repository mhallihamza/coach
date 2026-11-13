"""Evolve AI — LangGraph config (flat env-driven, same semantics as backend/.env)."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

# LLM — Mistral by default; OpenRouter can act as fallback
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
MISTRAL_MODEL = os.environ.get("MISTRAL_MODEL", "ministral-8b-latest")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "mistral" if MISTRAL_API_KEY else "openrouter")
LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS", "90"))

# If Mistral is configured, use its endpoint; otherwise fall back to OpenRouter
if LLM_PROVIDER == "mistral" and MISTRAL_API_KEY:
    LLM_URL = "https://api.mistral.ai/v1/chat/completions"
    OPENROUTER_API_KEY = MISTRAL_API_KEY   # reused by llm.py as the bearer
    OPENROUTER_MODEL = MISTRAL_MODEL
else:
    LLM_URL = "https://openrouter.ai/api/v1/chat/completions"
    OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-chat")

# MCP bridge — the agents use it only as a tool layer; nothing else touches MCP
MCP_URL = os.environ.get("MCP_URL", "http://127.0.0.1:8310/mcp").rstrip("/")
MCP_TIMEOUT_SECONDS = float(os.environ.get("MCP_TIMEOUT_MS", "90000")) / 1000.0

# Mongo — chat history continuity (read-only for the agents)
MONGO_URI = os.environ.get("MONGO_URI", "")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "coach")

# Ports — every agent is its own process
PORTS = {
    "supervisor": 8020,
    "self_discovery": 8501,
    "skills_assessment": 8502,
    "development_planner": 8503,
    "progress_reflection": 8504,
    "cv_gap_analysis": 8505,
    "quality_gate": 8506,
    "knowledge_rag": 8507,
}
