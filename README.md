# AI Research Platform

## The Problem We Are Solving

Modern AI research platforms often suffer from premature architectural complexity. When building multi-tenant Retrieval-Augmented Generation (RAG) applications, teams frequently adopt disjointed tech stacks: ChromaDB or Qdrant for vector search, Elasticsearch for full-text search, Celery/Redis for job queuing, and PostgreSQL for relational metadata. This introduces distributed data consistency problems, complex operational overhead, and makes tenant isolation difficult.

This project solves these challenges by adopting a **Postgres-Maximalist** philosophy. We are building a scalable, multi-tenant AI research platform with hybrid retrieval (dense + sparse + Reciprocal Rank Fusion) using a single, unified data store. We leverage PostgreSQL's native capabilities to handle relational data, vector search (via `pgvector`), full-text search (via `tsvector`), and job queuing (via `SKIP LOCKED`), ensuring ACID compliance and strong tenant isolation via Row-Level Security (RLS) across the entire platform.

## Architecture

**Core Principle:** PostgreSQL handles relational data, vector search, full-text search, and job queuing. Additional infrastructure enters only when PostgreSQL provably cannot serve the requirement.

| Component | Technology | Purpose |
|-----------|-----------|---------|
| API | FastAPI | Async HTTP API with JWT auth |
| Database | PostgreSQL 16 + pgvector | Relational data, vectors, full-text, job queue, RLS |
| Tenancy | PostgreSQL RLS + organizations | Tenant isolation and RBAC |
| Object Storage | MinIO (S3-compatible) | Document file storage |
| Embedding | sentence-transformers (all-MiniLM-L6-v2) | Local embedding model |
| LLM | Gemini Flash | CRAG relevance evaluation |
| Rate Limiting | aiolimiter (v2.0) / Redis (v3.0) | Token bucket rate limiting |
| Logging | structlog | Structured JSON logging |
| Migrations | Alembic | Database schema versioning |

## Implementation

The platform is designed around several key technical implementations:

1. **Hybrid Retrieval:** Dense retrieval (HNSW index on `pgvector`) and sparse retrieval (GIN index on `tsvector`) are executed concurrently as parallel SQL queries, fused in-memory using Reciprocal Rank Fusion (RRF).
2. **PostgreSQL Job Queue:** Document ingestion is handled via a Python polling daemon leveraging PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` for transactional, exactly-once job enqueuing and processing, eliminating the need for Celery/Redis.
3. **Multi-Tenancy:** PostgreSQL Row-Level Security (RLS) enforces tenant isolation at the database layer. Every query is filtered by the database itself using a session variable set via FastAPI middleware.
4. **Resiliency:** Rate limits are enforced via token buckets (`aiolimiter`), and external LLM APIs are guarded by in-process circuit breakers and exponential backoff retry mechanisms (`tenacity`).

### Project Structure
```
ai-research-platform/
├── alembic/                  # Database migrations
├── src/
│   ├── core/                 # Config, database, security, logging, exceptions
│   ├── auth/                 # JWT + API key authentication
│   ├── documents/            # Document upload and management
│   ├── ingestion/            # Chunking, embedding, worker daemon
│   ├── retrieval/            # Hybrid search (pgvector + tsvector + RRF)
│   ├── evaluation/           # CRAG relevance grading, LLM gateway
│   ├── tenants/              # Multi-tenancy, RBAC (v3.0)
│   ├── observability/        # Prometheus metrics, health checks (v3.0)
│   └── main.py               # FastAPI application factory
├── mcp_server/               # MCP stdio interface
├── tests/
│   ├── unit/                 # Pure logic tests
│   ├── integration/          # Tests requiring running services
│   ├── concurrency/          # Race condition and locking tests
│   └── load/                 # Locust load test scripts
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml    # Dev: PG + MinIO
│   └── docker-compose.prod.yml  # Prod: + Nginx + Redis + Prometheus
├── requirements.in           # Human-maintained dependency constraints
├── pyproject.toml            # Tool configuration (ruff, mypy, pytest)
└── .env.example              # Environment variable template
```

## How to Clone and Run

### Prerequisites

- Python 3.11+
- Git
- Docker and Docker Compose (for PostgreSQL and MinIO)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dhruv-Sharma01/ai_research_platform.git
   cd ai_research_platform
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv .venv
   
   # Windows:
   .venv\Scripts\activate
   
   # Linux/macOS:
   source .venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.in
   ```

4. **Configure environment variables**
   ```bash
   # Windows:
   copy .env.example .env
   
   # Linux/macOS:
   cp .env.example .env
   
   # Make sure to edit .env with your specific API keys (e.g., GEMINI_API_KEY)
   ```

5. **Start Infrastructure Services (PostgreSQL + MinIO)**
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

6. **Run database migrations**
   ```bash
   alembic upgrade head
   ```

7. **Start the applications**
   You will need multiple terminal windows (with the virtual environment activated in each) to run the services.

   **Terminal 1 (API Server):**
   ```bash
   uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
   ```
   
   **Terminal 2 (Ingestion Worker):**
   ```bash
   python -m src.ingestion.worker
   ```
   
   **Terminal 3 (Optional: MCP Server):**
   ```bash
   python -m mcp_server
   ```

### Accessing the API
Once the server is running, visit:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **Health Check:** http://localhost:8000/health

## License

MIT
