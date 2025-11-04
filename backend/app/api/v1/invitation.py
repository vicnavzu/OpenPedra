from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import secrets
from datetime import datetime, timedelta

from app.database.connection import get_db
from app.models.invitation import Invitation
from app.models.user import User
from app.serializers.invitation import InvitationCreate, InvitationRead, InvitationUse
from app.serializers.user import UserCreate
from app.services.auth import get_current_user, hash_password

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
            Invitation.expires_at > datetime.now()
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="Active invitation already exists for this email")
    
    code = generate_invitation_code()
    expires_at = datetime.now() + timedelta(days=7)
    
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
    
    if invitation.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    return invitation

@router.post("/{code}/use", response_model=dict)
async def use_invitation(
    code: str, 
    user_data: InvitationUse,
    db: AsyncSession = Depends(get_db)
):
    invitation = await db.scalar(select(Invitation).where(Invitation.code == code))
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.is_used:
        raise HTTPException(status_code=400, detail="Invitation already used")
    
    if invitation.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    if invitation.email != user_data.email:
        raise HTTPException(status_code=400, detail="Email does not match invitation")
    
    existing_user = await db.scalar(select(User).where(User.username == user_data.username))
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = await db.scalar(select(User).where(User.email == user_data.email))
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = hash_password(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_pw,
        invited_by=invitation.created_by
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    invitation.is_used = True
    invitation.used_by = new_user.id
    invitation.used_at = datetime.now()
    
    await db.commit()
    
    return {"message": "User created successfully", "user_id": new_user.id}

@router.get("/", response_model=list[InvitationRead])
async def list_invitations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    invitations = await db.scalars(select(Invitation))
    return list(invitations.all())