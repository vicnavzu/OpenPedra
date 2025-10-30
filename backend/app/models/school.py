from sqlalchemy import Column, String
from geoalchemy2 import Geometry
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class School(Base):
    __tablename__ = "schools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    area = Column(Geometry("POLYGON", srid=4326), nullable=True)

    sectors = relationship(
        "Sector", 
        back_populates="school", 
        cascade="all, delete-orphan", 
        lazy='selectin',
        foreign_keys="[Sector.school_id]"
        )
    
    blocks = relationship(
        "Block", 
        back_populates="school", 
        cascade="all, delete-orphan", 
        lazy='selectin',
        foreign_keys="[Block.school_id]"
        )
    
    problems = relationship(
        "Problem", 
        back_populates="school", 
        cascade="all, delete-orphan", 
        lazy='selectin',
        foreign_keys="[Problem.school_id]"
        )
