import faiss
import numpy as np
from google import genai


def chunk_text(texts: str, chunk_size: int=400, overlap: int =50 ) -> list:
    words = texts.split()
    chunks = []
    for i in range (0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    
    return chunks    
         
         
def get_embeddings(texts:list[str]) -> np.ndarray:
    
    client = genai.Client()
    
    response = client.models.embed_content(
        model = 'gemini-embedding-001',
        contents = texts
    )    
    
    vectors = [item.values for item in response.embeddings]     
    return np.array(vectors).astype('float32')

def find_relevant_resume_sections(resume_text: str, job_description: str, top_k: int = 3) -> str:
    
    resume_chunks = chunk_text(resume_text)
    
    if not resume_chunks:
        return ""
    
    chunk_embeddings = get_embeddings(resume_chunks)
    jd_embedding = get_embeddings([job_description])
    
    dimension = chunk_embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    
    index.add(chunk_embeddings)
    
    distances, indices = index.search(jd_embedding, top_k)
    
    relevant_text = "\n...\n".join([resume_chunks[i] for i in indices[0] if i < len(resume_chunks)])
    
    return relevant_text
    