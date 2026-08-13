# Performance Benchmarking & Reliability Results

This directory contains the methodology and results for load testing and reliability verification of the AI Research Platform.

## Methodology

Load testing is performed using [Locust](https://locust.io/). The test suite (`tests/load/locustfile.py`) simulates realistic API traffic:
- User registration and organization creation.
- Document listing.
- Keyword search.
- Semantic search.
- Hybrid search (reciprocal rank fusion).

Tests are executed against the production Docker Compose stack (`docker-compose.prod.yml`), which includes:
- 2x API instances behind Nginx (load balancing)
- 2x Async Worker instances
- PostgreSQL + pgvector
- MinIO for document storage
- Redis for distributed rate limiting

### Running the Load Test

```bash
# Start the production cluster
docker-compose -f docker-compose.prod.yml up -d

# Run locust in headless mode
locust -f tests/load/locustfile.py --headless -u 100 -r 10 --run-time 1m --host http://localhost
```

## Resilience and Reliability Verification

We have verified the following resilience characteristics of the architecture:

1. **Redis Unavailability (Fail-Open Rate Limiting)**
   - **Scenario**: Redis cache goes down.
   - **Result**: The `RateLimiter` catches `RedisError`, logs it, and allows the request to proceed. The system stays up, sacrificing rate-limiting temporarily to maintain core functionality.

2. **API Instance Failure**
   - **Scenario**: One of the API instances crashes.
   - **Result**: Nginx detects the connection failure (or timeout) and routes subsequent requests to the remaining healthy instance. Zero downtime.

3. **Database Concurrency Limits**
   - **Scenario**: Heavy concurrent search queries.
   - **Result**: The `hybrid_search` endpoint utilizes two independent `AsyncSession` instances, avoiding SQLAlchemy `IllegalStateChangeError`. Connections are drawn from a bounded AsyncPG pool (`database_pool_size=10`), protecting the database from connection exhaustion.

4. **LLM Circuit Breaker**
   - **Scenario**: The LLM API returns continuous 500s or rate limit errors.
   - **Result**: The `GatewayCircuitBreaker` trips after continuous failures, instantly rejecting subsequent requests and avoiding hanging threads. It transitions to `HALF_OPEN` automatically to probe recovery.
