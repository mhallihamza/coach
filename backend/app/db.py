from pymongo import MongoClient
from . import config

client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=10000)
db = client[config.DATABASE_NAME]

users = db["users"]
profiles = db["user_profiles"]
consents = db["consents"]
goals = db["goals"]
habits = db["habits"]
habit_logs = db["habit_logs"]
assessments = db["assessments"]
gap_reports = db["gap_reports"]
messages = db["messages"]
conversations = db["conversations"]
agent_executions = db["agent_executions"]
career_objectives = db["career_objectives"]
cvs = db["cvs"]
cv_chunks = db["cv_chunks"]


def ensure_indexes():
    """Crée les index ; ignore les conflits avec les index déjà créés par le serveur MCP (specs alignées)."""
    def safe(collection, *args, **kwargs):
        try:
            collection.create_index(*args, **kwargs)
        except Exception:
            pass

    safe(users, "email", unique=True, sparse=True)  # aligné sur mcp-server/src/db.js
    safe(users, "userId", unique=True)
    safe(profiles, "userId", unique=True)
    safe(consents, [("userId", 1), ("consentType", 1)], unique=True)
    safe(goals, [("userId", 1), ("status", 1)])
    safe(habits, "userId")
    safe(habit_logs, [("userId", 1), ("habitId", 1), ("date", 1)])
    safe(assessments, [("userId", 1), ("createdAt", -1)])
    safe(messages, [("conversationId", 1), ("createdAt", 1)])
    safe(conversations, [("userId", 1), ("updatedAt", -1)])
    safe(agent_executions, [("userId", 1), ("createdAt", -1)])
