from sqlalchemy import Column, String, ForeignKey, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid

class Problem(Base):
    __tablename__ = "problems"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    grade = Column(String, nullable=True)
    grade_ss = Column(String, nullable=True)
    length = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    positions = Column(JSONB, nullable=True)

    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id"))
    sector_id = Column(UUID(as_uuid=True), ForeignKey("sectors.id"))
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"))

    block_name = Column(String)
    sector_name = Column(String)
    school_name = Column(String)

    block = relationship(
        "Block", 
        back_populates="problems", 
        lazy='selectin', 
        foreign_keys=[block_id]
        )

    sector = relationship(
        "Sector", 
        back_populates="problems", 
        lazy='selectin', 
        foreign_keys=[sector_id]
        )
    
    school = relationship(
        "School", 
        back_populates="problems", 
        lazy='selectin', 
        foreign_keys=[school_id]
        )