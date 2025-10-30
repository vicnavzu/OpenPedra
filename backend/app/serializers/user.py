from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    is_active: bool
    is_admin: bool

    class Config:
        orm_mode = True

class UserLogin(BaseModel):
    username: str
    password: str
