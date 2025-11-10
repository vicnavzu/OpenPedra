from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import secrets
from datetime import datetime, timedelta, timezone

from app.database.connection import get_db
from app.models.invitation import Invitation
from app.models.user import User
from app.serializers.invitation import InvitationCreate, InvitationRead
from app.services.auth import get_current_user

router = APIRouter(prefix="/invitations", tags=["Invitations"])

def generate_invitation_code():
    return secrets.token_urlsafe(16)

@router.post("/", response_model=InvitationRead)
async def create_invitation(
    invitation: InvitationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = await db.scalar(
        select(Invitation).where(
            Invitation.email == invitation.email,
            Invitation.is_used == False,
            Invitation.expires_at > datetime.now(timezone.utc)
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="Active invitation already exists for this email")
    
    code = generate_invitation_code()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    new_invitation = Invitation(
        code=code,
        email=invitation.email,
        created_by=current_user.id,
        expires_at=expires_at
    )
    
    db.add(new_invitation)
    await db.commit()
    await db.refresh(new_invitation)
    
    return new_invitation

@router.get("/{code}", response_model=InvitationRead)
async def get_invitation(code: str, db: AsyncSession = Depends(get_db)):
    invitation = await db.scalar(select(Invitation).where(Invitation.code == code))
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.is_used:
        raise HTTPException(status_code=400, detail="Invitation already used")
    
    if invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    return invitation

@router.get("/", response_model=list[InvitationRead])
async def list_invitations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    invitations = await db.scalars(select(Invitation))
    return list(invitations.all())