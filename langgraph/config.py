"""Evolve AI — LangGraph config (flat env-driven, same semantics as backend/.env)."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

# LLM (OpenRouter)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
LLM_URL = "https://openrouter.ai/api/v1/chat/completions"
LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS", "90"))

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
