from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uuid
import httpx
from datetime import datetime

app = FastAPI(title="Poonawalla Fincorp - Loan Onboarding Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores
sessions_store = {}
audit_store = {}


# ─── Request Models ───────────────────────────────────────────────────────────

class SendLinkRequest(BaseModel):
    phone_number: str


class SessionUpdateRequest(BaseModel):
    session_id: str

    class Config:
        extra = "allow"


class GeoCheckRequest(BaseModel):
    lat: float
    lng: float
    ip: str


class AutofillRequest(BaseModel):
    income: Optional[int] = 0
    job: Optional[str] = ""
    purpose: Optional[str] = ""
    consent: Optional[bool] = False
    language_detected: Optional[str] = "en"
    session_id: str


class AuditFinalizeRequest(BaseModel):
    session_id: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/auth/send-link")
async def send_link(payload: SendLinkRequest):
    session_id = str(uuid.uuid4())
    sessions_store[session_id] = {
        "session_id": session_id,
        "phone_number": payload.phone_number,
        "device_info": "",
        "ip_address": "",
        "geo_data": {},
        "transcript": "",
        "age_estimate": 0,
        "age_mismatch": False,
        "emotion": "neutral",
        "stress_score": 0.0,
        "is_live": False,
        "fraud_flags": [],
        "offer": None,
        "consent_captured": False,
        "kyc_form": None,
        "created_at": datetime.utcnow().isoformat(),
        "status": "in_progress",
    }
    return {
        "session_id": session_id,
        "message": "Session created successfully",
    }


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id in sessions_store:
        return sessions_store[session_id]
    # Return empty template instead of 404
    return {
        "session_id": session_id,
        "transcript": "",
        "age_estimate": 0,
        "fraud_flags": [],
        "kyc_form": None,
        "offer": None,
        "status": "not_found",
    }


@app.put("/api/session/update")
async def update_session(payload: SessionUpdateRequest):
    payload_data = payload.model_dump()
    session_id = payload_data.pop("session_id")

    if session_id not in sessions_store:
        # Create a minimal session if it doesn't exist
        sessions_store[session_id] = {
            "session_id": session_id,
            "phone_number": "",
            "transcript": "",
            "age_estimate": 0,
            "age_mismatch": False,
            "emotion": "neutral",
            "stress_score": 0.0,
            "is_live": False,
            "fraud_flags": [],
            "offer": None,
            "consent_captured": False,
            "kyc_form": None,
            "created_at": datetime.utcnow().isoformat(),
            "status": "in_progress",
        }

    sessions_store[session_id].update(payload_data)
    return {"success": True}


@app.post("/api/geo-check")
async def geo_check(payload: GeoCheckRequest):
    lat, lng, ip = payload.lat, payload.lng, payload.ip

    # Determine browser_city from lat/lng — generous bounding boxes
    if 18.5 < lat < 19.5 and 72.6 < lng < 73.2:
        browser_city = "Mumbai"
    elif 18.0 < lat < 21.0 and 72.0 < lng < 74.0:
        browser_city = "Mumbai"  # Greater Mumbai / Thane / Navi Mumbai
    elif 12.5 < lat < 13.5 and 77.2 < lng < 78.0:
        browser_city = "Bangalore"
    elif 12.0 < lat < 14.0 and 77.0 < lng < 78.5:
        browser_city = "Bangalore"
    elif 28.3 < lat < 29.0 and 76.8 < lng < 77.5:
        browser_city = "Delhi"
    elif 28.0 < lat < 30.0 and 76.5 < lng < 78.0:
        browser_city = "Delhi"  # NCR region
    elif 17.2 < lat < 17.8 and 78.2 < lng < 78.8:
        browser_city = "Hyderabad"
    elif 16.5 < lat < 18.5 and 77.5 < lng < 80.0:
        browser_city = "Hyderabad"
    elif 13.0 < lat < 13.4 and 80.1 < lng < 80.4:
        browser_city = "Chennai"
    elif 12.5 < lat < 14.0 and 79.5 < lng < 81.0:
        browser_city = "Chennai"
    elif 18.4 < lat < 18.7 and 73.7 < lng < 74.0:
        browser_city = "Pune"
    elif 18.0 < lat < 19.0 and 73.5 < lng < 74.5:
        browser_city = "Pune"
    elif 22.4 < lat < 22.8 and 88.2 < lng < 88.6:
        browser_city = "Kolkata"
    elif 22.0 < lat < 23.5 and 87.5 < lng < 89.5:
        browser_city = "Kolkata"
    elif 23.0 < lat < 23.3 and 72.5 < lng < 72.8:
        browser_city = "Ahmedabad"
    elif 22.5 < lat < 24.0 and 72.0 < lng < 73.5:
        browser_city = "Ahmedabad"
    elif 26.8 < lat < 27.0 and 75.7 < lng < 76.0:
        browser_city = "Jaipur"
    elif 26.5 < lat < 27.5 and 75.0 < lng < 76.5:
        browser_city = "Jaipur"
    elif 21.1 < lat < 21.3 and 72.8 < lng < 73.1:
        browser_city = "Surat"
    elif 26.7 < lat < 27.0 and 80.8 < lng < 81.1:
        browser_city = "Lucknow"
    else:
        browser_city = "Unknown"

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"https://ipapi.co/{ip}/json/",
                headers={"User-Agent": "loan-onboarding-app/1.0"},
            )
            ip_data = resp.json()
            ip_city = (ip_data.get("city") or "").strip() or "Unknown"
            ip_region = (ip_data.get("region") or "").strip().lower()
            ip_country = (ip_data.get("country_name") or "").strip().lower()
    except Exception:
        # Cannot verify IP location — give benefit of doubt
        return {
            "browser_city": browser_city if browser_city != "Unknown" else "India",
            "ip_city": "Unknown",
            "fraud_flag": False,
            "message": "Could not verify location",
        }

    # If we couldn't determine browser city from GPS, don't flag as fraud
    if browser_city == "Unknown":
        return {
            "browser_city": ip_city,   # trust IP city as reference
            "ip_city": ip_city,
            "fraud_flag": False,
            "message": "Location verified (GPS region unknown)",
        }

    # Exact city match
    if ip_city.lower() == browser_city.lower():
        fraud_flag = False
    else:
        # Fuzzy match: check if IP region/state contains the browser city name
        # e.g. browser_city="Mumbai" and ip_region="maharashtra" -> no fraud
        city_to_state = {
            "mumbai": ["maharashtra"],
            "pune": ["maharashtra"],
            "bangalore": ["karnataka", "bengaluru"],
            "delhi": ["delhi", "national capital"],
            "hyderabad": ["telangana", "andhra"],
            "chennai": ["tamil nadu"],
            "kolkata": ["west bengal"],
            "ahmedabad": ["gujarat"],
            "jaipur": ["rajasthan"],
            "surat": ["gujarat"],
            "lucknow": ["uttar pradesh"],
        }
        expected_states = city_to_state.get(browser_city.lower(), [])
        region_match = any(s in ip_region for s in expected_states)

        # Also check: if IP city is a suburb/alternate name of the same metro
        metro_aliases = {
            "mumbai": ["navi mumbai", "thane", "kalyan", "mira road", "vasai", "borivali", "andheri"],
            "delhi": ["gurgaon", "gurugram", "noida", "faridabad", "ghaziabad", "new delhi"],
            "bangalore": ["bengaluru", "electronic city"],
            "hyderabad": ["secunderabad", "cyberabad"],
            "kolkata": ["howrah", "salt lake"],
        }
        aliases = metro_aliases.get(browser_city.lower(), [])
        alias_match = any(alias in ip_city.lower() for alias in aliases)

        fraud_flag = not (region_match or alias_match)

    return {
        "browser_city": browser_city,
        "ip_city": ip_city,
        "fraud_flag": fraud_flag,
        "message": "Location verified" if not fraud_flag else "Location mismatch detected",
    }



@app.post("/api/autofill")
async def autofill(payload: AutofillRequest):
    kyc_form = {
        "applicant_income": payload.income,
        "employment_type": payload.job,
        "purpose_of_loan": payload.purpose,
        "verbal_consent": payload.consent,
        "preferred_language": payload.language_detected,
        "form_completed_at": datetime.utcnow().isoformat(),
    }

    if payload.session_id in sessions_store:
        sessions_store[payload.session_id]["kyc_form"] = kyc_form
        sessions_store[payload.session_id]["consent_captured"] = payload.consent
    else:
        sessions_store[payload.session_id] = {
            "session_id": payload.session_id,
            "kyc_form": kyc_form,
            "consent_captured": payload.consent,
            "transcript": "",
            "age_estimate": 0,
            "age_mismatch": False,
            "emotion": "neutral",
            "stress_score": 0.0,
            "is_live": False,
            "fraud_flags": [],
            "offer": None,
            "created_at": datetime.utcnow().isoformat(),
            "status": "in_progress",
        }

    return {"kyc_form": kyc_form, "autofill_success": True}


@app.post("/api/audit/finalize")
async def audit_finalize(payload: AuditFinalizeRequest):
    session_id = payload.session_id
    session = sessions_store.get(session_id, {})

    audit_id = str(uuid.uuid4())
    compliance_status = (
        "Compliant" if session.get("consent_captured") else "Non-Compliant"
    )

    audit_store[audit_id] = {
        "audit_id": audit_id,
        "session_id": session_id,
        "transcript": session.get("transcript", ""),
        "kyc_form": session.get("kyc_form"),
        "geo_data": session.get("geo_data", {}),
        "fraud_flags": session.get("fraud_flags", []),
        "consent_captured": session.get("consent_captured", False),
        "finalized_at": datetime.utcnow().isoformat(),
        "compliance_status": compliance_status,
    }

    if session_id in sessions_store:
        sessions_store[session_id]["status"] = "completed"

    return {
        "audit_id": audit_id,
        "success": True,
        "compliance_status": compliance_status,
    }
