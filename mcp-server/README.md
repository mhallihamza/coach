# coach-mcp — Unified MCP server for Evolve AI

One MCP server used by **all** Langflow agents (Supervisor, specialists, quality gate).
Base de données : **MongoDB Atlas — database `coach`**. Compte obligatoire : chaque outil reçoit `userId` depuis le contexte autorisé (backend → Langflow → MCP), jamais librement écrit par le modèle. **L'upload de CV est OPTIONNEL** : tout le parcours fonctionne sans CV ; l'upload n'apporte qu'une base factuelle enrichie.

**Répartition des responsabilités (mise à jour 2026-11-12)**
- **Le RAG = uniquement la bibliothèque de livres de psychologie** (`add_book` / `search_books` / `list_books`). `search_books` est **agentic** : direct → expansion par synonymes psy (procrastination, communication, émotions, habitudes, objectifs, énergie, motivation) → termes de contenu → échec honnête ; retourne `strategy`, passages, occurrences, `sufficiency` (règle des 3 occurrences) et `notes`.
- **Les CVs sont gérés par un service LangGraph séparé** (`coach-cv-service/`, port **8300**, FastAPI + LangGraph : ingest parse → clean → chunk → store ; retrieve → reformulation → recherche `$text` → envelope). Les outils MCP `save_cv` / `search_cv` / `list_cvs` / `delete_cv` sont désormais des **proxies HTTP** vers ce service (`CV_SERVICE_URL=http://localhost:8300`) — pas de logique CV dans le MCP.
- **Mémoire personnelle** : `save_memory` / `search_memories` / `delete_memory` (données utilisateur, hors livres).
- **Le backend FastAPI** ne passe jamais par le MCP (Mongo direct + HTTP vers le CV service).

## Stack & run

```bash
cd C:\Users\PC\Desktop\Coach\mcp-server
npm install
cp .env.example .env   # MONGODB_URI (déjà configuré, DB=coach)
npm run seed           # bibliothèque psychologie + ressources (idempotent)
npm test               # smoke test bout-en-bout (45 outils)
node scripts/verify-stdio.mjs   # vérifie le protocole MCP stdio
node scripts/verify-http.mjs    # vérifie le protocole MCP over HTTP (port 8310)
npm start              # lance le serveur (stdio)
node src/http.js       # lance le serveur (StreamableHTTP — localhost:8310/mcp)
node scripts/verify-ngrok.mjs   # vérifie via l'URL publique ngrok (MCP_URL env ou default .ngrok-free.app)
```

Langflow 1.7 (deux façons d'enregistrer le serveur) :

**A. stdio (local, recommandé en dev)**
```
Command: node
Args:    C:\Users\PC\Desktop\Coach\mcp-server\src\index.js
Name:    coach-mcp
```

**B. HTTP (ngrok — pour Langflow distant ou démo publique)**
```bash
node src/http.js &                 # port 8310 — POST/JSON stateless au /mcp
npm exec -- ngrok http 8310        # npm global wrapper — nécessite un authtoken ngrok gratuit
# Enregistrer ensuite dans Langflow → Settings → MCP Servers → Add :
#   Type: StreamableHTTP · URL: https://<xxxx>.ngrok-free.app/mcp · Name: coach-mcp
```
Le serveur HTTP est **stateless JSON** (pas de SSE) — chaque POST /mcp ouvre un transport éphémère SDK-compliant, aucun état de session côté serveur.



## Architecture de données (db `coach`)

| Collection | Rôle |
|---|---|
| users / user_profiles / consents | **Compte obligatoire** + préférences + consentements granulaires |
| cvs / cv_chunks | CVs gérés par **coach-cv-service (LangGraph, 8300)** ; chunks `$text` pour la recherche |
| certifications | Diplômes/formations + compétences extraites |
| career_objectives | "Je veux devenir …" (cible, horizon, heures/semaine) |
| assessments | Scores 0-5 validés, **total calculé en code fixe** |
| gap_reports | Rapports de gaps (match_score 0-100 validé) |
| goals / milestones | SMART goals + milestones |
| habits / habit_logs | Habitudes + consistency calculée en code fixe |
| memories | Mémoire personnelle (RAG-lite, `$text`, règle 3 occurrences) |
| books / book_chunks | **Bibliothèque de psychologie** (notes originales seedées + vos propres textes via `add_book`) |
| learning_resources | Ressources curées (cours/articles — jamais d'URL inventée) |
| reports | Rapports archivés (weekly review, gap report, PDF) |
| agent_executions | Journalisation de chaque flux (flow, taskId, tools, status, durée) |

## Outils (45)

- **Compte/profil** : create_user, get_user_profile, update_user_profile, set_consent
- **CV & carrière (délégués au service LangGraph, port 8300)** : save_cv, search_cv, list_cvs, delete_cv, save_certification, list_certifications, save_career_objective, get_career_objective
- **Assessments** : save_assessment, get_assessment_history, save_gap_report, get_latest_gap_report
- **Goals & habitudes** : create_goal, get_active_goals, update_goal, complete_milestone, get_goal_progress, create_habit, get_habits, track_habit, get_habit_history, calculate_consistency
- **Mémoire (RAG)** : save_memory, search_memories, delete_memory
- **Bibliothèque psy (RAG agentic)** : add_book, search_books, list_books
- **Apprentissage** : add_learning_resource, search_learning_resources
- **Orchestration (A2A Supervisor → spécialistes)** : list_agent_cards, delegate_to_self_discovery, delegate_to_skills_assessment, delegate_to_development_planner, delegate_to_progress_reflection, delegate_to_cv_gap_analysis, ask_quality_gate — chaque outil POST au `/run` Langflow et **déballe l'enveloppe** (wrapper `outputs[0].outputs[0].results.message.text`) avant de la retourner.
- **Rapports & logs** : save_report, list_reports, log_agent_execution
- **Système** : health_check

- **Compte/profil** : create_user, get_user_profile, update_user_profile, set_consent
- **CV & carrière (délégués au service LangGraph, port 8300)** : save_cv, search_cv, list_cvs, delete_cv, save_certification, list_certifications, save_career_objective, get_career_objective
- **Assessments** : save_assessment, get_assessment_history, save_gap_report, get_latest_gap_report
- **Goals & habitudes** : create_goal, get_active_goals, update_goal, complete_milestone, get_goal_progress, create_habit, get_habits, track_habit, get_habit_history, calculate_consistency
- **Mémoire (RAG)** : save_memory, search_memories, delete_memory
- **Bibliothèque psy (RAG agentic)** : add_book, search_books, list_books
- **Apprentissage** : add_learning_resource, search_learning_resources
- **Rapports & logs** : save_report, list_reports, log_agent_execution
- **Système** : health_check

## Règles non négociables (appliquées dans le code)

1. `userId` requis partout, validé (jamais de défaut).
2. Scores bornés (0-5 / confidence 0-1 / matchScore 0-100) et **totaux calculés par le serveur**.
3. Consentements granulaires (longTermMemory, cvAnalysis, pdfReports…) — vérifier avant `save_memory`.
4. Aucune requête brute SQL/free-form exposée ; toutes les lectures/écritures filtrées par `userId`.
5. Le contenu des livres/mémoires est servi via `$text` search avec passages + `occurrences` + `sufficiency` (`enough ≥ 3 occurrences` — règle des patterns).
6. **Jamais de livre sous copyright intégral dans `add_book`** : uniquement notes originales, textes libres ou avec accord. Le seed contient 4 notes originales (procrastination, communication, intelligence émotionnelle, habitudes).

## Sécurité

- `.env` est git-ignored et contient la connexion MongoDB Atlas (DB `coach`) réutilisée du projet microfinance (Arwaj / S7) — mêmes credentials, base séparée.
- Données personnelles (CV, mémoires) isolées par `userId` + suppression en cascade (`delete_cv`).
- Pour la prod : remplacer le DNS fallback par un résolveur fixe, activer Atlas IP allowlist, tourner le mot de passe DB, et brancher l'auth MCP (clé de service) côté gateway.
- DNS : le résolveur local refuse les requêtes SRV de Node ; `src/db.js` bascule automatiquement sur 8.8.8.8 / 1.1.1.1 / 208.67.222.222 si nécessaire.

## Limites actuelles & prochaines étapes

- RAG (livres psy) = Mongo `$text` + expansion synonymes/stratégies. Migration possible vers Atlas Vector Search (chunks `$text` prêts).
- Les CVs passent par `coach-cv-service/` (FastAPI + LangGraph) — voir son README. Service token `CV_SERVICE_TOKEN` requis en prod.
- Le transport est stdio (Langflow). Pour HTTP/SSE : ajouter `src/http.js` (SDK `StreamableHTTPServerTransport`).
- Le frontend (`Coach\web`) existe déjà ; la page Career appelle `POST /api/career/cv` du backend, qui relaie vers le CV service.
- Ajouter les vrais livres de psychologie (notes originales / textes libres) : via `add_book` ou un ingestor `scripts/books/` à la demande.

## Utilisateur démo

`userId = demo-user` — données d'exemple (CV Data Scientist, goal SQL, habitude, mémoire, rapport). Suppression :
`mongosh coach --eval "db.getCollectionNames().forEach(c => c.deleteMany ? db.getCollection(c).deleteMany({userId:'demo-user'}) : null)"` (ou via les outils `delete_cv` / `delete_memory`).
