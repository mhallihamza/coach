# Evolve AI — Coach de développement personnel

> Coach IA qui refuse de deviner et refuse de flatter : chaque affirmation cite vos propres mots ou votre CV. Zéro diagnostic, zéro étiquette, zéro conseil inventé.

## Le problème

Les gens ambitieux tournent en boucle sur deux questions :

1. **« Où vais-je vraiment ? »** — des objectifs vagues, aucun cap mesurable.
2. **« Et ce que personne ne me dit ? »** — les amis ménagent, les managers évitent, les « coachs » IA remplissent.

## La boucle Evolve

```
Compte → CV + objectif (optionnels) → Évaluation Evolve (18 questions, ~4 min)
        → Rapport : score /100, forces, gaps, limites internes/externes — tout cité
        → Plan 30/60/90 jours — approbation explicite de l'utilisateur
        → (pas de plan sans votre clic) Suivi mensuel, ré-évaluation, adaptation
```

- **Preuve ou silence.** Sans citation (vos mots / votre CV / vos mesures), pas d'affirmation.
- **Zéro diagnostic clinique.** Redirection systématique vers un professionnel en cas de détresse.
- **L'utilisateur approuve tout.** Un objectif n'existe que s'il a pressé « Créer mon plan ».

## Stack

| Composant | Chemin | Port |
|---|---|---|
| Frontend — Next.js (App Router, Turbopack) | `web/` | 3000 |
| Backend — FastAPI | `backend/` | 8001 |
| Orchestrateur agentique (LangGraph) + 7 spécialistes | `langgraph/` | 8020 · 8501-8507 |
| Outils des agents (MCP) | `mcp-server/` | 8310 |
| Service CV — LangGraph + FastAPI | `coach-cv-service/` | 8300 |
| Base — MongoDB Atlas (db `coach`) | — | — |

## Démarrage rapide

```powershell
# Toute la stack locale : MCP + agents + supervisor + backend + CV service
powershell -ExecutionPolicy Bypass -File .\langgraph\start_all.ps1
# puis le frontend en dev
cd web
npx next dev --turbopack -p 3000
```

Ports et vérifications : `8310 MCP · 8001 backend · 8020 supervisor · 8300 CV · 8501-8507 agents · 3000 web`.

> Production (`next build`) : nécessite une machine avec plus de RAM que ce poste — `dev` fonctionne pour l'évaluation locale.

## Compte

Compte obligatoire pour tout usage. CV **optionnel** — sans CV, l'entretien se déroule entièrement par conversation. Données cloisonnées par utilisateur, consentements granulaires, suppression en un clic.

## Documentation

- `USE_CASE.md` — pitch 30 secondes + cas d'usage (FR / EN / AR)
- `CLAUDE.md` — contexte complet pour les assistants IA travaillant sur le projet
- `EVOLVE_AI_DOCUMENTATION.md` · `PROJECT_DOCUMENTATION.md` — notes internes
- `mcp-server/README.md` · `coach-cv-service/README.md` — docs des services

## Licence

Proprietary — tous droits réservés.
