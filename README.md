# Evolve AI — Coach personnel (dossier projet)

> Pour tout assistant IA travaillant sur ce projet, lire **CLAUDE.md** en premier — le contexte complet (architecture, secrets, état des lieux, règles) y est documenté en anglais.

- **Briefs des workflows** (Langflow, FR + EN) : `C:\Users\PC\Downloads\evolve-ai-workflow-briefs\` — voir `README.fr.md` pour la répartition des tâches par membre.
- **MCP unique** : `mcp-server/` — outils des agents (45 : orchestration A2A + données), MongoDB Atlas (DB `coach`). Voir `mcp-server/README.md`.
- **CV service (LangGraph + FastAPI)** : `coach-cv-service/` — save/retrieve CVs, port **8300**. Voir son README.
- **Backend FastAPI** : `backend/` — port 8001, Mongo direct, jamais via MCP.
- **Frontend Next.js** : `web/` — port 3000.
- **Flows Langflow** : `langflow/` — 9 flows 1.7.0 importables (7 core + Knowledge_RAG + Knowledge_Ingest).
- **Start all** : `.\start-all.ps1` (lancer aussi `.\start-all.ps1 -WithNgrok` pour publier le MCP HTTP).

## Démarrage rapide (individuel)

Env keys required: see `backend/.env` — pattern aligned to S7 reference.
- `ANALYSIS_API_URL` + `ANALYSIS_API_TOKEN` → staging agentic pipeline for `/api/chat`
- fallback: `LANGFLOW_URL` + `LANGFLOW_FLOW_ID` (e.g. `supervisor`) + `LANGFLOW_API_KEY`
- CV path: `CV_SERVICE_URL` (default http://localhost:8300) — backend proxies uploads; CV bytes live in Mongo `coach.cvs` / `coach.cv_chunks`
- `ANALYSIS_WEBHOOK_URL` is **reserved** — not used by any default path (CV upload goes to the CV service, not the webhook).

```bash
cd mcp-server && npm install && npm run seed && npm test       # MCP (stdio)
node src\http.js                                                # MCP over HTTP (port 8310) — requis pour Langflow distant / ngrok
cd ..\coach-cv-service && py -m pip install -r requirements.txt && py -m uvicorn app.main:app --port 8300   # CV service
cd ..\backend && py -m uvicorn app.main:app --port 8001         # Backend
cd ..\web && npm run build && npm start                          # Frontend
```

## ngrok (exposer le MCP publiquement)

Le MCP HTTP est **stateless** (JSON, pas de SSE) au `POST /mcp` sur le port 8310.

```bash
cd mcp-server
node src\http.js           # serveur HTTP local
# autre terminal :
npm exec -- ngrok http 8310        # nécessite un authtoken gratuit : npm exec -- ngrok config add-authtoken <TOKEN>
```

URL publique du type `https://<hash>.ngrok-free.app/mcp` — à enregistrer dans Langflow → Settings → MCP Servers (Type: StreamableHTTP, Name: `coach-mcp`). **La même base Mongo `coach`, le même `userId` sont utilisés** — aucun changement de flux requis.

## État courant (2026-11-12)

- ✅ MCP stdio + HTTP : 45 outils, smoke test + verify-stdio/http/ngrok — OK
- ✅ Backend FastAPI : signup/login/chat (fallback coach démo)/dashboard/goals — OK
- ✅ Frontend Next.js : build 10 routes, servies sur 3000 — OK
- ✅ CV service LangGraph : ingest/search/delete end-to-end — OK
- ✅ Flows Langflow : 9/9 validés structurellement ; Supervisor = MCP Tools + agent cards dans le prompt (plus d'outils API Request indistincts)
- 🔲 Import + runs dans Langflow (Playground) — votre prochain geste
- 🔲 Langflow distant : enregistrer `https://<hash>.ngrok-free.app/mcp` (arrêt ngrok = redémarrer `npm exec -- ngrok http 8310`)
