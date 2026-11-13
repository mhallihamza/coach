"""Evolve CV Service — FastAPI + LangGraph.

Save and retrieve CVs. Called by:
- the coach-mcp `search_cv` / `save_cv` tools (via HTTP),
- the FastAPI backend (`POST /api/career/cv`),
- Langflow flows that need CVs as reference.

DB: MongoDB `coach` (shared with the rest of Evolve). Not an MCP server — an internal service.
"""
import io
from typing import List, Optional

from docx import Document
from fastapi import Depends, FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pypdf import PdfReader

from . import db, graph

app = FastAPI(title="Evolve CV Service", version="1.0.0")
bearer = HTTPBearer(auto_error=False)

ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
}
MAX_SIZE = 8 * 1024 * 1024  # 8 Mo


def check_service_token(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if db.CV_SERVICE_TOKEN:
        if creds is None or creds.credentials != db.CV_SERVICE_TOKEN:
            raise HTTPException(status_code=401, detail="CV service token invalide.")
    return True


@app.on_event("startup")
def startup():
    db.ensure_indexes()


def extract_text(filename: str, content_type: Optional[str], raw: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf") or content_type == "application/pdf":
        try:
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"PDF illisible: {exc}")
        if not text.strip():
            raise HTTPException(status_code=422, detail="PDF sans texte extractible (scan ?).")
        return text
    if name.endswith(".docx"):
        try:
            doc = Document(io.BytesIO(raw))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"DOCX illisible: {exc}")
    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Fichier texte illisible: {exc}")


# ───────────────────────── Ingest ─────────────────────────

@app.post("/ingest", dependencies=[Depends(check_service_token)])
async def ingest(
    user_id: str = Form(..., min_length=2, max_length=64),
    filename: Optional[str] = Form(None),
    language: str = Form("unknown"),
    file: UploadFile = File(...),
):
    raw = await file.read()
    if len(raw) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 8 Mo).")
    name = filename or file.filename or "cv"
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if f".{ext}" not in ALLOWED_MIME.values():
        raise HTTPException(status_code=415, detail=f"Format non supporté ({ext}). Formats: pdf, docx, txt, md.")

    text = extract_text(name, file.content_type, raw)

    result = graph.ingest_graph.invoke({
        "user_id": user_id,
        "filename": name,
        "language": language,
        "parsed_text": text,
    })
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    from bson import Binary

    # Store the ORIGINAL file bytes in Mongo (Binary) when small enough (< 14 MiB).
    if len(raw) < 14 * 1024 * 1024:
        db.cvs.update_one(
            {"_id": db.to_object_id(result.get("cv_id"))},
            {"$set": {
                "fileBinary": Binary(raw),
                "fileSize": len(raw),
                "contentType": file.content_type or "application/octet-stream",
                "fileExtension": ext,
            }},
        )

    return {
        "ok": True,
        "cvId": result.get("cv_id"),
        "chunks": len(result.get("chunks", [])),
        "fileName": name,
        "status": "ready",
        "fileStored": len(raw) < 14 * 1024 * 1024,
    }


class IngestTextIn(BaseModel):
    user_id: str
    filename: str
    language: str = "unknown"
    parsed_text: str = Field(min_length=20)


@app.post("/ingest-text", dependencies=[Depends(check_service_token)])
def ingest_text(body: IngestTextIn):
    result = graph.ingest_graph.invoke({
        "user_id": body.user_id,
        "filename": body.filename,
        "language": body.language,
        "parsed_text": body.parsed_text,
    })
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])
    return {"ok": True, "cvId": result.get("cv_id"), "chunks": len(result.get("chunks", [])), "status": "ready"}


# ───────────────────────── Retrieve / list / delete ─────────────────────────

class SearchIn(BaseModel):
    user_id: str
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


@app.post("/search", dependencies=[Depends(check_service_token)])
def search(body: SearchIn):
    result = graph.retrieve_graph.invoke({"user_id": body.user_id, "query": body.query})
    passages = result.get("passages", [])[: body.limit]
    return {
        "ok": True,
        "passages": passages,
        "occurrences": len(passages),
        "sufficiency": "enough" if len(passages) >= 3 else "partial" if passages else "insufficient",
        "notes": result.get("notes", []),
    }


@app.get("/cvs/{user_id}", dependencies=[Depends(check_service_token)])
def list_cvs(user_id: str):
    items = list(db.cvs.find({"userId": user_id}, {"parsedText": 0, "fileBinary": 0}).sort("createdAt", -1).limit(50))
    out = []
    for i in items:
        out.append({
            "id": str(i.get("_id")),
            "fileName": i.get("fileName"),
            "language": i.get("language"),
            "chunksCount": i.get("chunksCount"),
            "status": i.get("status"),
            "createdAt": i.get("createdAt"),
            "fileSize": i.get("fileSize"),
            "contentType": i.get("contentType"),
            "fileExtension": i.get("fileExtension"),
            "fileStored": "fileSize" in i,
        })
    return {"ok": True, "cvs": out}


@app.delete("/cvs/{user_id}/{cv_id}", dependencies=[Depends(check_service_token)])
def delete_cv(user_id: str, cv_id: str):
    oid = db.to_object_id(cv_id)
    deleted = db.cvs.find_one_and_delete({"_id": oid, "userId": user_id})
    if not deleted:
        raise HTTPException(status_code=404, detail="CV introuvable pour cet utilisateur.")
    chunks = db.cv_chunks.delete_many({"userId": user_id, "cvId": oid}).deleted_count
    mem = db.memories.delete_many({"userId": user_id, "sourceType": "cv", "sourceId": cv_id}).deleted_count
    return {"ok": True, "deleted": True, "chunksRemoved": chunks, "memoriesRemoved": mem}


@app.get("/file/{user_id}/{cv_id}", dependencies=[Depends(check_service_token)])
def get_cv_file(user_id: str, cv_id: str):
    oid = db.to_object_id(cv_id)
    doc = db.cvs.find_one({"_id": oid, "userId": user_id}, {"fileBinary": 1, "fileName": 1, "contentType": 1, "fileSize": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="CV introuvable pour cet utilisateur.")
    data = doc.get("fileBinary")
    if not data:
        raise HTTPException(status_code=404, detail="Fichier original non stocké (CV trop volumineux ou ingéré sans fichier).")
    return Response(
        content=bytes(data),
        media_type=doc.get("contentType") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.get("fileName", "cv")}"'},
    )


@app.get("/health")
def health():
    db.cvs.estimated_document_count()
    return {"ok": True, "db": db.DATABASE_NAME, "engine": "langgraph"}



# ------------------------- Knowledge search (psych books) -------------------------

from pydantic import BaseModel as _SM

class KnowledgeSearchIn(_SM):
    query: str
    limit: int = 5

@app.post("/search-knowledge")
def search_knowledge(body: KnowledgeSearchIn):
    """Semantic search over the psychology reference library (AstraDB coach)."""
    import os
    from astrapy import DataAPIClient
    TOKEN = os.environ.get("ASTRA_TOKEN") or os.environ.get("ASTRA_DB_TOKEN")
    ENDPOINT = os.environ.get("ASTRA_ENDPOINT", "https://ac0fdcb8-213f-4772-82d7-95d56639f0ad-us-east-2.apps.astra.datastax.com")
    if not TOKEN:
        return {"ok": False, "error": "ASTRA_TOKEN missing in coach-cv-service env", "passages": [], "sufficiency": "insufficient", "occurrences": 0}
    try:
        client = DataAPIClient(TOKEN)
        db = client.get_database(ENDPOINT, keyspace="default_keyspace")
        col = db.get_collection("coach")
        docs = list(col.find({}, sort={"$vectorize": body.query}, limit=body.limit, projection={"title": 1, "author": 1, "file": 1, "page": 1, "$vectorize": 1}))
        passages = [{
            "title": d.get("title"),
            "author": d.get("author"),
            "file": d.get("file"),
            "page": d.get("page"),
            "excerpt": (d.get("$vectorize") or "")[:400],
        } for d in docs]
        return {
            "ok": True,
            "passages": passages,
            "occurrences": len(passages),
            "sufficiency": "enough" if len(passages) >= 3 else "partial" if passages else "insufficient",
            "notes": [],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300], "passages": [], "sufficiency": "insufficient", "occurrences": 0}
