"""Plan 30/60/90 — généré depuis le DERNIER gap_report de l'utilisateur.
Brouillon NON enregistré. L'approbation explicite seule crée les goals.
Chaque goal est rattaché à une gap + sa preuve. Ressources vérifiées uniquement."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import db
from .security import get_current_user

router = APIRouter()

LOOKUP = [
    ("sql", [{"title": "Mode Analytics — SQL Tutorial", "url": "https://mode.com/sql-tutorial/", "type": "article"},
             {"title": "Kaggle Learn — Intro to SQL", "url": "https://www.kaggle.com/learn", "type": "course"}]),
    ("python", [{"title": "Kaggle Learn — Pandas & Python", "url": "https://www.kaggle.com/learn", "type": "course"},
                {"title": "Python for Data Analysis (Wes McKinney, O'Reilly)", "url": None, "type": "book"}]),
    ("pandas", [{"title": "Kaggle Learn — Pandas & Python", "url": "https://www.kaggle.com/learn", "type": "course"}]),
    ("excel", [{"title": "Microsoft — Excel training (support.microsoft.com)", "url": "https://support.microsoft.com/fr-fr/excel", "type": "article"}]),
    ("perfectionn", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("procrastin", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("régul", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("direction", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("socle", [{"title": "Kaggle Learn — Pandas & Python", "url": "https://www.kaggle.com/learn", "type": "course"}]),
    ("engagement", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("apprentissage", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
    ("autonomie", [{"title": "Coursera — Learning How to Learn (McMaster)", "url": "https://www.coursera.org/learn/learning-how-to-learn", "type": "course"}]),
]

PLATFORMS = [
    {"title": "Chercher sur Coursera", "url": "https://www.coursera.org", "type": "platform"},
    {"title": "Chercher sur OpenClassrooms", "url": "https://openclassrooms.com", "type": "platform"},
    {"title": "Chercher sur Kaggle Learn", "url": "https://www.kaggle.com/learn", "type": "platform"},
]


FRIENDLY = {
    "regulation": ("Réduire la surcharge & le perfectionnisme", "perfectionn"),
    "direction": ("Clarifier votre cap & votre pourquoi", "direction"),
    "socle": ("Muscler votre socle transférable", "socle"),
    "forces": ("Exploiter pleinement vos forces", "apprentissage"),
    "autonomie": ("Reprendre la main sur votre marge de manœuvre", "autonomie"),
    "engagement": ("Installer un rythme hebdomadaire réaliste", "engagement"),
}


def _resources_for(skill: str) -> list[dict]:
    s = (skill or "").lower()
    hits = []
    for needle, res in LOOKUP:
        if needle in s:
            hits.extend(res)
    if hits:
        # déduplique en gardant l'ordre
        seen, out = set(), []
        for r in hits:
            key = r["title"]
            if key not in seen:
                seen.add(key); out.append(r)
        return out[:3]
    return [dict(p, why=f"Cherchez « {skill} » — aucun cours vérifié en stock pour ce sujet") for p in PLATFORMS[:1]]


def _draft_from_report(uid: str) -> dict:
    gap = db.gap_reports.find_one({"userId": uid}, sort=[("createdAt", -1)])
    if not gap:
        raise HTTPException(status_code=404, detail="Aucun rapport — passez d'abord l'évaluation Evolve.")
    payload = gap.get("payload") or {}
    objective = db.career_objectives.find_one({"userId": uid}, {"_id": 0}) or {}
    horizon_m = int(objective.get("horizonMonths") or 12)
    weekly_h = int(objective.get("weeklyHours") or 5)
    target = (objective.get("targetRole") or "votre cible").strip()
    gaps = payload.get("gaps") or []
    # gap priorité haute d'abord, puis moyenne ; on prend max 3
    def prio(g):
        p = str(g.get("priority", "medium")).lower() if isinstance(g, dict) else "medium"
        return {"high": 0, "medium": 1, "low": 2}.get(p, 1)
    ordered = sorted((g for g in gaps if isinstance(g, dict)), key=prio)[:3]
    goals = []
    for i, g in enumerate(ordered):
        skill = str(g.get("skill") or g.get("text") or f"gap {i + 1}")[:80]
        skill_key = skill.split(" — ")[0].split("(")[0].strip() or skill[:60]
        friendly, probe = FRIENDLY.get(skill_key.lower(), (skill_key[:60], skill))
        res = _resources_for(probe)
        chunk = ["S1-4", "S5-8", "S9-12"][i] if i < 3 else "S9-12"
        milestones = [
            f"Semaine 1 — {min(weekly_h, 3)}h : {res[0]['title'].split(' — ')[0]} — diagnostic honnête de départ",
            f"Semaine {2 if i == 0 else 6 if i == 1 else 10} — {weekly_h}h : un livrable concret prouvant « {friendly} »",
            f"Semaine {4 if i == 0 else 8 if i == 1 else 12} — bilan mesuré du progrès sur « {friendly} »",
        ]
        success = f"Livrable mesurable sur « {friendly} » + auto-évaluation avant/après (échelle 1–10)"
        goals.append({
            "title": friendly,
            "phase": ["30 jours", "60 jours", "90 jours"][i] if i < 3 else "90 jours",
            "successMeasure": success,
            "deadlineDays": [30, 60, 90][i],
            "priority": "high" if prio(g) == 0 else "medium",
            "linkedGap": skill_key,
            "milestones": milestones,
            "resources": res,
            "gap_evidence": str(g.get("evidence") or "")[:180],
        })
    generated = datetime.now(timezone.utc)
    return {
        "draft": True,
        "plan_title": f"Plan Evolve — {target} (horizon {horizon_m} mois · {weekly_h} h/semaine)",
        "targetRole": objective.get("targetRole"),
        "horizonMonths": horizon_m,
        "weeklyHours": weekly_h,
        "success_definition": payload.get("success_definition") or "",
        "matchScore": gap.get("matchScore"),
        "goals": goals,
        "generatedAt": generated.isoformat(),
        "source": "gap_report",
    }


@router.post("/plan/draft")
def plan_draft(current=Depends(get_current_user)):
    uid = current["sub"]
    return _draft_from_report(uid)


class ApproveGoalIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    successMeasure: str = Field(min_length=3, max_length=300)
    deadlineDays: int = Field(ge=7, le=365)
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    linkedGap: Optional[str] = Field(default=None, max_length=100)
    phase: Optional[str] = Field(default=None, max_length=20)
    milestones: list[str] = Field(default=[], max_length=12)


class ApproveIn(BaseModel):
    goals: list[ApproveGoalIn] = Field(min_length=1, max_length=6)


@router.post("/plan/approve")
def plan_approve(body: ApproveIn, current=Depends(get_current_user)):
    uid = current["sub"]
    now = datetime.now(timezone.utc)
    created = []
    for g in body.goals:
        deadline = (now + timedelta(days=int(g.deadlineDays))).strftime("%Y-%m-%d")
        doc = {
            "userId": uid,
            "title": g.title.strip(),
            "description": f"Plan Evolve — phase {g.phase or ''}".strip(),
            "successMeasure": g.successMeasure.strip(),
            "deadline": deadline,
            "priority": g.priority,
            "linkedGap": (g.linkedGap or "").strip() or None,
            "status": "active",
            "milestones": [{"title": m.strip(), "done": False, "createdAt": now} for m in g.milestones if m.strip()][:8],
            "createdAt": now,
            "approved": True,
            "source": "plan_30_60_90",
        }
        r = db.goals.insert_one(doc)
        created.append({"id": str(r.inserted_id), "title": doc["title"], "deadline": deadline})
    return {"ok": True, "created": created}
