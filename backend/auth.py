import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from database import create_session, get_session

load_dotenv()

router = APIRouter()

twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_from = os.getenv("TWILIO_WHATSAPP_FROM")

if not twilio_sid or not twilio_token or not twilio_from:
    raise RuntimeError("Twilio env variables are missing")

twilio_client = Client(twilio_sid, twilio_token)


class SendLinkRequest(BaseModel):
    phone_number: str


@router.post("/api/auth/send-link")
async def send_link(payload: SendLinkRequest):
    session_id = create_session(
        {
            "phone_number": payload.phone_number,
            "device_info": "",
            "ip_address": "",
            "geo_data": {},
            "status": "pending",
        }
    )

    body = (
        "Hi! Click here to start your loan application:\n"
        f"http://localhost:3000/call?session={session_id}"
    )

    try:
        twilio_client.messages.create(
            from_=f"whatsapp:{twilio_from}",
            to=f"whatsapp:{payload.phone_number}",
            body=body,
        )
    except TwilioRestException as exc:
        raise HTTPException(status_code=502, detail=f"Twilio send failed: {exc}") from exc

    return {"session_id": session_id, "message": "Link sent"}


@router.get("/api/auth/verify")
async def verify_session(session: str = Query(...)):
    session_doc = get_session(session)
    if not session_doc:
        return {"valid": False, "phone_number": ""}
    return {
        "valid": True,
        "phone_number": session_doc.get("phone_number", ""),
    }
