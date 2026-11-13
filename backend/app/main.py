"""Evolve AI — FastAPI backend.

Reçoit les messages du frontend Next.js et les transmet au workflow Langflow
(/api/v1/run), comme S7. Si Langflow n'est pas configuré, un coach de démonstration
intégré répond (jamais silencieux), ce qui permet de démontrer le produit sans flux.
"""
import json
import re as _re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from . import config, db
from .security import (
    create_token, get_current_user, hash_password, new_user_id, verify_password,
)

app = FastAPI(title="Evolve AI — API", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
    db.ensure_indexes()


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# ───────────────────────── Modèles ─────────────────────────

class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    fullName: str = Field(min_length=2, max_length=120)
    language: str = Field(default="fr", pattern="^(ar|fr|en)$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    conversationId: Optional[str] = None


# ───────────────────────── Utilitaires ─────────────────────────

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def public_user(doc: dict) -> dict:
    return {"userId": doc["userId"], "email": doc["email"], "fullName": doc["fullName"], "language": doc.get("language", "fr")}


_UNSAFE_CHARS = _re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200c\u200d\u2060\ufeff]")
_INJECTION_HINTS = _re.compile(
    r"(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)|"
    r"(you\s+are\s+now|new\s+instructions?|system\s*:\s*)|ignore\s+your\s+rules",
    _re.IGNORECASE,
)

def sanitize_message(message: str) -> tuple[str, bool]:
    """Strip invisible/control chars and flag prompt-injection hints (content kept — only flagged)."""
    cleaned = _UNSAFE_CHARS.sub("", message).strip()
    flagged = bool(_INJECTION_HINTS.search(cleaned))
    return cleaned[:5000], flagged


def demo_coach_reply(message: str, full_name: str, history: list[dict]) -> dict:
    """Coach de démonstration (fallback quand Langflow n'est pas configuré).
    Tonalité empathique, question unique, suivi adaptatif — jamais de diagnostic."""
    m = message.lower()
    first = (full_name or "").split()[0] or "vous"

    if any(k in m for k in ["bonjour", "salut", "coucou", "hey", "bonsoir"]):
        reply = f"Bonjour {first} — ravi de vous retrouver. De quoi voulez-vous parler aujourd'hui ? Une ambition, quelque chose qui bloque, ou juste une envie de faire le point ?"
        nxt = "ask_question"
    elif any(k in m for k in ["communiqu", "parler", "feedback", "écoute"]):
        reply = ("La communication est un muscle, pas un trait figé. Avant de vous donner des pistes : "
                 "dans quelle situation précise ça coince le plus — les 1-pour-1, les réunions d'équipe, ou les conversations difficiles ?")
        nxt = "ask_question"
    elif any(k in m for k in ["data", "datascientist", "développeur", "devenir", "carrière", "cv"]):
        reply = ("Ambition claire — j'aime ça. Pour vous proposer un chemin réaliste, dites-m'en un peu plus : "
                 "où en êtes-vous aujourd'hui (formation, expérience, projets), et quel est votre objectif de rôle précisément ?")
        nxt = "ask_question"
    elif any(k in m for k in ["stress", "épuis", "surcharge", "pani"]):
        reply = ("Je vous entends. Le stress chronique épuise avant qu'on s'en rende compte. "
                 "Depuis combien de temps ça dure, et quels sont les 2 ou 3 déclencheurs les plus fréquents ?")
        nxt = "ask_question"
    elif any(k in m for k in ["procrastin", "motivation", "habitude", "routine"]):
        reply = ("La procrastination est rarement un problème de volonté, souvent une émotion évitée. "
                 "Quelle tâche repoussez-vous le plus souvent, et que ressentez-vous juste avant de la reporter ?")
        nxt = "ask_question"
    elif any(k in m for k in ["triste", "déprim", "désesp", "sucid", "mourir", "automutil"]):
        reply = ("Je suis content que vous en parliez ici. Je ne suis pas un professionnel de santé et je ne peux pas "
                 "diagnostiquer ni accompagner une détresse sévère — parlez-en à un professionnel qualifié ou à une ligne "
                 "d'écoute proche de chez vous le plus vite possible. Je peux vous aider à préparer votre démarche. En attendant, êtes-vous en sécurité maintenant ?")
        nxt = "escalate"
    else:
        reply = (f"Merci pour ce partage, {first}. Pour vous aider utilement, j'ai besoin d'un peu de contexte : "
                 "qu'est-ce qui vous amène aujourd'hui — et qu'est-ce qui, concrètement, se mettrait bien en place si tout se passait bien ?")
        nxt = "ask_question"

    return {"reply": reply, "next_action": nxt, "source": "demo_coach", "langflow": False}


async def ask_langflow(user_id: str, message: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Appel HTTP synchrone du flux Langflow 1.7 (POST /api/v1/run/{flow_id}).

    input_value = enveloppe complète avec authorized_context (contrat du Supervisor).
    """
    if not config.langflow_enabled():
        return None
    user_doc = db.users.find_one({"userId": user_id}) or {}
    profile = db.profiles.find_one({"userId": user_id}) or {}
    consents = {c["consentType"]: c.get("granted", False) for c in db.consents.find({"userId": user_id})}
    url = f"{config.LANGFLOW_URL}/api/v1/run/{config.LANGFLOW_FLOW_ID}"
    headers = {"Authorization": f"Bearer {config.LANGFLOW_API_KEY}", "Content-Type": "application/json"}
    input_value = json.dumps({
        "authorized_context": {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "language": profile.get("language") or user_doc.get("language") or "fr",
            "coaching_style": profile.get("coachingStyle") or "supportive",
            "consent_flags": consents,
        },
        "user_message": message,
    }, ensure_ascii=False)
    payload = {"input_value": input_value, "input_type": "chat", "output_type": "chat", "session_id": conversation_id}
    async with httpx.AsyncClient(timeout=config.LANGFLOW_TIMEOUT_SECONDS) as client:
        resp = await client.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    return _parse_langflow_response(resp.json(), source='langflow')


async def ask_flow(name: str, user_message: str, user_id: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Generic helper — call any flow by its env name (supervisor, self_discovery, …)."""
    url = config.flow_url(name)
    token = config.flow_token(name)
    if not (url and token):
        return None
    user_doc = db.users.find_one({"userId": user_id}) or {}
    profile = db.profiles.find_one({"userId": user_id}) or {}
    consents = {c["consentType"]: c.get("granted", False) for c in db.consents.find({"userId": user_id})}
    payload = {
        "input_value": json.dumps({
            "authorized_context": {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "language": profile.get("language") or user_doc.get("language") or "fr",
                "coaching_style": profile.get("coachingStyle") or "supportive",
                "consent_flags": consents,
                "email": user_doc.get("email"),
                "fullName": user_doc.get("fullName"),
            },
            "user_message": user_message,
        }, ensure_ascii=False),
        "input_type": "chat",
        "output_type": "chat",
        "session_id": conversation_id,
    }
    headers = {"Authorization": token, "Content-Type": "application/json", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=config.LANGFLOW_TIMEOUT_SECONDS) as client:
        resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code >= 400:
        return None
    return _parse_langflow_response(resp.json(), source=name)


async def ask_agentic_pipeline(user_id: str, message: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Backwards-compatible — call supervisor flow via env config."""
    if not config.analysis_enabled():
        return None
    url = config.flow_url('supervisor')
    token = config.flow_token('supervisor')
    if url and token:
        return await ask_flow('supervisor', message, user_id, conversation_id)
    # Fallback to legacy ANALYSIS_API_URL/TOKEN if supervisor-specific not set
    if not config.ANALYSIS_API_URL:
        return None
    user_doc = db.users.find_one({"userId": user_id}) or {}
    profile = db.profiles.find_one({"userId": user_id}) or {}
    consents = {c["consentType"]: c.get("granted", False) for c in db.consents.find({"userId": user_id})}
    input_value = json.dumps({
        "authorized_context": {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "language": profile.get("language") or user_doc.get("language") or "fr",
            "coaching_style": profile.get("coachingStyle") or "supportive",
            "consent_flags": consents,
            "email": user_doc.get("email"),
            "fullName": user_doc.get("fullName"),
        },
        "user_message": message,
    }, ensure_ascii=False)
    async with httpx.AsyncClient(timeout=config.LANGFLOW_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            config.ANALYSIS_API_URL,
            json={"input_value": input_value, "input_type": "chat", "output_type": "chat", "session_id": conversation_id},
            headers={"Authorization": config.ANALYSIS_API_TOKEN, "Content-Type": "application/json", "Accept": "application/json"},
        )
    if resp.status_code >= 400:
        # Return None so caller can fall back gracefully
        return None
    return _parse_langflow_response(resp.json(), source='agentic_public')


def _extract_langflow_text(data: dict[str, Any]) -> Optional[str]:
    """Langflow 1.7 /run shapes: ChatOutput → results.message.text ; TextOutput → results.text.data.text."""
    try:
        outputs = data.get("outputs", [])
        results = (outputs[0].get("outputs") or [{}])[0].get("results") or {}
        # ChatOutput
        msg = results.get("message")
        if isinstance(msg, dict):
            t = msg.get("text")
            if t:
                return t
        # TextOutput / generic: scan dict values for a usable .text
        for v in results.values():
            if not isinstance(v, dict):
                continue
            t = (v.get("data") or {}).get("text") if isinstance(v.get("data"), dict) else None
            t = t or v.get("text") or (v.get("message") or {}).get("text")
            if t:
                return t
    except Exception:
        pass
    return None


def _parse_langflow_response(data: dict[str, Any], source: str) -> dict[str, Any]:
    """Parse a Langflow-style /run response into the Evolve reply shape."""
    text = _extract_langflow_text(data) or data.get("output") or data.get("text") or data.get("message")
    if not text:
        raise ValueError("Réponse vide ou format non reconnu (pipeline).")
    return {"reply": text, "next_action": "await_user", "source": source, "langflow": True}



# ───────────────────────── Auth (compte obligatoire) ─────────────────────────

@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn):
    email = body.email.lower()
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email.")
    user_id = new_user_id()
    user_doc = {
        "userId": user_id,
        "email": email,
        "fullName": body.fullName.strip(),
        "language": body.language,
        "passwordHash": hash_password(body.password),
        "createdAt": utcnow(),
        "updatedAt": utcnow(),
    }
    db.users.insert_one(user_doc)
    db.profiles.update_one(
        {"userId": user_id},
        {"$setOnInsert": {"userId": user_id, "coachingStyle": "supportive", "bio": "", "createdAt": utcnow()}},
        upsert=True,
    )
    for consent_type in ["longTermMemory", "cvAnalysis", "pdfReports"]:
        db.consents.update_one(
            {"userId": user_id, "consentType": consent_type},
            {"$setOnInsert": {"userId": user_id, "consentType": consent_type, "granted": consent_type != "cvAnalysis", "updatedAt": utcnow()}},
            upsert=True,
        )
    token = create_token(user_id, email)
    return {"token": token, "user": public_user(user_doc)}


@app.post("/api/auth/login")
def login(body: LoginIn):
    user = db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    return {"token": create_token(user["userId"], user["email"]), "user": public_user(user)}


@app.get("/api/me")
def me(current=Depends(get_current_user)):
    user = db.users.find_one({"userId": current["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    return {"user": public_user(user)}


# ───────────────────────── Dashboard ─────────────────────────

@app.get("/api/dashboard")
def dashboard(current=Depends(get_current_user)):
    uid = current["sub"]
    active_goals = list(db.goals.find({"userId": uid, "status": "active"}).sort("createdAt", -1).limit(3))
    active_habits = list(db.habits.find({"userId": uid, "active": True}).limit(5))
    latest_assessment = db.assessments.find_one({"userId": uid}, sort=[("createdAt", -1)])
    latest_gap = db.gap_reports.find_one({"userId": uid}, sort=[("createdAt", -1)])
    objective = db.career_objectives.find_one({"userId": uid}, {"_id": 0})

    habit_stats = []
    for h in active_habits:
        logs = list(db.habit_logs.find({"userId": uid, "habitId": h["_id"]}).sort("date", -1).limit(30))
        done = sum(1 for l in logs if l.get("done"))
        expected = 30 if h.get("frequency") == "daily" else max(1, 30 // 7) * int(h.get("target", 1))
        habit_stats.append({"id": str(h["_id"]), "name": h["name"], "consistency": min(100, round(done / max(1, expected) * 100))})

    return {
        "goals": [{"id": str(g["_id"]), "title": g["title"], "priority": g.get("priority"), "deadline": g.get("deadline"), "successMeasure": g.get("successMeasure")} for g in active_goals],
        "habits": habit_stats,
        "latestAssessment": ({"skill": latest_assessment["skill"], "totalScore": latest_assessment["totalScore"], "maxScore": latest_assessment["maxScore"], "createdAt": latest_assessment["createdAt"].isoformat()} if latest_assessment else None),
        "matchScore": latest_gap["matchScore"] if latest_gap else None,
        "objective": objective,
    }


@app.get("/api/goals")
def list_goals(current=Depends(get_current_user)):
    goals = list(db.goals.find({"userId": current["sub"]}).sort("createdAt", -1).limit(50))
    return {"goals": [{
        "id": str(g["_id"]), "title": g["title"], "description": g.get("description", ""),
        "successMeasure": g.get("successMeasure"), "deadline": g.get("deadline"),
        "priority": g.get("priority"), "status": g.get("status"),
        "milestonesDone": sum(1 for m in g.get("milestones", []) if m.get("done")),
        "milestonesTotal": len(g.get("milestones", [])),
    } for g in goals]}


# ───────────────────────── Chat (message → Langflow) ─────────────────────────

@app.post("/api/chat")
async def chat(body: ChatIn, current=Depends(get_current_user)):
    uid = current["sub"]
    now = utcnow()

    if body.conversationId:
        try:
            conv = db.conversations.find_one({"_id": ObjectId(body.conversationId), "userId": uid})
        except InvalidId:
            raise HTTPException(status_code=400, detail="conversationId invalide.")
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation introuvable.")
        conversation_id = str(conv["_id"])
    else:
        conv = db.conversations.insert_one({"userId": uid, "title": body.message[:80], "createdAt": now, "updatedAt": now}).inserted_id
        conversation_id = str(conv)

    db.messages.insert_one({"conversationId": conversation_id, "userId": uid, "role": "user", "content": body.message, "createdAt": now})

    history = list(db.messages.find({"conversationId": conversation_id, "userId": uid}).sort("createdAt", 1).limit(12))

    clean_message, injection_flag = sanitize_message(body.message)
    if injection_flag:
        db.agent_executions.insert_one({"userId": uid, "flowName": "supervisor", "taskId": None, "tools": [], "status": "blocked", "durationMs": None, "notes": "prompt-injection hints flagged", "createdAt": utcnow()})
    user_doc = db.users.find_one({"userId": uid})
    full_name = (user_doc or {}).get("fullName", "")

    # Pipeline preference: public agentic (staging, same pattern as S7) → local Langflow → demo coach
    result = None
    result = await ask_agentic_pipeline(uid, clean_message, conversation_id)
    if result is None:
        try:
            result = await ask_langflow(uid, clean_message, conversation_id)
        except Exception:
            result = None  # Langflow configuré mais en échec → on bascule sur le coach de démo
    if result is None:
        result = demo_coach_reply(clean_message, full_name, history)

    db.messages.insert_one({
        "conversationId": conversation_id, "userId": uid, "role": "assistant",
        "content": result["reply"], "source": result["source"], "nextAction": result["next_action"], "createdAt": utcnow(),
    })
    db.conversations.update_one({"_id": ObjectId(conversation_id)}, {"$set": {"updatedAt": utcnow()}})
    db.agent_executions.insert_one({"userId": uid, "flowName": "Supervisor", "taskId": None, "tools": [result["source"]], "status": "ok", "durationMs": None, "createdAt": utcnow()})

    return {"conversationId": conversation_id, **result}


@app.get("/api/chat/{conversation_id}")
def chat_history(conversation_id: str, current=Depends(get_current_user)):
    msgs = list(db.messages.find({"conversationId": conversation_id, "userId": current["sub"]}).sort("createdAt", 1).limit(100))
    return {"messages": [{"role": m["role"], "content": m["content"], "createdAt": m["createdAt"].isoformat()} for m in msgs]}


# ───────────────────────── CV (upload optionnel — proxy LangGraph) ─────────────────────────

import httpx
from bson import Binary
from fastapi import File, Form, UploadFile
from fastapi.responses import Response


@app.post("/api/career/cv", status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile = File(...),
    language: str = Form("unknown"),
    current=Depends(get_current_user),
):
    uid = current["sub"]
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 8 Mo).")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{config.CV_SERVICE_URL}/ingest",
            data={"user_id": uid, "language": language, "filename": file.filename or "cv"},
            files={"file": (file.filename or "cv", raw, file.content_type or "application/octet-stream")},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.json().get("detail", "CV service: échec"))
    return resp.json()


@app.get("/api/career/cv/{cv_id}/file")
def download_cv(cv_id: str, current=Depends(get_current_user)):
    uid = current["sub"]
    oid = ObjectId(cv_id) if ObjectId.is_valid(cv_id) else None
    if not oid:
        raise HTTPException(status_code=400, detail="cv_id invalide.")
    doc = db.cvs.find_one({"_id": oid, "userId": uid}, {"fileBinary": 1, "fileName": 1, "contentType": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="CV introuvable.")
    data = doc.get("fileBinary")
    if not data:
        raise HTTPException(status_code=404, detail="Fichier original non stocké (CV trop volumineux ou ingéré sans fichier original).")
    return Response(
        content=bytes(data),
        media_type=doc.get("contentType") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.get("fileName", "cv")}"'},
    )


@app.delete("/api/career/cv/{cv_id}")
async def delete_cv_endpoint(cv_id: str, current=Depends(get_current_user)):
    uid = current["sub"]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(f"{config.CV_SERVICE_URL}/cvs/{uid}/{cv_id}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.json().get("detail", "CV service: échec"))
    return resp.json()


# ───────────────────────── Santé ─────────────────────────

@app.get("/api/health")
def health():
    db.client.admin.command("ping")
    return {"ok": True, "db": config.DATABASE_NAME, "langflowConfigured": config.langflow_enabled()}


# ───────── Rapport de développement (gap report → PDF) ─────────
# Imported here so app.reports can import get_current_user from this module.
from . import reports  # noqa: E402

app.include_router(reports.router, prefix='/api')
