"""Pydantic request/response schemas for authentication endpoints."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# ── Requests ─────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    """User registration payload."""

    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address.")
        return v.lower().strip()


class LoginRequest(BaseModel):
    """User login payload."""

    email: str = Field(max_length=255)
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()


class RefreshRequest(BaseModel):
    """Token refresh payload."""

    refresh_token: str


class CreateApiKeyRequest(BaseModel):
    """API key creation payload."""

    name: str = Field(min_length=1, max_length=100)


# ── Responses ────────────────────────────────────────────────


class UserResponse(BaseModel):
    """Public user representation."""

    id: uuid.UUID
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Login / refresh response with both tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    """Refresh response with new access token only."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ApiKeyCreatedResponse(BaseModel):
    """Returned once at API key creation. Contains the full key."""

    key: str
    id: uuid.UUID
    name: str
    prefix: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyResponse(BaseModel):
    """API key listing (no secret)."""

    id: uuid.UUID
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: ErrorDetail


class ErrorDetail(BaseModel):
    """Error detail within the envelope."""

    code: str
    message: str
