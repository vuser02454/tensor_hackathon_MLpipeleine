import os
import json
from groq import Groq
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def call_groq(prompt: str, model: str = "llama3-8b-8192"):
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=model,
            response_format={"type": "json_object"}
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as e:
        print(f"Groq failed: {e}")
        return None

def call_gemini(prompt: str):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(f"{prompt}\n\nPlease return strictly valid JSON.")
        # Try to extract JSON from markdown if necessary
        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        print(f"Gemini failed: {e}")
        return None

def classify_transcript(transcript: str):
    prompt = f"""
    Extract structured information from the following loan application transcript.
    Handle Hindi or English inputs.
    Return JSON format:
    {{
      "income": "string",
      "job": "string",
      "purpose": "string",
      "consent": boolean,
      "language_detected": "string"
    }}

    Transcript:
    \"\"\"{transcript}\"\"\"
    """
    
    # Try Groq first
    result = call_groq(prompt)
    if result:
        return result
    
    # Fallback to Gemini
    return call_gemini(prompt)

def explain_offer(data: dict):
    prompt = f"""
    Generate a 2-sentence explanation for a loan decision based on the following data:
    Risk Score: {data['risk_score']}
    Bureau Score: {data['bureau_score']}
    Income: {data['income']}
    Purpose: {data['purpose']}
    
    Status: {'Approved' if data['bureau_score'] > 600 else 'Consultation Required'}
    
    Keep it professional and concise.
    """
    try:
        # We don't need JSON here, just text
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            max_tokens=100
        )
        return chat_completion.choices[0].message.content.strip()
    except:
        # Fallback to Gemini text
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            return response.text.strip()
        except:
            return "Based on your credit profile and income, we have generated this customized loan offer for your consideration."
