from sqlalchemy import Column, Boolean, DateTime, ForeignKey, func
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id"))
    sector_id = Column(UUID(as_uuid=True), ForeignKey("sectors.id"))
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"))

    can_edit = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    block = relationship("Block")
    sector = relationship("Sector")
    school = relationship("School")