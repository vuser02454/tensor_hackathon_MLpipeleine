from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

# Task 2: Transcription
class TranscribeResponse(BaseModel):
    transcript: str
    language: str

# Task 3: Classification
class ClassificationRequest(BaseModel):
    transcript: str

class LoanApplicationData(BaseModel):
    income: str
    job: str
    purpose: str
    consent: bool
    language_detected: str

# Task 4: Age Estimation
class AgeEstimationResponse(BaseModel):
    estimated_age: int
    declared_age: int
    match: bool
    confidence: float
    flag: Optional[str] = None

# Task 5: Emotion Detection
class EmotionDetectionResponse(BaseModel):
    emotion: str
    stress_score: float
    all_emotions: Dict[str, float]
    flag: Optional[str] = None

# Task 6: Liveness Check
class LivenessCheckResponse(BaseModel):
    is_live: bool
    blink_detected: bool
    head_pose: str
    confidence: float
    flag: Optional[str] = None

# Task 7: Offer Engine
class OfferRequest(BaseModel):
    risk_score: float
    bureau_score: int
    income: float
    purpose: str

class LoanOffer(BaseModel):
    loan_amount: float
    interest_rate: float
    emi: float
    decision_explanation: str
    risk_category: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    explanation: Optional[str] = None # Added because user test uses 'explanation' field name

# Task 10: Video Intelligence
class VideoIntelligenceResponse(BaseModel):
    summary: Optional[str] = None
    suspicious_flags: Optional[list[str]] = None
    behavior_score: Optional[float] = None
    environment_check: Optional[str] = None
    fraud_detected: bool = False
    fraud_type: Optional[str] = None
    flags: list[str] = []
    lip_sync_match: bool = True
    scene_summary: str = ""
    confidence_score: float = 0.0
    decision: str = ""
