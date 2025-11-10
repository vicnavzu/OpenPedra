from pydantic import BaseModel, EmailStr, validator
from datetime import datetime
from typing import Optional
import uuid

class InvitationCreate(BaseModel):
    email: EmailStr

class InvitationRead(BaseModel):
    id: uuid.UUID
    code: str
    email: str
    is_used: bool
    expires_at: datetime
    created_at: datetime
    created_by: uuid.UUID
    used_by: Optional[uuid.UUID] = None
    
    class Config:
        from_attributes = True