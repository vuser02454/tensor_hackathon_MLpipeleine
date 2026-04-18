import os
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise RuntimeError("MONGO_URI is not set in environment")

_memory_sessions: dict[str, dict] = {}
_memory_audit_logs: list[dict] = []

BACKEND = "memory"  # "mongo" | "memory"
client: MongoClient | None = None
db = None
sessions_collection = None


def _serialize_document(document: dict | None) -> dict | None:
    if not document:
        return None
    document = deepcopy(document)
    if isinstance(document.get("_id"), ObjectId):
        document["_id"] = str(document["_id"])
    return document


def _ping_mongo(mongo_client: MongoClient) -> bool:
    try:
        mongo_client.admin.command("ping")
        return True
    except Exception:
        return False


def _init_mongo() -> bool:
    global client, db, sessions_collection
    kwargs: dict = {"serverSelectionTimeoutMS": 5000}
    try:
        import certifi

        kwargs["tlsCAFile"] = certifi.where()
    except Exception:
        pass

    try:
        candidate = MongoClient(mongo_uri, **kwargs)
        if _ping_mongo(candidate):
            client = candidate
            db = client["loandb"]
            sessions_collection = db["sessions"]
            return True
    except Exception:
        pass
    return False


def _init_backend() -> None:
    global BACKEND
    force_memory = os.getenv("USE_MEMORY_DB", "").lower() in ("1", "true", "yes")
    if force_memory:
        BACKEND = "memory"
        return

    if _init_mongo():
        BACKEND = "mongo"
        return

    BACKEND = "memory"


_init_backend()


class _InsertResult:
    __slots__ = ("inserted_id",)

    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


def insert_audit_record(record: dict) -> _InsertResult:
    if BACKEND == "mongo":
        result = db["audit_logs"].insert_one(record)
        return _InsertResult(str(result.inserted_id))

    inserted_id = str(uuid4())
    doc = {**record, "_id": inserted_id}
    _memory_audit_logs.append(doc)
    return _InsertResult(inserted_id)


def create_session(data: dict) -> str:
    session_id = str(uuid4())
    status = data.get("status", "in_progress")
    session_doc = {
        "session_id": session_id,
        "phone_number": data.get("phone_number", ""),
        "device_info": data.get("device_info", ""),
        "ip_address": data.get("ip_address", ""),
        "geo_data": data.get("geo_data", {}),
        "transcript": "",
        "age_estimate": 0,
        "fraud_flags": [],
        "offer": None,
        "consent_captured": False,
        "kyc_form": None,
        "created_at": datetime.now(timezone.utc),
        "status": status,
    }
    if BACKEND == "mongo":
        sessions_collection.insert_one(session_doc)
    else:
        _memory_sessions[session_id] = deepcopy(session_doc)
    return session_id


def update_session(session_id: str, fields: dict) -> bool:
    if BACKEND == "mongo":
        result = sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": fields},
        )
        return result.matched_count > 0

    if session_id not in _memory_sessions:
        return False
    _memory_sessions[session_id].update(fields)
    return True


def get_session(session_id: str) -> dict | None:
    if BACKEND == "mongo":
        document = sessions_collection.find_one({"session_id": session_id})
        return _serialize_document(document)

    doc = _memory_sessions.get(session_id)
    return deepcopy(doc) if doc else None
