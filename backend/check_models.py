import os
from google import genai
from dotenv import load_dotenv

# Load your API key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ ERROR: Could not find GEMINI_API_KEY in the .env file.")
else:
    # Initialize the client
    client = genai.Client(api_key=api_key)
    print("✅ API Key found! Asking Google for your available models...\n")
    
    print("--- YOUR AVAILABLE MODELS ---")
    
    # Iterate through the models and print them
    for m in client.models.list():
        # Just print the model's internal name and its readable display name
        print(f"{m.name}  (Display: {m.display_name})")
            
    print("-----------------------------")