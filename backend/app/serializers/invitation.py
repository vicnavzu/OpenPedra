from pydantic import BaseModel, EmailStr, validator
from datetime import datetime
from typing import Optional

class InvitationCreate(BaseModel):
    email: EmailStr

class InvitationRead(BaseModel):
    id: int
    code: str
    email: str
    is_used: bool
    expires_at: datetime
    created_at: datetime
    created_by: int
    used_by: Optional[int] = None
    
    class Config:
        from_attributes = True

class InvitationUse(BaseModel):
    username: str
    email: EmailStr
    password: str

    @validator('password')
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v