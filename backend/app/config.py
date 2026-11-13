import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ─── MongoDB ─────────────────────────────────
MONGO_URI = os.environ["MONGO_URI"]
DATABASE_NAME = os.environ.get("DATABASE_NAME", "coach")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = int(os.environ.get("JWT_EXPIRES_MINUTES", "43200"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

LANGFLOW_URL = os.environ.get("LANGFLOW_URL", "").rstrip("/")
LANGFLOW_FLOW_ID = os.environ.get("LANGFLOW_FLOW_ID", "")
LANGFLOW_API_KEY = os.environ.get("LANGFLOW_API_KEY", "")
LANGFLOW_TIMEOUT_SECONDS = float(os.environ.get("LANGFLOW_TIMEOUT_SECONDS", "120"))
CV_SERVICE_URL = os.environ.get("CV_SERVICE_URL", "http://localhost:8300").rstrip("/")
def _bearer(token: str) -> str:
    token = (token or "").strip()
    if not token:
        return ""
    return token if token.lower().startswith("bearer ") else f"Bearer {token}"


ANALYSIS_API_URL = os.environ.get("ANALYSIS_API_URL", "").rstrip("/")
ANALYSIS_API_TOKEN = _bearer(os.environ.get("ANALYSIS_API_TOKEN", ""))
ANALYSIS_WEBHOOK_URL = os.environ.get("ANALYSIS_WEBHOOK_URL", "")
ANALYSIS_WEBHOOK_TIMEOUT_SECONDS = float(os.environ.get("ANALYSIS_WEBHOOK_TIMEOUT_SECONDS", "5"))
MAX_DEBT_RATIO = float(os.environ.get("MAX_DEBT_RATIO", "0.40"))


def _env_flow(name: str):
    url = os.environ.get(f"{name}_URL", "").rstrip("/")
    token = _bearer(os.environ.get(f"{name}_TOKEN", "")) or ANALYSIS_API_TOKEN  # fallback to shared token
    return (url, token) if url else ("", "")


_FLOWS = {name: _env_flow(name) for name in [
    "supervisor", "self_discovery", "skills_assessment", "development_planner",
    "progress_reflection", "cv_gap_analysis", "quality_gate",
]}


def flow_url(name: str) -> str:
    return _FLOWS.get(name, ("", ""))[0]


def flow_token(name: str) -> str:
    return _FLOWS.get(name, ("", ""))[1]


def langflow_enabled() -> bool:
    return bool(LANGFLOW_URL and LANGFLOW_FLOW_ID)


def agentic_enabled() -> bool:
    return bool(ANALYSIS_API_URL and ANALYSIS_API_TOKEN) or any(t for (_, t) in _FLOWS.values())


# Backwards-compatible alias used by /api/chat
def analysis_enabled() -> bool:
    return agentic_enabled()


def effective_pipeline() -> str:
    """Which pipeline is wired for /api/chat: 'agentic_public' | 'langflow_local' | 'disabled'."""
    if agentic_enabled():
        return "agentic_public"
    if langflow_enabled():
        return "langflow_local"
    return "disabled"
