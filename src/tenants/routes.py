"""Organization and tenant API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user, get_db_session
from src.auth.models import User
from src.tenants import service as tenant_service
from src.tenants.schemas import (
    MembershipResponse,
    OrganizationCreateRequest,
    OrganizationResponse,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    body: OrganizationCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> OrganizationResponse:
    """Create a new organization owned by the current user."""
    organization = await tenant_service.create_organization(
        name=body.name,
        slug=body.slug,
        owner_id=user.id,
        db=db,
    )
    return OrganizationResponse.model_validate(organization)


@router.get("", response_model=list[MembershipResponse])
async def list_organizations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[MembershipResponse]:
    """List organizations available to the current user."""
    memberships = await tenant_service.list_memberships(user_id=user.id, db=db)
    return [MembershipResponse.model_validate(item) for item in memberships]
