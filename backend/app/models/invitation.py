from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    used_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    creator = relationship("User", foreign_keys=[created_by])
    user = relationship("User", foreign_keys=[used_by])