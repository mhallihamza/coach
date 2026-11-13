# Evolve AI — Documentation Complète du Projet

**Version** : 1.0 · **Date** : 12 novembre 2026 · **Statut** : bêta interne — MCP + backend + frontend fonctionnels, flows Langflow générés et validés structurellement (import en cours)
**Auteur** : équipe Evolve

> Convention : ce document est la référence humaine du projet. Pour tout assistant IA : lire en premier `CLAUDE.md`. Les briefs des agents sont en français dans `C:\Users\PC\Downloads\evolve-ai-workflow-briefs\`.

---

## 1. Problème & solution

### Le problème
- Les gens suivent des objectifs de développement personnel avec des plans génériques qui ne tiennent jamais.
- Les outils de quizz/diagnostics standardisent des personnes ("test de personnalité"), sans preuve, sans suivi, sans plan.
- La confidentialité : les données psychologiques ne doivent jamais sortir de l'utilisateur.

### La solution : Evolve AI
Un coach de développement personnel propulsé par l'IA qui :
1. **Comprend** l'utilisateur via un entretien adaptatif façon coach clinique — jamais un formulaire de 40 questions d'acharp.
2. **Documente** avec des preuves : chaque affirmation cite les mots de l'utilisateur, son CV ou une mesure.
3. **Planifie** : 30/60/90 jours, SMART, dérivé exclusivement des gaps mesurés.
4. **Suit** : réévaluation mensuelle (score 0–100), détection de patterns (≥3 occurrences), adaptation du plan.

### Publics
- **Personnes** : transitions de carrière, communication, procrastination, confiance, organisation.
- **Entreprises (B2B)** : gap analysis pour équipes, coaching à l'échelle, exports PDF pour RH.

### Ce qui différencie Evolve
- **Hypothèses, jamais des verdicts** : aucune étiquette permanente, aucun diagnostic psychiatrique.
- **Évidence d'abord** : un gap = une citation. Pas de preuve = pas de ligne.
- **Compte obligatoire, CV optionnel** : seul le signup est exigé ; l'entretien fonctionne sans CV.
- **Les données restent les vôtres** : suppression en un clic, consentements granulaires, cloisonnement par `user_id`.

---

## 2. Architecture globale

```
            ┌──────────────────────────────────────┐
            │  Next.js 15 (port 3000)              │
            │  Landing · Auth · Dashboard · Chat   │
            └──────────────┬───────────────────────┘
                           │ HTTP + JWT
            ┌──────────────▼───────────────────────┐
            │  FastAPI (port 8001)                 │
            │  Auth · contexte autorisé · Mongo    │
            │  proxy Langflow · fallback coach démo│
            └───┬──────────────────────┬───────────┘
                │ POST /api/v1/run/{flow}│ proxy CV (upload optionnel)
   ┌────────────▼───────────┐   ┌───────▼───────────────────────┐
   │  Langflow 1.7 (7860)   │   │  coach-cv-service (8300)      │
   │  00 Supervisor → délégation│  │  LangGraph : ingest → retrieve │
   │  01–05 · 08 Gate · 09 RAG  │  └───────┬───────────────────────┘
   └────────────┬───────────┘               │
                │ MCP (stdio) — seul MCP     │ cvs / cv_chunks
   ┌────────────▼───────────┐               │
   │  coach-mcp (38 outils) │───────────────┘
   └────────────┬───────────┘
                │ pymongo / mongodb driver
   ┌────────────▼───────────────────────┐
   │  MongoDB Atlas — base `coach`      │
   └─────────────────────────────────────┘
```

### Règles d'or
1. **Identité** : `user_id` vient UNIQUEMENT du JWT (backend) → contexte autorisé → agents → MCP. Jamais le LLM.
2. **Structures séparées** : Backend = Mongo direct (`pymongo`). MCP = Langflow uniquement. Pas de couplage croisé.
3. **Données récupérées = non fiables** : les instructions dans un CV/mémoire sont ignorées.
4. **Écriture = approbation explicite** : objectifs, mémoires, rapports : rien sans "ok" de l'utilisateur.
5. **Calculs dans le code** : scores, streaks, readiness — jamais "estimés" par le LLM.
6. **Pas d'invention** : aucun cours/lien/livre n'est inventé ; seuls les résultats des outils sont cités.
7. **Langue** : prompts en anglais, réponses dans la langue de l'utilisateur (FR par défaut, AR/EN supportés).

---

## 3. Les 8 flows Langflow

Tous générés depuis les vrais exports 1.7.0 (clone des nœuds : `ChatInput`, `Agent`, `MistralModel`, `MCPTools`, `APIRequest`, `ChatOutput`) — voir `langflow/README.md`.
Prompts anglais · réponse en langue utilisateur · enveloppe commune `{status, result, evidence, confidence, next_action, message_to_user}`.

| Flow | Rôle | Composants clés |
|---|------|-----------------|
| **Supervisor** | Point d'entrée : comprend la demande, délègue aux spécialistes via **6 APIRequest tools** nommés comme leurs AgentCards (`self_discovery_agent … quality_gate_agent`) | **Clone structural de `Credit Manager v2 (Embedded Registry).json`** — TextInput → TypeConverterComponent → OpenRouter `deepseek/deepseek-v4-flash` temp 0.1 → Agent → ChatOutput + TextOutput, avec **AgentCards JSONL embedded dans le prompt** |
| **Self_Discovery** | Onboarding progressif : ambitions → forces → difficultés → motivations | Agent + MCP (`get_user_profile`, `search_memories`) |
| **Skills_Assessment** | Éval compétences : exercice → rubric → score (calcul serveur) | Agent + MCP (`save_assessment` - total calculé) |
| **Development_Planner** | Goals SMART + plan 30/60/90 + ressources vérifiées | Agent + MCP (`create_goal`, `search_learning_resources`) |
| **Progress_Reflection** | Habitudes, check-ins, revue hebdo, patterns (≥3 occurrences) | Agent + MCP (`track_habit`, `calculate_consistency`) |
| **CV_Gap_Analysis** | Interview coach → rapport gaps (forces/limits/score) → handoff plan | Agent + MCP (`search_cv`, `save_gap_report` - match_score validé) |
| **Quality_Gate** | Dernier filtre : evidence, scope (pas de diagnostic), enveloppe, pass/revise/block — **MCP (search_memories) pour la vérif évidence** | Agent + MCP |
| **Knowledge_RAG** | **Ingest + Agentic RAG en UN flow, AstraDB UNIQUEMENT (0 MCP)** : deux branches — File → SplitText → AstraDB `coach` (default_keyspace, fusionai DB — 16704 chunks des 5 PDFs de Docs) · Chat → Research → Judge → SmartRouter → Rewrite → Final | +2 agents · router · AstraDB |
| **Knowledge_Ingest** | Convenience ingest-only : File → SplitText → AstraDB `coach` | ingest |

**Ordre d'import** : Self_Discovery…CV_Gap_Analysis → Quality_Gate → Knowledge_RAG (collection `coach` peuplée : 5 PDFs, 16704 chunks) → Supervisor

### Conventions A2A (version API Request, validée sur le terrain par S7)
- Chaque délégation est un `POST /api/v1/run/{endpoint}` avec `input_value` (3 lignes) :
  ```
  TASK: <une phrase — ce dont le spécialiste a besoin>
  REFERENCE: REQ-<id>
  CONTEXT: {"authorized_context": {"user_id": "…", "language": "fr", …}, "results": [étapes précédentes]}
  ```
- Le Supervisor planifie (routing table dans le prompt), enchaîne les dépendances (CV_Gap_Analysis → Development_Planner), cite la provenance.
- Échec d'un spécialiste → retry unique → réponse partielle honnête. Jamais d'erreur silencieuse.

---

## 4. Frontend Next.js (port 3000)

Design system "premium éditorial" — Fraunces (serif d'affichage) + Inter · papier chaud `#f6f3ec`, forêt `#103b2a`, or `#c6a04e` · grain papier, composition CSS-only (aucune photo stock).

| Route | Contenu |
|---|---|
| `/` | Landing complète : hero, méthode (3 temps), 6 capacités, bande stats, témoignages, pricing (Découverte/Pro/Équipes), FAQ, CTA |
| `/auth` | Split-screen inscription/connexion (compte obligatoire) |
| `/dashboard` | KPIs (readiness, objectifs, constance, dernier score), sparkline, limites identifiées, focus semaine |
| `/dashboard/chat` | Chat coach (typing state, suggestions, connexion réelle au backend) |
| `/dashboard/goals` | Objectifs approuvés + progression milestones |
| `/dashboard/career` | Upload CV (optionnel) + cible ("Je veux devenir …", horizon, heures/semaine) + aperçu gap report |
| `/dashboard/settings` | Consentements granulaires (mémoire, analyse CV, PDF, email hebdo) + suppression complète des données |

Auth : JWT stocké `localStorage` (`evolve_token`), garde côté client, API toujours via `lib/api.ts` (base `http://localhost:8001`).

---

## 5. Backend FastAPI (port 8001)

Pas de framework secret : **FastAPI + pymongo + PyJWT**. Le backend parle à MongoDB **directement** (le MCP n'est jamais appelé).

| Endpoint | Description |
|---|---|
| `POST /api/auth/signup` | Création de compte (201) — hash `pbkdf2_sha256`, JWT 30 jours |
| `POST /api/auth/login` | Connexion |
| `GET /api/me` | Profil courant |
| `GET /api/dashboard` | Agrégation : goals actifs, habits + consistency, dernier assessment, matchScore, objectif carrière |
| `GET /api/goals` | Liste objectifs + progression |
| `POST /api/chat` | Message → `conversations/messages` ; si `LANGFLOW_URL` configuré → `POST /api/v1/run/{flow}` ; sinon **coach démo** (jamais silencieux) |
| `GET /api/chat/{id}` | Historique |
| `GET /api/health` | Ping Mongo + état Langflow |
| — | Pipeline preference for `/api/chat`: per-flow env vars (SUP_*_URL/TOKEN, SELF_DISCOVERY_*, SKILLS_ASSESSMENT_*, DEVELOPMENT_PLANNER_*, PROGRESS_REFLECTION_*, CV_GAP_ANALYSIS_*, QUALITY_GATE_*) > shared ANALYSIS_* (URL + TOKEN) > langflow_local (fallback) > demo coach |
| — | **LangGraph supervisor** (port 8020) appelle les specialists : charge `langgraph-supervisor/.env`, résolution par workflow : `<SLUG>_URL`/`<SLUG>_TOKEN` (nommés, tous renseignés aujourd'hui avec le même jeton staging) → `STG_BASE`/`<slug>` ; token normalisé avec ou sans préfixe `Bearer ` ; `GET /health` affiche l'URL et la **présence** du token par workflow (jamais les valeurs) |
| `POST /api/career/cv` | Upload CV optionnel (multipart) → proxy `coach-cv-service` (8300) — **stocke aussi le fichier original** |
| `DELETE /api/career/cv/{id}` | Suppression CV (cascade via service : chunks + mémoires) |
| `GET /api/career/cv/{id}/file` | **Téléchargement du fichier original** (Binary dans Mongo) |

Résilience : index `users.email_1` aligné sur le seed MCP (sparse) ; conscience des conflits d'index. CORS restreint à `http://localhost:3000`. 401 sans token.

---

## 6. Le MCP unique — `coach-mcp` (38 outils)

Un seul serveur MCP, utilisé par **tous** les agents Langflow. Transport **stdio**. Base `coach`.

**Profil & compte** : `create_user` · `get_user_profile` · `update_user_profile` · `set_consent` (longTermMemory, cvAnalysis, pdfReports, weeklyEmail, marketing)

**CV & carrière (proxy HTTP vers `coach-cv-service`, port 8300)** : `save_cv` · `search_cv` · `list_cvs` · `delete_cv` · `save_certification` · `list_certifications` · `save_career_objective` · `get_career_objective`

**Évaluations** : `save_assessment` (scores 0-5 validés, total calculé) · `get_assessment_history` · `save_gap_report` (match_score 0–100) · `get_latest_gap_report`

**Objectifs & habitudes** : `create_goal` · `get_active_goals` · `update_goal` · `complete_milestone` · `get_goal_progress` · `create_habit` · `get_habits` · `track_habit` · `get_habit_history` · `calculate_consistency`

**Mémoire (RAG)** : `save_memory` · `search_memories` · `delete_memory`

**Bibliothèque psychologie** : `add_book` · `search_books` · `list_books` *(4 notes originales seedées ; pas de contenus sous copyright)*

**Ressources d'apprentissage** : `add_learning_resource` · `search_learning_resources` *(ressources curées et vérifiées)*

**Rapports & logs** : `save_report` · `list_reports` · `log_agent_execution` · `health_check`

Règles : chaque outil exige `userId` (contexte autorisé) ; refus silencieux impossible — erreurs structurées `{ok:false, error}` ; consentements respectés ; suppression en cascade (`delete_cv` → chunks + mémoires dérivées).

---

## 7. Base de données (`coach`, MongoDB Atlas)

Collections principales : `users` · `user_profiles` · `consents` · `cvs` (parsedText + **fileBinary** / fileSize / contentType / createdAt) · `cv_chunks` (`$text`) · `certifications` · `career_objectives` · `assessments` · `gap_reports` · `goals` · `milestones` · `habits` · `habit_logs` · `memories` (`$text`) · `books` · `book_chunks` (`$text`) · `learning_resources` (`$text`) · `reports` · `agent_executions`

Index : `userId` partout (RLS-like par filtre applicatif) · `email` sparse unique (JWT) · `$text` sur chunks/mémoires/ressources/livres · `agent_executions (userId, createdAt)`.

Démo : `demo-user` (parcours complet pré-chargé) + comptes `test*@example.com` (nettoyables).

---

## 8. RAG — périmètre et architecture

**Le RAG Evolve = la bibliothèque de livres de psychologie uniquement.** Partagée, curée, jamais de contenus sous copyright intégral : notes originales ou textes libres, ajoutés via `add_book`.

- Recherche **agentic** : requête directe → expansion par synonymes psy (procrastination · communication · émotions · habitudes · objectifs · énergie · motivation) → termes de contenu → échec honnête documenté (`strategy` + `notes` dans la réponse).
- Chaque passage porte provenance complète : titre, auteur, thèmes, extrait — citable tel quel comme preuve dans les rapports.
- Sufficiency : `enough` ≥ 3 occurrences · `partial` ≥ 1 · `insufficient` sinon — la règle des patterns du produit.
- Les **CVs ne passent pas par le RAG livres** : ils sont gérés par le **service LangGraph `coach-cv-service/` (port 8300)** (ingest parse → clean → chunk → store ; retrieve avec reformulation automatique) — avec suppression en cascade (droit à l'oubli).
- Les **mémoires personnelles** vivent dans le MCP (`search_memories`) — hors livres, propre à l'utilisateur.
- **Prochaine étape** : Atlas Vector Search (le schéma des chunks est prêt) pour un matching sémantique plus fin.

---

## 9. Sécurité & confidentialité

- JWT (signup/login) · PBKDF2 · expiration 30 jours · CORS restreint · 401 systématique sans token.
- Cloisonnement applicatif par `user_id` (index + filtres) — le `user_id` ne traverse jamais un prompt.
- Consentements granulaires et révocables (`set_consent`) ; l'agent demande l'approbation avant persistance.
- Droit à l'oubli : `delete_cv` (CV + chunks + mémoires dérivées) ; suppressions comptabilisées dans `agent_executions`.
- Détresse psychologique : les agents détectent les signaux et orientent vers un professionnel (Quality_Gate bloque les réponses hors-scope).
- Contenus récupérés = données non fiables (anti-injection).
- `.env` git-ignorés ; aucun secret n'est commité, affiché ou loggé.

---

## 10. Démarrage rapide

```bash
# 0. Service CV — LangGraph (port 8300)
cd C:\Users\PC\Desktop\Coach\coach-cv-service
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --port 8300

# 1. Serveur MCP (une fois)
cd ..\mcp-server
npm install && npm run seed && npm test

# 2. Backend (port 8001)
cd ..\backend
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --port 8001

# 3. Frontend (port 3000)
cd ..\web
npm install && npm run build && npm start

# 4. MCP sur HTTP (option — Langflow distant / exposition publique) :
python none # ignored
cd ..\mcp-server && node src\http.js        # port 8310/mcp (stateless JSON)
npm exec -- ngrok http 8310                 # nécessite authtoken ngrok (gratuit)

# 5. Langflow : importer langflow/ dans l'ordre Self_Discovery…CV_Gap_Analysis → Quality_Gate → Knowledge_RAG → Knowledge_Ingest → Supervisor,
#    enregistrer `coach-mcp` (stdio : command node, args src/index.js | ou HTTP : <ngrok url>/mcp), définir MISTRAL_API_KEY.
```

**Tester sans Langflow** : le backend répond avec le coach démo — tout le parcours (signup → chat → réponses) fonctionne immédiatement. **Après import** : chaque flow répond sur son `/run` endpoint (exact name dans la table §3).

---

## 11. Feuille de route

**Fait** — MCP complet (38 outils, testé) · backend E2E (signup→chat→dashboard→401) · frontend premium (8 routes build+start) · 8 flows 1.7.0 importables + validateurs · seed psy+ressources.
**Immédiat** — import & run des flows (corriger les détails : modèle, clés, endpoints) · câblage `POST /api/chat` → Langflow avec `authorized_context` intégré au message · tests bout-en-bout par flux.
**Court terme** — Atlas Vector Search · ingestor `.txt/.md` pour la bibliothèque psy · PDF exports · email hebdo (opt-in) · suppression complète côté UI.
**Moyen terme** — 100% du parcours fermé (signup→entretien→rapport→plan→30j→recheck), bêta privée 100 utilisateurs, B2B pilote.

---

## 12. Répartition équipe (indicative)

| Membre | Tâche |
|---|---|
| 1 | Supervisor + intégration `/run` + routing |
| 2 | Self_Discovery |
| 3 | Skills_Assessment (rubrics + Python validation) |
| 4 | Development_Planner (SMART + plans + handoff 05) |
| 5 | Progress_Reflection + job Celery hebdo |
| 6 | CV_Gap_Analysis (interview coach + gap report) |
| 7 | Quality_Gate + mémoire/livres psy |
| 8 | Backend FastAPI + auth + dashboard APIs |
| 9 | coach-mcp (maintenance outils, tests, seeds) |
| 10 | Frontend Next.js (landing, dashboard, chat) |

Petite équipe : (1 Supervisor+A2A) (2 Self_Discovery+Skills_Assessment) (3 Development_Planner+Progress_Reflection) (4 CV_Gap_Analysis) (5 Quality_Gate + MCP memory) (6 backend+MCP) (7 web).

---

## 13. Glossaire

| Terme | Signification |
|---|---|
| **MCP** | Model Context Protocol — serveur d'outils pour agents (ici stdio) |
| **A2A** | Agent-to-Agent — délégation inter-agents via HTTP `/run` + outils API Request (pattern du projet « Credit Manager » S7) |
| **Envelope** | Enveloppe de sortie commune à tous les flows : `{status, result, evidence, confidence, next_action, message_to_user}` |
| **Authorized context** | Bloc `{user_id, conversation_id, language, coaching_style, consent_flags}` fabriqué par le backend |
| **Readiness score** | `match_score` 0–100 = `sum(min(current, required))/sum(required)`, calculé par le serveur depuis les critères 0–5 |
| **Limits** | Freins internes (peur, perfectionnisme…) ou externes (temps, argent, obligations) — documentés avec preuve |
| **Pattern rule** | Un pattern ne peut être nommé qu'à partir de **3 occurrences** récupérées |
| **Acceptance gate** | Rien n'est persisté sans approbation explicite de l'utilisateur |
| **Sufficiency** | Évaluation des preuves récupérées par le RAG : `enough / partial / insufficient` |

---

## 14. Références

- `C:\Users\PC\Desktop\Coach\CLAUDE.md` — contexte pour assistants IA (anglais, détails techniques)
- `C:\Users\PC\Desktop\Coach\README.md` — démarrage rapide
- `C:\Users\PC\Downloads\evolve-ai-workflow-briefs\` — briefs agents (FR) + règles communes + enveloppe + conventions A2A
- `C:\Users\PC\Desktop\Coach\langflow\README.md` — import des flows
- `C:\Users\PC\Desktop\Coach\mcp-server\README.md` — MCP (outils, sécurité, tests)
- S7 (`C:\Users\PC\Desktop\S7`, Arwaj — microfinance POC) — référence d'architecture agents/MCP utilisée par ce projet (lecture seule, non modifié)
