"""Hybrid retrieval service: pgvector (dense) + tsvector (sparse) + RRF.

This implements the core search pipeline:

1. Dense retrieval: Embed the query, then ``ORDER BY embedding <=> query_vec``
   using the HNSW index on the ``chunks`` table.
2. Sparse retrieval: Convert the query to a tsquery, then rank with
   ``ts_rank_cd`` using the GIN index on the ``tsv`` column.
3. Reciprocal Rank Fusion (RRF): Merge both ranked lists into a single
   ranked list using the formula ``1 / (k + rank)`` with ``k = 60``.

Dense and sparse searches are also available independently via
``dense_search()`` and ``sparse_search()``.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.logging import get_logger
from src.ingestion.pipeline import Embedder

logger = get_logger(__name__)

# RRF constant — standard value from the original RRF paper.
RRF_K: int = 60

# ── SQL fragments ────────────────────────────────────────────

_DENSE_SQL = text("""
    SELECT c.id AS chunk_id,
           c.document_id,
           c.content,
           c.chunk_index,
           c.page_number,
           d.filename AS document_filename,
           (c.embedding <=> CAST(:query_vec AS vector)) AS distance
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.tenant_id = :tenant_id
      AND d.deleted_at IS NULL
    ORDER BY c.embedding <=> CAST(:query_vec AS vector)
    LIMIT :limit
""")

_SPARSE_SQL = text("""
    SELECT c.id AS chunk_id,
           c.document_id,
           c.content,
           c.chunk_index,
           c.page_number,
           d.filename AS document_filename,
           ts_rank_cd(c.tsv, plainto_tsquery('english', :query)) AS rank
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.tenant_id = :tenant_id
      AND d.deleted_at IS NULL
      AND c.tsv @@ plainto_tsquery('english', :query)
    ORDER BY rank DESC
    LIMIT :limit
""")


@dataclass
class RankedChunk:
    """A chunk with its fused retrieval score."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    chunk_index: int
    page_number: int | None
    score: float
    document_filename: str


# ── Individual search functions ──────────────────────────────


async def dense_search(
    query: str,
    tenant_id: uuid.UUID,
    embedder: Embedder,
    db: AsyncSession,
    top_k: int = 5,
) -> list[RankedChunk]:
    """Dense-only retrieval using pgvector cosine distance.

    Args:
        query: User's search query.
        tenant_id: Tenant scope.
        embedder: Embedding model.
        db: Async database session.
        top_k: Number of results.

    Returns:
        List of RankedChunk sorted by cosine similarity (best first).
    """
    query_embedding = embedder.encode([query])[0]
    result = await db.execute(
        _DENSE_SQL,
        {
            "query_vec": str(query_embedding),
            "tenant_id": str(tenant_id),
            "limit": top_k,
        },
    )
    rows = result.mappings().all()

    ranked = [
        RankedChunk(
            chunk_id=uuid.UUID(str(row["chunk_id"])),
            document_id=uuid.UUID(str(row["document_id"])),
            content=row["content"],
            chunk_index=row["chunk_index"],
            page_number=row.get("page_number"),
            score=round(1.0 - float(row["distance"]), 6),  # cosine similarity
            document_filename=row["document_filename"],
        )
        for row in rows
    ]

    logger.info(
        "dense_search_complete",
        query_length=len(query),
        results=len(ranked),
    )
    return ranked


async def sparse_search(
    query: str,
    tenant_id: uuid.UUID,
    db: AsyncSession,
    top_k: int = 5,
) -> list[RankedChunk]:
    """Sparse-only retrieval using PostgreSQL tsvector full-text search.

    Args:
        query: User's search query.
        tenant_id: Tenant scope.
        db: Async database session.
        top_k: Number of results.

    Returns:
        List of RankedChunk sorted by ts_rank_cd score (best first).
    """
    result = await db.execute(
        _SPARSE_SQL,
        {
            "query": query,
            "tenant_id": str(tenant_id),
            "limit": top_k,
        },
    )
    rows = result.mappings().all()

    ranked = [
        RankedChunk(
            chunk_id=uuid.UUID(str(row["chunk_id"])),
            document_id=uuid.UUID(str(row["document_id"])),
            content=row["content"],
            chunk_index=row["chunk_index"],
            page_number=row.get("page_number"),
            score=round(float(row["rank"]), 6),
            document_filename=row["document_filename"],
        )
        for row in rows
    ]

    logger.info(
        "sparse_search_complete",
        query_length=len(query),
        results=len(ranked),
    )
    return ranked


# ── Hybrid search (ADR-005: parallel via asyncio.gather) ─────


async def hybrid_search(
    query: str,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    embedder: Embedder,
    db: AsyncSession,
    top_k: int = 5,
    candidate_multiplier: int = 2,
) -> list[RankedChunk]:
    """Execute a hybrid search combining dense and sparse retrieval.

    Both retrievals run concurrently via ``asyncio.gather`` (ADR-005).

    Args:
        query: User's search query.
        user_id: Authenticated user; tenant membership is checked by caller.
        tenant_id: Tenant scope for RLS-compatible queries.
        embedder: Embedding model for dense retrieval.
        db: Async database session.
        top_k: Number of results to return.
        candidate_multiplier: Fetch this many candidates from each
            retrieval method before fusion.

    Returns:
        List of RankedChunk sorted by RRF score (descending).
    """
    candidates = top_k * candidate_multiplier

    # Embed query (CPU-bound, done once before both searches)
    query_embedding = embedder.encode([query])[0]

    # ADR-005: Run dense + sparse in parallel using independent sessions
    async def _run_dense() -> list[dict]:
        async with AsyncSession(bind=db.bind) as session:
            result = await session.execute(
                _DENSE_SQL,
                {
                    "query_vec": str(query_embedding),
                    "tenant_id": str(tenant_id),
                    "limit": candidates,
                },
            )
            return [dict(r) for r in result.mappings().all()]

    async def _run_sparse() -> list[dict]:
        async with AsyncSession(bind=db.bind) as session:
            result = await session.execute(
                _SPARSE_SQL,
                {
                    "query": query,
                    "tenant_id": str(tenant_id),
                    "limit": candidates,
                },
            )
            return [dict(r) for r in result.mappings().all()]

    # Run concurrently using asyncio.gather
    dense_rows, sparse_rows = await asyncio.gather(_run_dense(), _run_sparse())

    # ── Reciprocal Rank Fusion ───────────────────────────────
    fused = _reciprocal_rank_fusion(dense_rows, sparse_rows, top_k)

    logger.info(
        "hybrid_search_complete",
        query_length=len(query),
        dense_candidates=len(dense_rows),
        sparse_candidates=len(sparse_rows),
        fused_results=len(fused),
    )

    return fused


def _reciprocal_rank_fusion(
    dense_rows: list[dict],
    sparse_rows: list[dict],
    top_k: int,
) -> list[RankedChunk]:
    """Merge two ranked lists using Reciprocal Rank Fusion.

    RRF score = sum of 1 / (k + rank) across all lists where the
    document appears. k=60 is the standard constant.
    """
    scores: dict[uuid.UUID, float] = {}
    metadata: dict[uuid.UUID, dict] = {}

    # Score dense results
    for rank, row in enumerate(dense_rows, start=1):
        chunk_id = uuid.UUID(str(row["chunk_id"]))
        scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)
        metadata[chunk_id] = dict(row)

    # Score sparse results
    for rank, row in enumerate(sparse_rows, start=1):
        chunk_id = uuid.UUID(str(row["chunk_id"]))
        scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)
        if chunk_id not in metadata:
            metadata[chunk_id] = dict(row)

    # Sort by fused score descending
    sorted_ids = sorted(scores, key=lambda cid: scores[cid], reverse=True)

    results: list[RankedChunk] = []
    for chunk_id in sorted_ids[:top_k]:
        meta = metadata[chunk_id]
        results.append(
            RankedChunk(
                chunk_id=chunk_id,
                document_id=uuid.UUID(str(meta["document_id"])),
                content=meta["content"],
                chunk_index=meta["chunk_index"],
                page_number=meta.get("page_number"),
                score=round(scores[chunk_id], 6),
                document_filename=meta["document_filename"],
            )
        )

    return results
