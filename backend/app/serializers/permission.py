from pydantic import BaseModel, EmailStr, validator
from datetime import datetime
from typing import Optional

class PermissionCreate(BaseModel):
    user_id: str
    school_id: str
    sector_id: str
    block_id: str
    can_edit: bool = True
