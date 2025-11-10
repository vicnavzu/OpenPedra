from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database.connection import get_db
from app.models.permission import Permission
from app.models.user import User
from app.models.school import School
from app.models.sector import Sector
from app.models.block import Block
from app.serializers.permission import PermissionCreate
from app.services.auth import require_admin

router = APIRouter(prefix="/permissions", tags=["Permission"])

@router.get("/", dependencies=[Depends(require_admin)])
async def list_permissions(db: AsyncSession = Depends(get_db)):
    """List all permissions (admin only)."""
    result = await db.execute(select(Permission))
    perms = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "school_id": str(p.school_id) if p.school_id else None,
            "sector_id": str(p.sector_id) if p.sector_id else None,
            "block_id": str(p.block_id) if p.block_id else None,
            "can_edit": p.can_edit,
        }
        for p in perms
    ]


@router.post("/", status_code=201, dependencies=[Depends(require_admin)])
async def add_permission(body: PermissionCreate, db: AsyncSession = Depends(get_db)):
    """Add a new edit permission for a user."""
    # Check user exists
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check which entity level is targeted
    if body.block_id:
        entity = await db.get(Block, body.block_id)
        if not entity:
            raise HTTPException(status_code=404, detail="Block not found")
    elif body.sector_id:
        entity = await db.get(Sector, body.sector_id)
        if not entity:
            raise HTTPException(status_code=404, detail="Sector not found")
    elif body.school_id:
        entity = await db.get(School, body.school_id)
        if not entity:
            raise HTTPException(status_code=404, detail="School not found")
    else:
        raise HTTPException(status_code=400, detail="You must provide a school_id, sector_id or block_id")

    # Prevent duplicates
    q = select(Permission).where(
        Permission.user_id == body.user_id,
        Permission.school_id == body.school_id,
        Permission.sector_id == body.sector_id,
        Permission.block_id == body.block_id,
    )
    existing = (await db.execute(q)).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Permission already exists for this user and entity")

    # Create permission
    perm = Permission(
        user_id=body.user_id,
        school_id=body.school_id,
        sector_id=body.sector_id,
        block_id=body.block_id,
        can_edit=body.can_edit,
    )
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return {"id": str(perm.id)}


@router.delete("/{perm_id}", dependencies=[Depends(require_admin)])
async def remove_permission(perm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Remove an existing permission by ID."""
    perm = await db.get(Permission, perm_id)
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    await db.delete(perm)
    await db.commit()
    return {"detail": "Permission deleted"}