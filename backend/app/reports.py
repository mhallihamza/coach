"""Rapport de développement — rendu PDF depuis les données gap_reports de l'utilisateur."""
import io
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle

from . import db
from .main import get_current_user

router = APIRouter()

FOREST = HexColor('#103b2a')
PINE = HexColor('#175c3d')
PAPER = HexColor('#faf8f2')
INK_SOFT = HexColor('#5a5f5a')
GOLD = HexColor('#c6a04e')
CLAY = HexColor('#c2573b')
LINE = HexColor('#e3dfd2')

_H1 = ParagraphStyle('h1', fontName='Times-Bold', fontSize=25, leading=30, textColor=FOREST)
_H3 = ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=PINE, spaceBefore=10, spaceAfter=4, textTransform='uppercase')
_BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=9.5, leading=14.5, textColor=HexColor('#141715'))
_SOFT = ParagraphStyle('soft', fontName='Helvetica', fontSize=8.5, leading=12, textColor=INK_SOFT)
_NUM = ParagraphStyle('num', fontName='Times-Bold', fontSize=52, leading=54, textColor=FOREST)


def _fmt_date(dt) -> str:
    try:
        return dt.strftime('%d/%m/%Y à %H:%M') if hasattr(dt, 'strftime') else str(dt)[:16]
    except Exception:
        return str(dt)[:16]


def _as_list(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def _item_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        for k in ('text', 'title', 'label', 'name', 'gap', 'strength', 'limit', 'pattern', 'item', 'skill'):
            if item.get(k):
                return str(item[k])
        return ', '.join(f'{k}: {v}' for k, v in item.items() if v)[:200] or str(item)[:200]
    return str(item)


def _item_evidence(item: Any) -> str | None:
    if not isinstance(item, dict):
        return None
    for k in ('evidence', 'source', 'proof', 'excerpt', 'citation', 'quote', 'words'):
        if item.get(k):
            return str(item[k])
    return None


def _proof_cell(item: Any) -> str:
    ev = _item_evidence(item)
    if ev:
        return f' preuve : « {ev[:180]} »'
    return ''


def _card_lines(title: str, items: list, empty: str) -> list:
    out = [Paragraph(title, _H3)]
    if not items:
        out.append(Paragraph(empty, _BODY))
        return out
    for item in items:
        txt = _item_text(item)
        out.append(Paragraph(f'• {txt}{_proof_cell(item)}', _BODY))
    return out


@router.get('/reports/gap')
def get_latest_gap_report(current=Depends(get_current_user)):
    uid = current['sub']
    gap = db.gap_reports.find_one({'userId': uid}, sort=[('createdAt', -1)])
    objective = db.career_objectives.find_one({'userId': uid}, {'_id': 0})
    if not gap:
        return {'has_report': False, 'objective': objective}
    payload = gap.get('payload') or {}
    return {
        'has_report': True,
        'id': str(gap['_id']),
        'createdAt': gap.get('createdAt').isoformat() if gap.get('createdAt') else None,
        'matchScore': gap.get('matchScore'),
        'cvId': gap.get('cvId'),
        'objective': objective,
        'strengths': _as_list(payload.get('strengths') or payload.get('strengths_list') or payload.get('forts')),
        'gaps': _as_list(payload.get('gaps') or payload.get('ecarts')),
        'limits': _as_list(payload.get('limits') or payload.get('limitations')),
        'recommended_focus': payload.get('recommended_focus') or payload.get('recommendedFocus') or payload.get('focus'),
        'raw_payload': payload,
    }


@router.get('/reports/gap/pdf')
def download_gap_pdf(current=Depends(get_current_user)):
    uid = current['sub']
    user = db.users.find_one({'userId': uid}, {'passwordHash': 0}) or {}
    full_name = user.get('fullName') or 'Compte Evolve'
    gap = db.gap_reports.find_one({'userId': uid}, sort=[('createdAt', -1)])
    objective = db.career_objectives.find_one({'userId': uid}, {'_id': 0})
    if not gap:
        raise HTTPException(status_code=404, detail='Aucun rapport disponible — complétez l’entretien d’abord.')

    payload = gap.get('payload') or {}
    strengths = _as_list(payload.get('strengths') or payload.get('strengths_list'))
    gaps = _as_list(payload.get('gaps') or payload.get('ecarts'))
    limits = _as_list(payload.get('limits') or payload.get('limitations'))
    focus = payload.get('recommended_focus') or payload.get('recommendedFocus') or payload.get('focus') or ''
    score = int(gap.get('matchScore') or 0)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title='Rapport Evolve AI', author='Evolve AI')

    story: list = []

    story.append(Spacer(1, 4))
    story.append(Paragraph('EVOLVE AI', _H3))
    story.append(Paragraph('Rapport de développement', _H1))
    story.append(Paragraph(f'Édité le {datetime.now(timezone.utc).strftime("%d/%m/%Y")} · Compte : {full_name} ({user.get("email", "")})', _SOFT))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width='100%', thickness=1.2, color=PINE, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph('Votre cible', _H3))
    target = (objective or {}).get('targetRole') or payload.get('target_role') or 'Non définie'
    horizon = (objective or {}).get('horizonMonths') or payload.get('horizon_months') or '—'
    hours = (objective or {}).get('weeklyHours') or payload.get('weekly_hours') or '—'
    motivation = (objective or {}).get('motivation') or payload.get('motivation') or ''
    story.append(Paragraph(f'<b>Objectif :</b> {target}', _BODY))
    story.append(Paragraph(f'<b>Horizon :</b> {horizon} mois · <b>Disponibilité :</b> {hours} h / semaine', _BODY))
    if motivation:
        story.append(Paragraph(f'<b>Motivation :</b> {motivation}', _BODY))
    story.append(Paragraph(f'<b>Rapport établi le :</b> {_fmt_date(gap.get("createdAt"))}', _BODY))

    story.append(Spacer(1, 10))
    story.append(Paragraph('Readiness Score', _H3))

    score_block = Table(
        [[Paragraph(f'{score}', _NUM),
          Paragraph('<b>/ 100</b><br/>' + ('Solide et documenté' if score >= 70 else ('En progression — des gaps restent à combler' if score >= 40 else 'Le travail commence — c’est normal')), _BODY)]],
        colWidths=[55 * mm, 110 * mm],
    )
    score_block.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (0, 0), PAPER),
        ('BOX', (0, 0), (0, 0), 1.2, LINE),
        ('ROUNDEDCORNERS', [10, 10, 10, 10]),
        ('PADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(score_block)

    story.append(Spacer(1, 8))
    bar_rows = [[Paragraph('Progression vers votre cible', _SOFT)], ['']]
    bar_table = Table([[Paragraph(f'{score}%', ParagraphStyle('pct', parent=_SOFT, fontSize=14, textColor=PINE, fontName='Helvetica-Bold'))]], colWidths=[160 * mm])
    bar_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), PAPER),
        ('BOX', (0, 0), (0, 0), 0.6, LINE),
        ('PADDING', (0, 0), (0, 0), 10),
    ]))
    story.append(bar_table)

    for block in _card_lines('Forces documentées', strengths, 'Pas encore documenté — l’entretien les identifiera.'):
        story.append(block)
    story.append(Spacer(1, 4))
    for block in _card_lines('Gaps — écarts vs. votre cible', gaps, 'Pas encore documenté — l’entretien les identifiera.'):
        story.append(block)
    story.append(Spacer(1, 4))
    for block in _card_lines('Limites identifiées', limits, 'Aucune limite documentée pour l’instant.'):
        story.append(block)

    if focus:
        story.append(Paragraph('Focus recommandé', _H3))
        story.append(Paragraph(str(focus), _BODY))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width='100%', thickness=0.6, color=LINE, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph('Hypothèses, jamais des verdicts — chaque élément de ce rapport cite une preuve issue de vos propres réponses ou de votre CV. Aucun diagnostic clinique n’est posé ; en cas de détresse, consultez un professionnel de santé. Document personnel — ne pas diffuser sans votre accord.', _SOFT))

    doc.build(story)

    # Historique pdf_export (consent implicite : le user a demandé le téléchargement)
    try:
        db.reports.insert_one({'userId': uid, 'type': 'pdf_export', 'title': f'Rapport Evolve AI — {target}', 'payload': {'matchScore': score, 'gapId': str(gap['_id'])}, 'createdAt': datetime.now(timezone.utc)})
    except Exception:
        pass

    filename = f'Evolve_Rapport_{datetime.now(timezone.utc).strftime("%Y%m%d")}.pdf'
    return Response(content=buf.getvalue(), media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"'})
