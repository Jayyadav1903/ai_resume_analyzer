import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load your API key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ ERROR: Could not find GEMINI_API_KEY in the .env file.")
else:
    genai.configure(api_key=api_key)
    print("✅ API Key found! Asking Google for your available models...\n")
    
    print("--- YOUR AVAILABLE MODELS ---")
    # Loop through and print every model that can generate text
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(m.name)
    print("-----------------------------")