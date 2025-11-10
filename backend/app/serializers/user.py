from pydantic import BaseModel, EmailStr, validator
from typing import Optional
import uuid
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

    @validator('password')
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v

    @validator('username')
    def username_alphanumeric(cls, v):
        if not v.replace('_', '').isalnum():
            raise ValueError('Username must be alphanumeric')
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters long')
        return v

class UserRead(UserBase):
    id: uuid.UUID
    is_active: bool
    is_admin: bool
    created_at: datetime
    invited_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class UserUsernameUpdate(BaseModel):
    username: Optional[str] = None

    @validator('username')
    def username_alphanumeric(cls, v):
        if v is not None:
            if not v.replace('_', '').isalnum():
                raise ValueError('Username must be alphanumeric')
            if len(v) < 3:
                raise ValueError('Username must be at least 3 characters long')
        return v

class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

    @validator('new_password')
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v

class UserEmailUpdate(BaseModel):
    new_email: EmailStr
    password: str