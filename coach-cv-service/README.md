# Evolve CV Service — LangGraph + FastAPI

Service interne qui **sauvegarde et restitue les CVs** pour Evolve AI. Ce n'est pas un serveur MCP — c'est le service dédié CVs, appelé par le backend et relayé via coach-mcp.

## Pourquoi LangGraph ?

Le cycle de vie d'un CV est un **pipeline à états**, pas un appel CRUD :

```
ingest:  parse -> clean -> chunk -> store    (cv_documents/cvs + cv_chunks, Mongo $text)
search:  normalize -> reformulate-if-needed -> $text search -> envelope
```

LangGraph rend chaque étape testable, visible et extensible (ex. : ajout d'un nœud `extract_skills` via LLM plus tard sans réécrire le service).

## Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/ingest` | multipart/form-data (`user_id`, `file`, `filename`, `language`) — pdf/docx/txt/md |
| POST | `/ingest-text` | JSON `{user_id, filename, language, parsed_text}` (déjà parsé) |
| POST | `/search` | JSON `{user_id, query, limit}` — passages + occurrences + sufficiency |
| GET | `/cvs/{user_id}` | Liste des CVs (métadonnées) |
| DELETE | `/cvs/{user_id}/{cv_id}` | Suppression en cascade (chunks + mémoires dérivées) |
| GET | `/health` | Ping |

## Contenu de l'ingestion

- Parsing fixe (pas de LLM) : `pypdf` pour le PDF, `python-docx` pour le DOCX, UTF-8 pour le texte.
- Nettoyage : suppression des caractères nuls, espaces et sauts de ligne multiples.
- Chunking par mots (~160 mots, overlap 30) — indexé `$text`.
- Stockage : collection `cvs` (userId, fileName, language, parsedText, chunksCount, status ready, createdAt) + `cv_chunks` (userId, cvId, seq, text).
- Limite : 8 Mo par fichier, 500 chunks max par CV.

## Sécurité

- Cloisonnement par `userId` sur chaque lecture/écriture/suppression.
- Jeton optionnel `CV_SERVICE_TOKEN` (Bearer). Vide en dev local ; requis en prod.
- PDF/DOCX traités par parsing fixe — jamais par un LLM (pas d'injection possible via le code).
- Le texte du CV est une **donnée non fiable** pour les flows (instructions internes ignorées).

## Configuration

`C:\Users\PC\Desktop\Coach\coach-cv-service\.env` — MONGO_URI (mêmes credentials S7, DB `coach`), PORT=8300. Voir `.env.example`.

## Run

```bash
cd C:\Users\PC\Desktop\Coach\coach-cv-service
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --port 8300
```

## Vérifié (2026-11-12)

- ingest-text → search → list → delete → search (occurrences = 0 après suppression) ✅
- Reformule automatique si 0 résultat (notes indiquent la stratégie) ✅
- `sufficiency` : `enough` ≥ 3 occurrences · `partial` ≥ 1 · `insufficient` sinon ✅
