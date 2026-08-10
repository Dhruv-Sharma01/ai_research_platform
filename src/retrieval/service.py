"""Hybrid retrieval service: pgvector (dense) + tsvector (sparse) + RRF.

This implements the core search pipeline:

1. Dense retrieval: Embed the query, then ``ORDER BY embedding <=> query_vec``
   using the HNSW index on the ``chunks`` table.
2. Sparse retrieval: Convert the query to a tsquery, then rank with
   ``ts_rank_cd`` using the GIN index on the ``tsv`` column.
3. Reciprocal Rank Fusion (RRF): Merge both ranked lists into a single
   ranked list using the formula ``1 / (k + rank)`` with ``k = 60``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.logging import get_logger
from src.ingestion.pipeline import Embedder

logger = get_logger(__name__)

# RRF constant — standard value from the original RRF paper.
RRF_K: int = 60


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

    Args:
        query: User's search query.
        user_id: Authenticated user; tenant membership is checked by caller.
        embedder: Embedding model for dense retrieval.
        db: Async database session.
        top_k: Number of results to return.
        candidate_multiplier: Fetch this many candidates from each
            retrieval method before fusion.

    Returns:
        List of RankedChunk sorted by RRF score (descending).
    """
    candidates = top_k * candidate_multiplier

    # ── Dense retrieval (pgvector cosine similarity) ─────────
    query_embedding = embedder.encode([query])[0]

    dense_results = await db.execute(
        text(
            """
            SELECT c.id AS chunk_id,
                   c.document_id,
                   c.content,
                   c.chunk_index,
                   c.page_number,
                   d.filename AS document_filename,
                   (c.embedding <=> :query_vec::vector) AS distance
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE c.tenant_id = :tenant_id
              AND d.deleted_at IS NULL
            ORDER BY c.embedding <=> :query_vec::vector
            LIMIT :limit
            """
        ),
        {
            "query_vec": str(query_embedding),
            "tenant_id": str(tenant_id),
            "limit": candidates,
        },
    )
    dense_rows = dense_results.mappings().all()

    # ── Sparse retrieval (tsvector full-text search) ─────────
    sparse_results = await db.execute(
        text(
            """
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
            """
        ),
        {
            "query": query,
            "tenant_id": str(tenant_id),
            "limit": candidates,
        },
    )
    sparse_rows = sparse_results.mappings().all()

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
