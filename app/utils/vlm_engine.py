import av
import torch
import numpy as np
from transformers import LlavaNextVideoForConditionalGeneration, LlavaNextVideoProcessor
import json
import os

# Initialize model and processor
# Using 4-bit load_in_4bit to save VRAM as per plan
model_id = "llava-hf/LLaVA-NeXT-Video-7B-hf"
processor = None
model = None

def load_vlm():
    global processor, model
    if model is None:
        try:
            print("Loading LLaVA-NeXT-Video-7B (4-bit)...")
            processor = LlavaNextVideoProcessor.from_pretrained(model_id)
            model = LlavaNextVideoForConditionalGeneration.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                device_map="auto",
                load_in_4bit=True
            )
        except Exception as e:
            print(f"Error loading VLM: {e}")

def read_video_pyav(container, indices):
    frames = []
    container.seek(0)
    start_index = indices[0]
    end_index = indices[-1]
    for i, frame in enumerate(container.decode(video=0)):
        if i > end_index:
            break
        if i >= start_index and i in indices:
            frames.append(frame)
    return np.stack([x.to_ndarray(format="rgb24") for x in frames])

async def analyze_loan_video(video_path: str, transcript: str):
    if model is None:
        load_vlm()
    
    if model is None:
        return {
            "summary": "VLM not weighted/loaded.",
            "suspicious_flags": ["Model initialization error"],
            "behavior_score": 0.0,
            "environment_check": "Unknown"
        }

    container = av.open(video_path)
    total_frames = container.streams.video[0].frames
    # Sample 8 frames as per user preference/default
    indices = np.arange(0, total_frames, total_frames / 8).astype(int)
    clip = read_video_pyav(container, indices)

    prompt = f"""
    Act as a fraud detection expert for financial video KYC. 
    Analyze this video where a customer is supposedly saying: "{transcript}"
    
    Provide your analysis in JSON format with the following keys:
    1. "summary": A brief overview of the applicant's presence and demeanor.
    2. "suspicious_flags": A list of observations like off-screen eye contact, coaching, or lip-sync mismatch.
    3. "behavior_score": A float from 0 to 1 where 1 is trustworthy and 0 is high risk.
    4. "environment_check": Describe if the background is professional and if other people are present.
    
    JSON:
    """

    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "video"},
            ],
        },
    ]

    p_text = processor.apply_chat_template(conversation, add_generation_prompt=True)
    inputs = processor(text=p_text, videos=clip, return_tensors="pt").to(model.device)

    # Generate
    out = model.generate(**inputs, max_new_tokens=256)
    decoded = processor.batch_decode(out, skip_special_tokens=True)[0]
    
    # Simple JSON extraction
    try:
        # Look for JSON structure
        json_start = decoded.find("{")
        json_end = decoded.rfind("}") + 1
        return json.loads(decoded[json_start:json_end])
    except:
        return {
            "summary": decoded.strip(),
            "suspicious_flags": [],
            "behavior_score": 0.5,
            "environment_check": "Unable to parse structured response"
        }
