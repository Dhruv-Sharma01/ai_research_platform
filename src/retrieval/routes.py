"""Search API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user, get_db_session
from src.auth.models import User
from src.core.config import get_settings
from src.ingestion.pipeline import Embedder, SentenceTransformerEmbedder
from src.retrieval import service as search_service
from src.retrieval.schemas import ChunkResult, SearchRequest, SearchResponse
from src.tenants.dependencies import get_current_tenant
from src.tenants.schemas import TenantContext

router = APIRouter(prefix="/search", tags=["search"])


def _get_embedder(request: Request) -> Embedder:
    """Lazy-initialize and cache the embedding model on app state."""
    if not hasattr(request.app.state, "embedder"):
        settings = get_settings()
        request.app.state.embedder = SentenceTransformerEmbedder(
            model_name=settings.embedding_model_name,
            dim=settings.embedding_dimension,
        )
    return request.app.state.embedder


@router.post("", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    user: User = Depends(get_current_user),
    tenant: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db_session),
    embedder: Embedder = Depends(_get_embedder),
) -> SearchResponse:
    """Hybrid search across the user's documents.

    Combines dense (pgvector) and sparse (tsvector) retrieval
    using Reciprocal Rank Fusion.
    """
    settings = get_settings()
    results = await search_service.hybrid_search(
        query=body.query,
        user_id=user.id,
        tenant_id=tenant.org_id,
        embedder=embedder,
        db=db,
        top_k=body.top_k,
        candidate_multiplier=settings.retrieval_candidate_multiplier,
    )

    return SearchResponse(
        query=body.query,
        results=[
            ChunkResult(
                chunk_id=r.chunk_id,
                document_id=r.document_id,
                content=r.content,
                chunk_index=r.chunk_index,
                page_number=r.page_number,
                score=r.score,
                document_filename=r.document_filename,
            )
            for r in results
        ],
        total=len(results),
    )
