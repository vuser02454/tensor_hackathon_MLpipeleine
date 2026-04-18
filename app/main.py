from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.routes import transcribe, classify, estimate_age, detect_emotion, liveness, generate_offer, video_intelligence

app = FastAPI(title="AI-Powered Loan Assessment Backend")

# Task 9: CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Task 9: Health endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include routers
app.include_router(transcribe.router, tags=["Transcription"])
app.include_router(classify.router, tags=["Classification"])
app.include_router(estimate_age.router, tags=["Age Estimation"])
app.include_router(detect_emotion.router, tags=["Emotion Detection"])
app.include_router(liveness.router, tags=["Liveness Check"])
app.include_router(generate_offer.router, tags=["Offer Engine"])
app.include_router(video_intelligence.router, tags=["Video Intelligence"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
