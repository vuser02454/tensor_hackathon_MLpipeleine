import base64
import os
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_session, insert_audit_record, update_session

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

router = APIRouter()


class SaveVideoRequest(BaseModel):
    session_id: str
    video_base64: str


class FinalizeRequest(BaseModel):
    session_id: str


@router.post("/api/audit/save-video")
async def save_video(payload: SaveVideoRequest):
    session = get_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    video_base64 = payload.video_base64
    if "," in video_base64:
        video_base64 = video_base64.split(",", 1)[1]

    try:
        base64.b64decode(video_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid video_base64 payload") from exc

    data_uri = f"data:video/mp4;base64,{video_base64}"
    try:
        upload_result = cloudinary.uploader.upload(
            data_uri,
            resource_type="video",
            folder="loan_onboarding_audit_videos",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {exc}") from exc

    video_url = upload_result.get("secure_url") or upload_result.get("url")
    if not video_url:
        raise HTTPException(status_code=502, detail="Cloudinary did not return a video URL")

    updated = update_session(payload.session_id, {"video_url": video_url})
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"video_url": video_url}


@router.post("/api/audit/finalize")
async def finalize_audit(payload: FinalizeRequest):
    session = get_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    audit_record = {
        "session_id": session.get("session_id"),
        "phone_number": session.get("phone_number"),
        "transcript": session.get("transcript", ""),
        "kyc_form": session.get("kyc_form"),
        "offer_generated": session.get("offer"),
        "geo_data": session.get("geo_data", {}),
        "fraud_flags": session.get("fraud_flags", []),
        "video_url": session.get("video_url"),
        "consent_captured": session.get("consent_captured", False),
        "decision": session.get("decision"),
        "decision_reason": session.get("decision_reason"),
        "finalized_at": datetime.now(timezone.utc),
    }

    insert_result = insert_audit_record(audit_record)
    update_session(payload.session_id, {"status": "completed"})

    return {"audit_id": str(insert_result.inserted_id), "success": True}
