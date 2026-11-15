# Evolve AI — Flows Langflow 1.7.0 (importables)

Générés depuis vos vrais exports 1.7.0 ; nœuds copiés à l'identique, connectés avec vos conventions. Prompts anglais ; réponse dans la langue de l'utilisateur. Noms simples.

| Fichier | Endpoint | Rôle |
|---|---|---|
| Supervisor.json | `supervisor` | **Clone exact de `Credit Manager v2 (Embedded Registry).json`** pour Evolve — TextInput → TypeConverterComponent → OpenRouter (`deepseek/deepseek-v4-flash`, temp 0.1) → Agent → (ChatOutput + TextOutput) + **6 APIRequest tools** (`self_discovery_agent … quality_gate_agent`) — embedded **AgentCard registry JSONL** + A2A protocol |
| Self_Discovery.json | `self_discovery` | Profil + pistes |
| Skills_Assessment.json | `skills_assessment` | Exercices + rubrics |
| Development_Planner.json | `development_planner` | Goals SMART + plan 30/60/90 |
| Progress_Reflection.json | `progress_reflection` | Habitudes, check-ins, patterns (≥3) |
| CV_Gap_Analysis.json | `cv_gap_analysis` | Interview coach → gap report → handoff |
| Quality_Gate.json | `quality_gate` | Dernier filtre — MCP tools (search_memories) pour la vérif évidence |
| **Knowledge_RAG.json** | `knowledge_rag` | **Ingest + Agentic RAG en UN flow** (aucun MCP) |
| Knowledge_Ingest.json | `knowledge_ingest` | Depuis un simple bouton « sélectionner le document » → AstraDB |

## Knowledge_RAG (le flow à deux branches)

**Branche A — ingest (upload de documents) :**
`File (Select document) → SplitText (1000/200) → AstraDB (collection "coach", keyspace default_keyspace, DB fusionai — 16704 chunks des 5 PDFs de Docs\) → ChatOutput`
Usage : déposez un livre/des notes psy (.pdf/.docx/.txt) dans l'input File de ce flow → le document est découpé et posté dans AstraDB (`fusionai/default_keyspace`, collection `coach` — NVIDIA embedqa-e5-v5, 5 books ingestés (~16.7k chunks)).

**Branche B — RAG agentique (question → réponse) :**
`ChatInput → Research Agent (Mistral, tool = AstraDB similarity search) → Sufficiency Judge (Mistral temp 0) → SmartRouter (Sufficient → réponse directe · Insufficient → Rewrite agent, tool AstraDB broadened) → Final formatter → ChatOutput`
Aucune aile MCP : tout passe par AstraDB (collection partagée avec vos autres projets — la même instance, même token global `astratoken`).

## Knowledge_Ingest (standalone, optionnel)

Version ingest-only du même processus File → SplitText → AstraDB. Pratique pour l'import API/Playground sans la branche RAG.

## Ce que chaque brique fait maintenant

- **CVs** → coach-mcp (`search_cv`/`save_cv`…) → proxy → `coach-cv-service` (LangGraph, port 8300)
- **Livres de psychologie** → AstraDB (branch-aided par Knowledge_RAG ; aussi utilisable par d'autres flows via AstraDB tool)
- **Mémoire perso + assessment + goals/habits** → coach-mcp (seule source pour ces domaines)
- **mcp-server/scripts/ingest_books.py** → alternativa CLI pour charger un dossier entier de `.txt/.md/.pdf` directement dans `coach.books` (MongoDB) — utile pour alimenter aussi la bibliothèque MCP si vous la gardez.

## Ordre d'import

`Self_Discovery` … `CV_Gap_Analysis` → `Quality_Gate` → `Knowledge_RAG` → `Knowledge_Ingest` → `Supervisor`

## Collections AstraDB

- `coach` — 5 livres psy (16.7k chunks) — **only** the vector store for the `Knowledge_RAG` flow. No user data here.
- CV — **lives in coach-mcp (MCP tools)** (`save_cv`/`search_cv`/`list_cvs`/`delete_cv`), proxied to the LangGraph CV service (port 8300) on MongoDB `coach` (`cvs` + `cv_chunks` collections). **No AstraDB collection for CVs by design.**

# Notes techniques (important)

**Supervisor — délégation via MCP (choix 2026-11-12)**
Les 6 outils API Request identiques ('make-api-request') rendaient la délégation opaque au modèle. Désormais le Supervisor appelle **coach-mcp** avec des outils nommés : `delegate_to_self_discovery`, `delegate_to_skills_assessment`, `delegate_to_development_planner`, `delegate_to_progress_reflection`, `delegate_to_cv_gap_analysis`, `ask_quality_gate` (+ `list_agent_cards`). Chaque outil POST vers le `/run` du flow spécialiste et renvoie **l'enveloppe extraite** (wrapper /run déballé). Le prompt Supervisor contient les **6 agent cards complètes** (nom, description, when→tool, expected output) + `list_agent_cards` en backup.

**Enveloppe /run** : le Supervisor lit l'enveloppe dans `outputs[0].outputs[0].results.message.text` ; tous les agents de ce projet font pareil (le coach-mcp tool fait le même parsing).

**Exposition publique (démo / Langflow distant)** :
```bash
node src/http.js          # coach-mcp over StreamableHTTP — localhost:8310/mcp
ngrok http 8310           # nécessite authtoken une fois : npm exec -- ngrok config add-authtoken <TOKEN>
# URL publique du type : https://abcd-xxx.ngrok-free.app/mcp
# Enregistrer cette URL comme serveur MCP HTTP dans Langflow (name: coach-mcp).
```

**Sessions stateless** : état via Mongo (mcp-memory) + CONTEXT dans chaque appel.

**Knowledge_RAG** : cloné de votre `Agentic rag (2).json` (research → judge → SmartRouter → rewrite) ; AstraDB remplace MCP ici par choix explicite — le MCP (coach-mcp) est dédié aux autres agents (CV via proxy LangGraph, mémoire, assessments, goals).

**File node** : uploads via Playground uniquement ; l'upload par fichier n'est pas accessible en `/run` HTTP. Utilisez Playground pour la branche ingest, ou l'API d'un upload Langflow directement.

## Validé automatiquement (structure)

- JSON · ids uniques · inner==outer ids · handles œ-encodés · `system_prompt` non vide · Mistral models `load_from_db/global MISTRAL_API_KEY` · `display_name` propres au flux.

## Non vérifié sans Langflow local

- Exécution réelle (import + 1 run chacun dans Playground + 1 ingest .pdf). Risque n°1 : Mistral sur instructions de JSON strict — dégradé par `handle_parsing_errors` + filtres.

## Architecture

```
Next.js (3000) → FastAPI (8001, Mongo direct) → Langflow (7860, 10 flows)
                  ├──────── Knowledge_RAG/Ingest : File → AstraDB · Chat → AstraDB (no MCP)
                  └──────── délégués via Supervisor : Self_Discovery…Quality_Gate → coach-mcp (stdio) + coach-cv-service (8300)
```
