# AI Resume Analyzer

An asynchronous, event-driven backend system that evaluates resumes against job descriptions using Retrieval-Augmented Generation (RAG) and structured LLM outputs.

## 🚀 System Architecture

This application decouples heavy machine learning workloads from the web server using an asynchronous task queue, ensuring the API remains highly responsive under load.

* **Frontend:** React / TypeScript (Vercel)
* **API Gateway:** FastAPI (Render) - Handles rate-limiting, JWT authentication, and file validation.
* **Message Broker:** Redis (Upstash) - Queues asynchronous tasks.
* **Compute Worker:** Celery (Render) - Processes RAG pipelines and interacts with the Gemini API.
* **Database:** Serverless PostgreSQL (Neon) - Persists user profiles and job results.

## ⚡ Core Features

* **RAG Pipeline:** Converts resumes and job descriptions into vector embeddings for deep semantic comparison before LLM evaluation.
* **Asynchronous Processing:** Long-running AI tasks are offloaded to background Celery workers.
* **Intelligent Caching:** Redis intercepts redundant requests (identical resume/JD pairs) to minimize expensive LLM API calls and reduce latency.
* **RAM-Optimized File Parsing:** Bypasses ephemeral disk I/O bottlenecks by processing PDF and DOCX byte streams entirely in-memory (`io.BytesIO`).
* **Structured Determinism:** Forces the LLM (`temperature=0.0`) to return strict, predictable JSON structures for consistent UI rendering.

## ⚖️ Technical Tradeoffs & Design Decisions

Building for restricted cloud environments (512MB RAM limits) required specific architectural tradeoffs:

1. **Celery Concurrency Limitation (`--concurrency=1`):** * *The Problem:* The Render Free Tier crashes under the memory footprint of parallel ML workers.
   * *The Tradeoff:* Worker concurrency is artificially limited to 1. This guarantees stability but creates a throughput bottleneck. Scaling to handle parallel load requires vertical scaling of the worker node.
2. **Deterministic AI vs. True Evaluation:**
   * *The Problem:* LLM hallucinations make reliable scoring difficult.
   * *The Tradeoff:* Used `temperature=0.0` to force consistency rather than building a complex, multi-agent evaluation layer. It is highly consistent, but relies entirely on the base model's zero-shot accuracy.
3. **HTTP Polling vs. WebSockets:**
   * *The Problem:* AI generation takes 15-20 seconds, risking HTTP timeout on standard requests.
   * *The Tradeoff:* The frontend uses a polling loop against the database rather than a persistent WebSocket connection. This reduces infrastructure complexity and is highly resilient to dropped connections, at the cost of slight network overhead.

## 🛠 Local Development 

This project is fully containerized for local development and testing.

```bash
# 1. Clone the repository
git clone [https://github.com/yourusername/ai-resume-analyzer.git](https://github.com/yourusername/ai-resume-analyzer.git)
cd ai-resume-analyzer

# 2. Configure Environment Variables
# Create a .env file based on the provided .env.example
cp .env.example .env

# 3. Boot the isolated environment
docker-compose up --build