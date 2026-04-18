"""
Test MongoDB connectivity. Atlas TLS may fail in some environments; the app falls back to in-memory DB.
"""
import os
import sys

import pymongo
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise RuntimeError("MONGO_URI is not set in environment")

print(f"Python {sys.version.split()[0]}, PyMongo {pymongo.version}")

atlas_ok = False
try:
    kwargs = {"serverSelectionTimeoutMS": 5000}
    try:
        import certifi

        kwargs["tlsCAFile"] = certifi.where()
    except Exception:
        pass

    client = MongoClient(mongo_uri, **kwargs)
    result = client.admin.command("ping")
    atlas_ok = True
    print("MongoDB Atlas ping success:", result)
except Exception as exc:
    print("MongoDB Atlas ping FAILED:", type(exc).__name__, str(exc)[:200])

import database as database_module

print("App database backend:", database_module.BACKEND)

sid = database_module.create_session(
    {
        "phone_number": "+0000000000",
        "device_info": "test_mongo",
        "ip_address": "127.0.0.1",
    }
)
doc = database_module.get_session(sid)
if not doc or doc.get("session_id") != sid:
    print("In-memory / app DB smoke test FAILED")
    sys.exit(1)

print("App DB smoke test OK (session_id:", sid, ")")

if not atlas_ok and database_module.BACKEND != "mongo":
    print(
        "Note: Atlas TLS handshake failed from this host. "
        "Check Atlas Network Access / VPN / firewall, or set USE_MEMORY_DB=1 for explicit dev mode."
    )

sys.exit(0 if atlas_ok or database_module.BACKEND == "memory" else 1)
