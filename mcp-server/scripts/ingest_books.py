#!/usr/bin/env python3
"""Bulk ingest psychology books/notes into the Evolve knowledge library (MongoDB coach).

Usage:
  py scripts/ingest_books.py <folder> [--uploader system-seed]

Reads every .txt / .md / .pdf in the folder (fixed parsers — no LLM reads the files),
chunks them, and upserts them in the shared library (books + book_chunks).
Title = file stem · author = "Notes originales Evolve AI" · topics = auto-tags + filename tokens.
Skips books whose title already exists.
Never ingest full copyrighted texts — only originals, free texts, or notes you own.
"""
import argparse
import io
import re
import sys
from pathlib import Path

from pymongo import MongoClient

import os

DEFAULT_DB = "coach"

TOPIC_HINTS = {
    "procrastin": "procrastination,habitudes",
    "procrastination": "procrastination,habitudes",
    "communic": "communication,écoute",
    "communication": "communication,écoute,feedback",
    "emotion": "émotions,régulation,intelligence émotionnelle",
    "émotion": "émotions,régulation,intelligence émotionnelle",
    "habitude": "habitudes,discipline,routines",
    "habit": "habitudes,discipline,routines",
    "objectif": "objectifs,SMART,planification",
    "goal": "objectifs,SMART,planification",
    "motivation": "motivation,engagement",
    "energie": "énergie,sommeil",
    "sommeil": "énergie,sommeil",
    "confiance": "confiance en soi,auto-efficacité",
    "stress": "stress,régulation",
    "sommeil": "énergie,sommeil",
}

STOP = {"the", "and", "de", "la", "les", "des", "du", "un", "une", "et", "ou", "en", "sur", "dans", "pour", "avec"}


def read_env():
    uri = os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI")
    if not uri:
        for candidate in (Path(__file__).parents[2] / "backend" / ".env", Path(__file__).parents[2] / "coach-cv-service" / ".env"):
            if candidate.exists():
                for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                    m = re.match(r"^(MONGO_URI|MONGODB_URI)\s*=\s*(.+)$", line.strip())
                    if m:
                        return m.group(2).strip()
        raise SystemExit("MONGO_URI introuvable (env ou backend/.env ou coach-cv-service/.env).")
    return uri


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in (".txt", ".md"):
        return path.read_text(encoding="utf-8", errors="ignore")
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(path.read_bytes()))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    return ""


def chunks_of(text: str, size=800, overlap=120):
    words = text.split()
    out, i = [], 0
    while i < len(words) and len(out) < 1000:
        chunk = " ".join(words[i:i + size // 5])
        if len(chunk) > 40:
            out.append(chunk)
        i += max(1, (size - overlap) // 5)
    return out


def topics_for(stem: str, text: str):
    low = (stem + " " + text[:2000]).lower()
    topics = []
    for key, tags in TOPIC_HINTS.items():
        if key in low:
            topics.extend(tags.split(","))
    if not topics:
        words = [w for w in re.split(r"[^a-zàâçéèêëîïôûùüœ]+", low) if len(w) > 4 and w not in STOP][:3]
        topics = words or ["général"]
    return list(dict.fromkeys(topics))[:10]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    parser.add_argument("--uploader", default="system-seed")
    args = parser.parse_args()

    if not args.folder.is_dir():
        raise SystemExit(f"{args.folder} n'est pas un dossier.")

    client = MongoClient(read_env(), serverSelectionTimeoutMS=10000)
    db = client[DEFAULT_DB]
    books, chunks = db["books"], db["book_chunks"]

    try:
        chunks.create_index([("text", "text")])
    except Exception:
        pass

    added, skipped = 0, 0
    for path in sorted(args.folder.iterdir()):
        if path.suffix.lower() not in (".txt", ".md", ".pdf"):
            continue
        title = path.stem.replace("_", " ").replace("-", " ").strip().title()
        if books.find_one({"title": title}):
            print(f"déjà présent, ignoré: {title}")
            skipped += 1
            continue
        text = extract_text(path)
        if len(text) < 100:
            print(f"ignoré (trop court): {path.name}")
            continue
        doc = chunks_of(text)
        topics = topics_for(path.stem, text)
        r = books.insert_one({
            "userId": args.uploader,
            "title": title,
            "author": "Notes originales / libres de droit Evolve AI",
            "topics": topics,
            "language": "fr",
            "chunksCount": len(doc),
            "createdAt": __import__("datetime").datetime.utcnow(),
        })
        chunks.insert_many([{"bookId": r.inserted_id, "seq": i, "text": t, "createdAt": __import__("datetime").datetime.utcnow()} for i, t in enumerate(doc)])
        print(f"ingéré: {title} ({len(doc)} chunks, topics={topics})")
        added += 1

    print(f"\nTerminé. {added} livre(s) ajouté(s), {skipped} ignoré(s).")
    client.close()


if __name__ == "__main__":
    main()
