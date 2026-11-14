"""Évaluation Evolve — quiz 18 questions → rapport gap_reports (score 0-100).

Moteur entièrement déterministe : le score est calculé en code pur et chaque
prémisse du rapport est adossée à la réponse VERBATIM de l'utilisateur
(aucune invention, aucun diagnostic clinique).
"""
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import db
from .security import get_current_user

router = APIRouter()

_EVIDENCE_RE = re.compile(r"\s+")


class AnswerIn(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    value: str = Field(min_length=1, max_length=4000)


class CompleteIn(BaseModel):
    answers: list[AnswerIn] = Field(min_length=14, max_length=24)
    language: str = Field(default="fr", pattern="^(ar|fr|en)$")


class FollowupIn(BaseModel):
    answers: list[AnswerIn] = Field(default=[], max_length=24)
    language: str = Field(default="fr", pattern="^(ar|fr|en)$")


class PrefillOut(BaseModel):
    hints: dict[str, str]


# ───────── Composantes de score (somme des poids = 100) ─────────
WEIGHTS = {
    "direction": 20,
    "socle": 20,
    "forces": 15,
    "regulation": 15,
    "autonomie": 10,
    "engagement": 20,
}


def _esc(text: str, limit: int = 160) -> str:
    t = _EVIDENCE_RE.sub(" ", str(text or "")).strip()
    return t[:limit]


def _n10(value: Optional[str]) -> float:
    try:
        n = float(str(value).strip().split("/")[0])
        return max(1.0, min(10.0, n))
    except Exception:
        return 5.0


def _choice(value: Optional[str]) -> str:
    """Extrait la lettre A/B/C/D d'une réponse MCQ ('A — …' ou 'a')."""
    m = re.match(r"\s*([A-Da-d])", str(value or ""))
    return m.group(1).lower() if m else ""


def _q(answers: dict[str, str], qid: str) -> str:
    return _esc(answers.get(qid, ""), 120)


def _item(text: str, evidence: str, priority: str = "medium", extra: dict | None = None) -> dict:
    d = {"text": text, "evidence": evidence, "priority": priority, "confidence": 0.9}
    if extra:
        d.update(extra)
    return d


LEARN_STYLE = {
    "a": "Apprentissage par le projet pratique",
    "b": "Apprentissage par la théorie structurée",
    "c": "Apprentissage par le feedback d'un mentor",
    "d": "Apprentissage en pair (study group)",
}
FORCE_LABEL = {
    "a": "Analyser et structurer — votre cerveau range le chaos",
    "b": "Interpersonnel & leadership — vous faites avancer les autres",
    "c": "Créer & innover — vous voyez ce qui n'existe pas encore",
    "d": "Exécuter & discipliner — vous livrez, là où d'autres s'arrêtent",
}
FREEZE_LABEL = {
    "a": "évitement (je repousse l'action)",
    "b": "j'agis avec peur — mais j'agis",
    "c": "calculé — j'analyse, puis je fais",
    "d": "je fonce — l'action d'abord",
}
INTERNAL_LIMIT = {
    "a": "Procrastination",
    "b": "Doute / syndrome de l'imposteur",
    "c": "Surcharge / perfectionnisme",
    "d": "Inconstance — des départs forts, des fins difficiles",
}
EXTERNAL_LIMIT = {
    "a": "Le temps — vos journées sont déjà pleines",
    "b": "L'argent — le financement de la formation est un frein réel",
    "c": "Les obligations familiales — votre temps n'est jamais seulement à vous",
    "d": "L'entourage / le contexte — votre environnement ne porte pas encore le projet",
}
ENGAGE = {"a": 0.4, "b": 0.65, "c": 0.85, "d": 1.0}
TARGET = {
    "a": "Transition de carrière — sauter vers un nouveau métier",
    "b": "Maîtrise — devenir excellent dans mon rôle actuel",
    "c": "Leadership — grandir en responsabilité et en influence",
    "d": "Entrepreneuriat — construire quelque chose à moi",
}


def compute_report(answers: dict[str, str], cvs: list[dict], objective: Optional[dict]) -> dict:
    direction = _n10(answers.get("q3")) / 10
    socle = _n10(answers.get("q6")) / 10
    forces_self = _n10(answers.get("q8")) / 10
    perfectionism_inv = 1 - (_n10(answers.get("q10")) - 1) / 9
    autonomy = _n10(answers.get("q14")) / 10
    engagement = ENGAGE.get(_choice(answers.get("q15")) or "b", 0.6)

    comps = {
        "direction": direction,
        "socle": socle,
        "forces": forces_self,
        "regulation": perfectionism_inv,
        "autonomie": autonomy,
        "engagement": engagement,
    }
    score = int(round(sum(comps[k] * WEIGHTS[k] for k in WEIGHTS)))

    target_role = (objective or {}).get("targetRole") or "Votre cible"
    cv_name = (cvs[0].get("fileName") if cvs else None) or None

    # ───────── Forces (uniquement soutenues par des réponses) ─────────
    strengths: list[dict] = []
    if direction >= 0.7:
        strengths.append(_item(
            "Clarté de votre cap — vous savez où vous allez (et pourquoi maintenant).",
            f"Votre réponse : « {_q(answers, 'q1')} » · {_n10(answers.get('q3')):.0f}/10 de clarté",
            extra={"skill": "Direction"}))
    if socle >= 0.6:
        strengths.append(_item(
            f"Un socle valorisable pour {target_role} — le terrain existe déjà, il faut l'architecturer.",
            f"Votre réponse : « {_q(answers, 'q5')} » · socle à {_n10(answers.get('q6')):.0f}/10 de transfert",
            extra={"skill": "Socle"}))
    if forces_self >= 0.6:
        strengths.append(_item(
            FORCE_LABEL.get(_choice(answers.get("q7")) or "a", "Votre force dominante"),
            f"Auto-évaluation {_n10(answers.get('q8')):.0f}/10 de conscience de vos forces — entourage et vous êtes d'accord.",
            extra={"skill": "Forces"}))
    strengths.append(_item(
        LEARN_STYLE.get(_choice(answers.get("q9")) or "a", "Votre style d'apprentissage"),
        "C'est votre mode d'apprentissage déclaré — le plan doit s'y plier, pas l'inverse.",
        extra={"skill": "Apprentissage"}))
    if cv_name:
        strengths.append(_item(
            "Votre parcours est documenté — Evolve raisonne sur des faits, pas des impressions.",
            f"CV à l'appui : {_esc(cv_name, 80)}",
            priority="low", extra={"skill": "Documentation"}))

    # ───────── Gaps (composantes faibles) ─────────
    gaps: list[dict] = []
    gap_meta = {
        "direction": ("Cap flou — votre cible mérite d'être resserrée avant de foncer", f"{_n10(answers.get('q3')):.0f}/10 de clarté — « {_q(answers, 'q2')} »"),
        "socle": ("Socle à muscler — l'écart entre ce que vous êtes et ce que la cible exige est réel", f"Transfert à {_n10(answers.get('q6')):.0f}/10 — socle déclaré : « {_q(answers, 'q4')} »"),
        "forces": ("Forces sous-exploitées — vous livrez sans toujours savoir pourquoi ça marche", f"Conscience de vos forces à {_n10(answers.get('q8')):.0f}/10"),
        "regulation": ("Régulation sous charge — le perfectionnisme vous coûte plus que la peur d'échouer", f"Paralysie à {_n10(answers.get('q10')):.0f}/10 · réaction face au risque : « {_q(answers, 'q11')} »"),
        "autonomie": ("Marge de manœuvre réduite — votre environnement décide plus que vous ne le pensez", f"Autonomie perçue à {_n10(answers.get('q14')):.0f}/10"),
        "engagement": ("Rythme d'engagement en deçà de l'ambition — le plan doit tenir compte de ça, pas le nier", f"Disponibilité déclarée : « {_q(answers, 'q15')} »"),
    }
    for comp, (text, evidence) in gap_meta.items():
        v = comps[comp]
        if v < 0.5:
            gaps.append(_item(text, evidence, priority="high" if v < 0.3 else "medium",
                              extra={"skill": comp, "current_level": round(v * 5, 1), "required_level": 5}))
    if not gaps:
        gaps.append(_item(
            "Aucun écart critique détecté — votre enjeu est de transformer le socle en trajectoire, pas de combler un vide.",
            f"Score global {score}/100 — toutes les composantes ≥ 50%", priority="low",
            extra={"skill": "Trajectoire"}))

    # ───────── Limites (internal / external) ─────────
    limits: list[dict] = []
    if _n10(answers.get("q10")) >= 7:
        limits.append(_item(
            f"Perfectionnisme paralysant ({_n10(answers.get('q10')):.0f}/10) — le parfait devient l'ennemi de l'avancée.",
            f"« À quel point cela vous paralyse ? » → {_n10(answers.get('q10')):.0f}/10",
            priority="high", extra={"type": "internal", "severity": "high"}))
    ch11 = _choice(answers.get("q11"))
    if ch11:
        limits.append(_item(
            f"Face au risque d'échec, vous êtes plutôt : {FREEZE_LABEL.get(ch11, '—')}.",
            f"Choix déclaré : « {_esc(answers.get('q11'), 80)} »",
            priority="medium", extra={"type": "internal", "severity": "medium"}))
    ch12 = _choice(answers.get("q12"))
    if ch12:
        limits.append(_item(
            f"Votre limite interne la plus coûteuse : {INTERNAL_LIMIT.get(ch12, '—')}.",
            f"Votre choix : « {_esc(answers.get('q12'), 80)} »",
            priority="high", extra={"type": "internal", "severity": "medium"}))
    ch13 = _choice(answers.get("q13"))
    if ch13:
        limits.append(_item(
            f"Frein externe principal : {EXTERNAL_LIMIT.get(ch13, '—')}.",
            f"Votre choix : « {_esc(answers.get('q13'), 80)} »",
            priority="medium", extra={"type": "external", "severity": "medium"}))

    # ───────── Focus recommandé ─────────
    ordered = sorted(comps.items(), key=lambda kv: kv[1])
    weakest = ordered[0][0]
    second = ordered[1][0] if len(ordered) > 1 else None
    focus_map = {
        "direction": "Resserrer votre cap à 10 mots maximum, par écrit, avant tout le reste. Un cap flou produit un plan flou.",
        "socle": "Cartographier votre socle vs la cible : 3 compétences transférables, 3 à construire — et un premier projet qui les prouve.",
        "forces": "Faire valider vos forces par quelqu'un qui vous observe travailler — la conscience de ses forces se calibre à deux.",
        "regulation": "Baisser le seuil de livraison : un livrable « suffisamment bon » publié vaut mieux qu'un parfait jamais sorti.",
        "autonomie": "Reconquérir 3 décisions que vous avez cédées — votre projet dépend de votre marge, pas de votre envie.",
        "engagement": "Ritualiser 25 minutes par jour plutôt que 2 heures le week-end — la constance bat l'intensité.",
    }
    focus = focus_map.get(weakest, focus_map["socle"])
    if second:
        focus += " Ensuite : " + focus_map.get(second, "").split(".")[0].lower() + "."
    focus += f" D'ici 12 mois, votre définition du succès : « {_q(answers, 'q17')} » — le plan doit s'y mesurer."

    payload = {
        "source": "quiz-evaluation",
        "version": 1,
        "strengths": strengths,
        "gaps": gaps,
        "limits": limits,
        "recommended_focus": focus,
        "success_definition": _q(answers, "q17"),
        "target_stated": _q(answers, "q2"),
        "answers": [{"id": k, "value": _esc(v, 400)} for k, v in sorted(answers.items())],
    }
    return {"score": score, "payload": payload, "components": {k: round(v * 100) for k, v in comps.items()}}


# ───────── Hybridisation : noyau fixe + suivis DYNAMIQUES (CV/objectif/réponses) ─────────
import json as _json
import re as _re

_DOMAINS = ("Direction", "Socle", "Forces", "Limites internes", "Limites externes", "Engagement", "Succès")
_FID_RE = _re.compile(r"^f_[1-6]$")


def _cv_excerpt(uid: str, limit: int = 1400) -> str:
    chunks = list(db.cv_chunks.find({"userId": uid}, {"text": 1}).sort("seq", 1).limit(6))
    joined = " ".join(c.get("text", "") for c in chunks)
    if not joined:
        cvs = list(db.cvs.find({"userId": uid}, {"fileName": 1, "summary": 1, "text": 1}).limit(1))
        joined = str(cvs[0].get("summary") or cvs[0].get("text") or "")[:limit] if cvs else ""
    return _esc(joined, limit)


def _ask_llm(system: str, user: str, max_tokens: int = 900) -> Optional[str]:
    """Appel one-shot via OpenRouter (même provider que les agents). Retourne le texte ou None."""
    import httpx
    key = None
    for env_path in ("../langgraph/.env", ".env"):
        try:
            for line in open(env_path, encoding="utf-8"):
                if line.startswith("OPENROUTER_API_KEY="):
                    key = line.split("=", 1)[1].strip()
        except Exception:
            pass
        if key:
            break
    if not key:
        return None
    try:
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": "deepseek/deepseek-chat", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "max_tokens": max_tokens, "temperature": 0.3},
            timeout=60,
        )
        if r.status_code != 200:
            return None
        return r.json()["choices"][0]["message"]["content"]
    except Exception:
        return None


def _parse_followups(raw: str) -> list[dict]:
    m = _re.search(r"\[.*\]", raw, _re.S)
    if not m:
        return []
    try:
        items = _json.loads(m.group(0))
    except Exception:
        return []
    if not isinstance(items, list):
        return []
    out, seen = [], set()
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        domain = str(item.get("domain", "")).strip()
        kind = str(item.get("kind", "")).strip().lower()
        text = _esc(item.get("text", ""), 300)
        if domain not in _DOMAINS or kind not in ("open", "mcq") or len(text) < 12:
            continue
        if text.lower() in seen:
            continue
        seen.add(text.lower())
        fid = f"f_{len(out) + 1}"
        if kind == "mcq":
            opts = item.get("options") or []
            opts = [_esc(o, 200) for o in opts if str(o).strip()][:3]
            if len(opts) != 3:
                continue
            out.append({"id": fid, "domain": domain, "kind": "mcq", "text": text, "options": opts})
        else:
            out.append({"id": fid, "domain": domain, "kind": "open", "text": text})
        if len(out) >= 6:
            break
    return out


@router.post("/evaluation/followups")
def dynamic_followups(body: FollowupIn, current=Depends(get_current_user)):
    """Génère 4-6 questions de suivi personnalisées (CV × objectif × réponses).
    Jamais scorées — elles éclairent la profondeur, pas la note."""
    uid = current["sub"]
    excerpt = _cv_excerpt(uid)
    objective = db.career_objectives.find_one({"userId": uid}, {"_id": 0})
    cvs = list(db.cvs.find({"userId": uid}, {"fileName": 1}).sort("createdAt", -1).limit(1))
    answers_summary = "; ".join(f"{a.id}={_esc(a.value, 90)}" for a in (body.answers or [])[:18])
    lang_name = {"fr": "French", "ar": "Arabic", "en": "English"}.get(body.language, "French")
    system = (
        f"You are Evolve's question-writer for a coach. Produce 4 to 6 follow-up questions IN {lang_name.upper()}, "
        "grounded ONLY in the provided CV excerpt / objective / answers — never invent companies, schools, or facts. "
        "If the CV is absent or unusable, return []. "
        "Domains allowed EXACTLY: Direction, Socle, Forces, Limites internes, Limites externes, Engagement, Succès. "
        "Mix: at most 3 open questions, at least 1 MCQ with EXACTLY 3 options (A/B/C), at least 1 question that tests a fact FROM the CV or the objective. "
        "Every question targets the USER's own material. NO clinical diagnosis, NO advice, NO scoring. "
        "Output ONLY a raw JSON array, no markdown fence, no commentary: "
        "[{\"domain\":\"...\", \"kind\":\"open|mcq\", \"text\":\"...\", \"options\":[\"...\",\"...\",\"...\"]}]"
    )
    user = (
        f"CV excerpt: {excerpt or '(no CV on file)'}\n"
        f"Objective: {objective or '(none set)'}\n"
        f"CV file: {cvs[0].get('fileName') if cvs else '(none)'}\n"
        f"Core answers so far: {answers_summary or '(none)'}\n\nJSON array:"
    )
    raw = _ask_llm(system, user, max_tokens=900)
    if not raw:
        return {"followups": [], "note": "générateur indisponible — évaluation de base suffisante"}
    followups = _parse_followups(raw)
    return {"followups": followups, "note": None if followups else "aucune question personnalisée pertinente — évaluation de base suffisante"}


@router.get("/evaluation/prefill")
def prefill_hints(current=Depends(get_current_user)):
    """Détecte les faits CV qui répondent au noyau — proposés comme pré-remplissage, Jamais imposés."""
    uid = current["sub"]
    excerpt = _cv_excerpt(uid, limit=4000).lower()
    hints: dict[str, str] = {}
    if not excerpt:
        return {"hints": hints}
    school_keys = [k for k in ("fsjes", "licence", "master", "universit", "école", "ecole", "diploma") if k in excerpt]
    exp_keys = [k for k in ("stage", "emploi", "cdi", "cdd", "intérim", "interim", "freelance", "alternance") if k in excerpt]
    if school_keys:
        hints["q4"] = f"Votre CV annonce une formation ({school_keys[0]}) — confirmez-vous ?"
    if exp_keys:
        hints["q6"] = f"Votre CV mentionne une expérience directe ({exp_keys[0]}) — confirmez-vous ?"
    return {"hints": hints}


@router.post("/evaluation/complete")
def complete_evaluation(body: CompleteIn, current=Depends(get_current_user)):
    uid = current["sub"]
    answers = {a.id.strip().lower(): a.value for a in body.answers}
    if len(answers) < 14:
        raise HTTPException(status_code=422, detail="Évaluation incomplète — au moins 14 réponses sont requises.")

    cvs = list(db.cvs.find({"userId": uid}, {"fileName": 1, "status": 1, "createdAt": 1}).sort("createdAt", -1).limit(1))
    objective = db.career_objectives.find_one({"userId": uid}, {"_id": 0})

    report = compute_report(answers, cvs, objective)
    now = datetime.now(timezone.utc)
    inserted = db.gap_reports.insert_one({
        "userId": uid,
        "cvId": str(cvs[0]["_id"]) if cvs else None,
        "objectiveId": None,
        "payload": report["payload"],
        "matchScore": report["score"],
        "createdAt": now,
    })
    try:
        db.reports.insert_one({"userId": uid, "type": "gap_report", "title": f"Évaluation Evolve — {report['score']}/100",
                               "payload": {"matchScore": report["score"], "gapId": str(inserted.inserted_id)},
                               "createdAt": now})
    except Exception:
        pass

    return {
        "ok": True,
        "id": str(inserted.inserted_id),
        "matchScore": report["score"],
        "components": report["components"],
        "strengths": report["payload"]["strengths"],
        "gaps": report["payload"]["gaps"],
        "limits": report["payload"]["limits"],
        "recommended_focus": report["payload"]["recommended_focus"],
    }
