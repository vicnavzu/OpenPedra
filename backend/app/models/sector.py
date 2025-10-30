from sqlalchemy import Column, String, ForeignKey
from geoalchemy2 import Geometry
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Sector(Base):
    __tablename__ = "sectors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    area = Column(Geometry("POLYGON", srid=4326), nullable=True)

    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"))

    school_name = Column(String)

    school = relationship(
        "School", 
        back_populates="sectors", 
        lazy='selectin', 
        foreign_keys=[school_id]
        )
    
    blocks = relationship(
        "Block", 
        back_populates="sector", 
        cascade="all, delete-orphan", 
        lazy='selectin',
        foreign_keys="[Block.sector_id]"
        )
    
    problems = relationship(
        "Problem", 
        back_populates="sector", 
        cascade="all, delete-orphan", 
        lazy='selectin',
        foreign_keys="[Problem.sector_id]"
        )
