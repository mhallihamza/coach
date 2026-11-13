import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DATABASE_NAME = os.environ.get("DATABASE_NAME", "coach")
CV_SERVICE_TOKEN = os.environ.get("CV_SERVICE_TOKEN", "")  # empty = open (dev)


def _make_client():
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6000)
        client.admin.command("ping")
        return client
    except Exception:
        # Le resolver local refuse parfois les requêtes SRV — repli sur des DNS publics.
        import dns.resolver
        dns.resolver.default_resolver.nameservers = ["8.8.8.8", "1.1.1.1", "208.67.222.222"]
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        client.admin.command("ping")
        return client


_client = _make_client()
db = _client[DATABASE_NAME]

cvs = db["cvs"]
cv_chunks = db["cv_chunks"]
memories = db["memories"]


def ensure_indexes():
    cvs.create_index([("userId", 1), ("createdAt", -1)])
    try:
        cv_chunks.create_index([("text", "text")])
    except Exception:
        pass  # aligné sur l'index $text existant (mcp-server)
    cv_chunks.create_index([("userId", 1), ("cvId", 1)])


def to_object_id(value):
    from bson import ObjectId

    return ObjectId(value) if hasattr(ObjectId, "is_valid") and ObjectId.is_valid(str(value)) else value
