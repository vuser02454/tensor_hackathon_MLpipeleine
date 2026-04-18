import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from faster_whisper import WhisperModel
from app.models.schemas import TranscribeResponse
import shutil
import tempfile

router = APIRouter()

# Initialize the Whisper model
model_size = "base"
try:
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
except Exception as e:
    print(f"Error loading Whisper model: {e}")
    model = None

def transcribe_audio(file_path: str):
    """Function exposed for easier testing and mocking."""
    if model is None:
        return None
    segments, info = model.transcribe(file_path, beam_size=5)
    transcript = "".join([segment.text for segment in segments])
    return {
        "transcript": transcript.strip(),
        "language": info.language
    }

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_endpoint(audio: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=500, detail="Whisper model not initialized")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio.filename)[1]) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    try:
        result = transcribe_audio(tmp_path)
        if not result:
            raise HTTPException(status_code=500, detail="Transcription failed")
        
        return TranscribeResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
