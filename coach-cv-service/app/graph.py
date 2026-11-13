"""LangGraph pipelines for the Evolve CV service.

Two graphs:
- ingest_graph:   parse -> clean -> chunk -> store        (CV lifecycle: save)
- retrieve_graph: reformulate-if-needed -> $text search -> format (retrieve)

State is a plain dict; nodes are pure functions. MongoDB ($text) is the retrieval
backend today; the chunk schema is ready for Atlas Vector Search (see README).
"""
import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from . import db

# ───────────────────────────── Ingest graph ─────────────────────────────

class IngestState(TypedDict, total=False):
    user_id: str
    filename: str
    language: str
    parsed_text: str
    clean_text: str
    chunks: list[str]
    cv_id: str
    status: str
    error: str


def parse_document(state: IngestState) -> IngestState:
    text = state.get("parsed_text", "").strip()
    if len(text) < 20:
        return {"error": "Texte trop court ou vide après extraction (minimum 20 caractères).", "status": "failed"}
    return {"parsed_text": text[:200_000]}


def clean_text(state: IngestState) -> IngestState:
    text = state["parsed_text"]
    text = _fix_letterspacing(text)
    text = re.sub(r"\x00", " ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return {"clean_text": text.strip()}


def _fix_letterspacing(text: str) -> str:
    """
    PDF extraction from letter-spaced layouts (e.g. LibreOffice display=letter-spacing)
    emits one glyph per token ('E X P E R I E N C E'). Tokens-only joins would merge
    everything, so we repair per LINE with a 60%-single-glyph rule:
    - a line where ≥60% of tokens are 1-2 chars and no token exceeds length 4 is letter-spaced
    - within such lines, we reconstruct word boundaries from separators (|, —, –, bullet, newline)
      and digits (numbers are kept together)
    """
    out_lines = []
    for line in text.splitlines():
        tokens = line.split()
        if len(tokens) < 4:
            out_lines.append(line)
            continue
        short = sum(1 for t in tokens if len(t) <= 2)
        if short / len(tokens) < 0.6:
            out_lines.append(line)
            continue
        rebuilt: list[str] = []
        buf = ""
        for t in tokens:
            if t in ("|", "•", "–", "—", "-",):
                if buf:
                    rebuilt.append(buf); buf = ""
                rebuilt.append(" " + t + " ")
                continue
            if t.isdigit():
                if buf:
                    rebuilt.append(buf); buf = ""
                rebuilt.append(t)
                continue
            if len(t) >= 3:
                if buf:
                    rebuilt.append(buf); buf = ""
                rebuilt.append(t)
            else:
                buf += t
        if buf:
            rebuilt.append(buf)
        out_lines.append(" ".join(s for s in rebuilt if s.strip()))
    return "\n".join(out_lines)


def chunk_text(state: IngestState) -> IngestState:
    text = state["clean_text"]
    words = text.split()
    chunks: list[str] = []
    size, overlap = 160, 30  # ≈ 800/150 caractères, par mots
    i = 0
    while i < len(words) and len(chunks) < 500:
        chunk = " ".join(words[i:i + size])
        if len(chunk) > 40:
            chunks.append(chunk)
        i += max(1, size - overlap)
    if not chunks:
        chunks = [text[:2000]]
    return {"chunks": chunks}


def store_documents(state: IngestState) -> IngestState:
    user_id = state["user_id"]
    filename = state.get("filename", "cv")[:300]
    language = state.get("language", "unknown")
    chunks = state.get("chunks", [])
    clean = state["clean_text"]

    result = db.cvs.insert_one({
        "userId": user_id,
        "fileName": filename,
        "language": language,
        "parsedText": clean[:200_000],
        "chunksCount": len(chunks),
        "status": "ready",
        "createdAt": __import__("datetime").datetime.utcnow(),
    })
    cv_id = result.inserted_id
    if chunks:
        db.cv_chunks.insert_many([
            {"userId": user_id, "cvId": cv_id, "seq": i, "text": t, "createdAt": __import__("datetime").datetime.utcnow()}
            for i, t in enumerate(chunks)
        ])
    return {"cv_id": str(cv_id), "status": "ready"}


def build_ingest_graph():
    graph = StateGraph(IngestState)
    graph.add_node("parse_doc", parse_document)
    graph.add_node("clean_doc", clean_text)
    graph.add_node("chunk_doc", chunk_text)
    graph.add_node("store_doc", store_documents)

    graph.set_entry_point("parse_doc")
    graph.add_conditional_edges(
        "parse_doc",
        lambda s: "end_failed" if s.get("error") else "clean_doc",
        {"clean_doc": "clean_doc", "end_failed": END},
    )
    graph.add_edge("clean_doc", "chunk_doc")
    graph.add_edge("chunk_doc", "store_doc")
    graph.add_edge("store_doc", END)
    return graph.compile()


ingest_graph = build_ingest_graph()

# ───────────────────────────── Retrieve graph ─────────────────────────────

class RetrieveState(TypedDict, total=False):
    user_id: str
    query: str
    reformulated: str
    passages: list[dict[str, Any]]
    occurrences: int
    sufficiency: str
    notes: list[str]


_STOPWORDS = {
    "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "a", "au", "aux",
    "the", "a", "an", "of", "to", "in", "is", "are", "i", "my", "mes", "mon", "ma",
    "je", "j", "tu", "il", "elle", "nous", "vous", "ils", "elles", "que", "qui",
    "what", "how", "why", "how do", "est", "sont", "avec", "sans", "pour", "par",
}


def normalize_query(state: RetrieveState) -> RetrieveState:
    q = (state.get("query") or "").strip()
    if len(q) < 2:
        return {"notes": ["Requête vide — rien à chercher."], "sufficiency": "insufficient", "occurrences": 0, "passages": []}
    return {"query": q[:500], "reformulated": q[:500]}


def reformulate_if_needed(state: RetrieveState) -> RetrieveState:
    """If the raw query yields nothing, broaden: drop stopwords, keep content terms."""
    if state.get("error"):
        return {}
    q = state["query"]
    hits = db.cv_chunks.count_documents({"userId": state["user_id"], "$text": {"$search": q}})
    if hits:
        return {}
    terms = [t for t in re.split(r"[\s,;:!?()]+", q.lower()) if t and t not in _STOPWORDS and len(t) > 2]
    broadened = " ".join(dict.fromkeys(terms)) or q
    return {"reformulated": broadened, "notes": [f"Requête élargie: « {broadened} » (0 résultat pour la requête initiale)"]}


def search_cv(state: RetrieveState) -> RetrieveState:
    if state.get("sufficiency") == "insufficient" and not state.get("query"):
        return {}
    user_id = state["user_id"]
    q = state.get("reformulated") or state["query"]
    try:
        docs = (
            db.cv_chunks.find(
                {"userId": user_id, "$text": {"$search": q}},
                {"text": 1, "cvId": 1, "seq": 1, "score": {"$meta": "textScore"}},
            )
            .sort([("score", {"$meta": "textScore"})])
            .limit(8)
            .to_list(8)
        )
    except Exception as exc:
        return {"passages": [], "occurrences": 0, "sufficiency": "insufficient", "notes": [f"Recherche impossible: {exc}"]}

    passages = [{
        "source_type": "cv",
        "source_id": str(d.get("cvId", "")),
        "seq": d.get("seq"),
        "excerpt": d.get("text", "")[:400],
        "score": d.get("score"),
    } for d in docs]

    occurrences = len(passages)
    sufficiency = "enough" if occurrences >= 3 else "partial" if occurrences >= 1 else "insufficient"
    notes = state.get("notes", [])
    if occurrences == 0:
        notes = notes + [f"Aucun passage trouvé pour « {q} » dans les CVs de cet utilisateur."]
    return {"passages": passages, "occurrences": occurrences, "sufficiency": sufficiency, "notes": notes}


def build_retrieve_graph():
    graph = StateGraph(RetrieveState)
    graph.add_node("normalize_query", normalize_query)
    graph.add_node("reformulate_if_needed", reformulate_if_needed)
    graph.add_node("search_cv", search_cv)

    graph.set_entry_point("normalize_query")
    graph.add_conditional_edges(
        "normalize_query",
        lambda s: "done" if s.get("sufficiency") == "insufficient" and not s.get("query") else "search",
        {"search": "reformulate_if_needed", "done": END},
    )
    graph.add_edge("reformulate_if_needed", "search_cv")
    graph.add_edge("search_cv", END)
    return graph.compile()


retrieve_graph = build_retrieve_graph()
