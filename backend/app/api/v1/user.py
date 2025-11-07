from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.connection import get_db
from app.models.user import User
from app.models.invitation import Invitation
from app.serializers.user import UserCreate, UserRead, UserLogin
from app.services.auth import hash_password, verify_password, create_auth_token, get_current_user
from app.api.v1.invitation import use_invitation

import datetime

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/register", response_model=UserRead)
async def register_user(
    code: str,
    user: UserCreate, 
    db: AsyncSession = Depends(get_db)):

    invitation = await db.scalar(select(Invitation).where(Invitation.code == code))
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.is_used:
        raise HTTPException(status_code=400, detail="Invitation already used")
    
    if invitation.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    if invitation.email != user.email:
        raise HTTPException(status_code=400, detail="Email does not match invitation")
    
    existing_user = await db.scalar(select(User).where(User.username == user.username))
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = await db.scalar(select(User).where(User.email == user.email))
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = hash_password(user.password)
    new_user = User(
        username=user.username, 
        email=user.email, 
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
    
    return new_user

@router.post("/login")
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    db_user = await db.scalar(select(User).where(User.username == user.username))
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    auth_token = create_auth_token({"sub": db_user.username})
    return {"auth_token": auth_token, "token_type": "bearer"}

@router.get("/me", response_model=UserRead)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user
