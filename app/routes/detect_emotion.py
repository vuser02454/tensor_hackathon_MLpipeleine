from fastapi import APIRouter, UploadFile, File, HTTPException
try:
    from fer.fer import FER
except ImportError:
    from fer import FER
from app.models.schemas import EmotionDetectionResponse
import shutil
import tempfile
import os
import cv2

router = APIRouter()

# Initialize the FER detector
try:
    detector = FER(mtcnn=True)
except:
    detector = None

def analyze_emotion(image_path: str):
    """Function exposed for patching in tests."""
    if detector is None:
        return {"emotion": "neutral", "stress_score": 0.0, "emotions": {}}
    
    img = cv2.imread(image_path)
    results = detector.detect_emotions(img)
    if not results:
        return None
    
    res = results[0]
    emotions = res['emotions']
    dominant_emotion = max(emotions, key=emotions.get)
    negative_emotions = ['angry', 'disgust', 'fear', 'sad']
    stress_score = sum(emotions.get(e, 0) for e in negative_emotions)
    
    return {
        "emotion": dominant_emotion,
        "stress_score": round(stress_score, 2),
        "emotions": emotions
    }

@router.post("/detect-emotion", response_model=EmotionDetectionResponse)
async def detect_emotion_endpoint(image: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        shutil.copyfileobj(image.file, tmp)
        tmp_path = tmp.name

    try:
        result = analyze_emotion(tmp_path)
        if not result:
            raise HTTPException(status_code=400, detail="No face/emotions detected")
        
        # Calculate flag based on stress_score
        flag = None
        if result["stress_score"] > 0.8:
            flag = "High stress detected - flagged for fraud review"

        return EmotionDetectionResponse(
            emotion=result["emotion"],
            stress_score=result["stress_score"],
            all_emotions=result["emotions"],
            flag=flag
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
