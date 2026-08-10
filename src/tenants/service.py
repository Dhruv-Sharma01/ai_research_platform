"""Tenant and organization business logic."""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import AuthorizationError, ConflictError, NotFoundError
from src.tenants.models import Organization, OrgMembership

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    """Convert an organization name into a stable URL-safe slug."""
    slug = _SLUG_RE.sub("-", value.lower()).strip("-")
    return slug or "organization"


async def create_organization(
    *,
    name: str,
    owner_id: uuid.UUID,
    db: AsyncSession,
    slug: str | None = None,
) -> Organization:
    """Create an organization and make the creator an admin."""
    organization = Organization(name=name, slug=slug or slugify(name))
    try:
        db.add(organization)
        await db.flush()

        db.add(
            OrgMembership(
                org_id=organization.id,
                user_id=owner_id,
                role="admin",
            )
        )
        await db.flush()
    except IntegrityError as exc:
        raise ConflictError("Organization slug already exists.") from exc

    return organization


async def create_personal_organization(
    *,
    user_id: uuid.UUID,
    email: str,
    db: AsyncSession,
) -> Organization:
    """Create the default personal tenant for a newly registered user."""
    base = email.split("@", 1)[0]
    return await create_organization(
        name=f"{base}'s Workspace",
        slug=f"user-{user_id}",
        owner_id=user_id,
        db=db,
    )


async def list_memberships(
    *,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> list[OrgMembership]:
    """List organizations a user belongs to."""
    result = await db.execute(
        select(OrgMembership)
        .where(OrgMembership.user_id == user_id)
        .options(selectinload(OrgMembership.organization))
        .order_by(OrgMembership.created_at.asc())
    )
    return list(result.scalars().all())


async def resolve_membership(
    *,
    user_id: uuid.UUID,
    db: AsyncSession,
    org_id: uuid.UUID | None = None,
) -> OrgMembership:
    """Resolve requested tenant or the user's default tenant."""
    query = (
        select(OrgMembership)
        .where(OrgMembership.user_id == user_id)
        .options(selectinload(OrgMembership.organization))
        .order_by(OrgMembership.created_at.asc())
    )
    if org_id is not None:
        query = query.where(OrgMembership.org_id == org_id)

    result = await db.execute(query)
    membership = result.scalars().first()

    if membership is None and org_id is not None:
        raise AuthorizationError("You are not a member of this organization.")
    if membership is None:
        raise NotFoundError("Organization membership", str(user_id))

    return membership


def require_role(role: str, allowed: set[str]) -> None:
    """Raise unless ``role`` is included in ``allowed``."""
    if role not in allowed:
        raise AuthorizationError("Insufficient organization role.")
