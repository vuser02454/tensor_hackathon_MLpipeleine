from fastapi import FastAPI
from fastapi import HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict

from auth import router as auth_router
from audit import router as audit_router
import database as database_module
from database import create_session, get_session, update_session
from geo_fraud import router as geo_fraud_router

app = FastAPI(title="Member 2 Backend")
app.include_router(geo_fraud_router)
app.include_router(auth_router)
app.include_router(audit_router)


class SessionCreateRequest(BaseModel):
    phone_number: str
    device_info: str
    ip_address: str


class SessionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    session_id: str


class AutofillRequest(BaseModel):
    income: int
    job_type: str
    loan_purpose: str
    loan_amount_requested: int
    consent_given: bool
    language_detected: str


@app.get("/health")
async def health():
    return {"status": "ok", "db": database_module.BACKEND}


@app.post("/api/session/create")
async def create_session_endpoint(payload: SessionCreateRequest):
    session_id = create_session(payload.model_dump())
    return {"session_id": session_id}


@app.put("/api/session/update")
async def update_session_endpoint(payload: SessionUpdateRequest):
    payload_data = payload.model_dump()
    session_id = payload_data.pop("session_id")
    updated = update_session(session_id, payload_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@app.get("/api/session/{session_id}")
async def get_session_endpoint(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/autofill")
async def autofill_endpoint(payload: AutofillRequest, session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    kyc_form = {
        "applicant_income": payload.income,
        "employment_type": payload.job_type,
        "purpose_of_loan": payload.loan_purpose,
        "requested_amount": payload.loan_amount_requested,
        "verbal_consent": payload.consent_given,
        "preferred_language": payload.language_detected,
        "form_filled_at": datetime.now(timezone.utc).isoformat(),
    }

    updated = update_session(
        session_id,
        {
            "kyc_form": kyc_form,
            "consent_captured": payload.consent_given,
        },
    )

    return {"kyc_form": kyc_form, "autofill_success": updated}
