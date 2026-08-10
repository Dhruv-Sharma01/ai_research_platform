"""Pydantic schemas for search endpoints."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    """Hybrid search request."""

    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=50)


class ChunkResult(BaseModel):
    """A single search result chunk."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    content: str
    chunk_index: int
    page_number: int | None
    score: float
    document_filename: str

    model_config = {"from_attributes": True}


class SearchResponse(BaseModel):
    """Search response with ranked results."""

    query: str
    results: list[ChunkResult]
    total: int
