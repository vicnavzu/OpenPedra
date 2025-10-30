from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.connection import get_db
from app.models.user import User
from app.serializers.user import UserCreate, UserRead, UserLogin
from app.services.auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/register", response_model=UserRead)
async def register_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.username == user.username))
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_pw = hash_password(user.password)
    new_user = User(username=user.username, email=user.email, hashed_password=hashed_pw)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login")
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    db_user = await db.scalar(select(User).where(User.username == user.username))
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token({"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}
