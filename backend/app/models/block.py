from sqlalchemy import Column, String, ForeignKey
from geoalchemy2 import Geometry
from app.models.base import Base
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Block(Base):
    __tablename__ = "blocks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    point = Column(Geometry("POINT", srid=4326), nullable=False)

    sector_id = Column(UUID(as_uuid=True), ForeignKey("sectors.id"))
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"))

    sector_name = Column(String)
    school_name = Column(String)

    sector = relationship(
        "Sector", 
        back_populates="blocks", 
        lazy='selectin', 
        foreign_keys=[sector_id]
        )
    
    school = relationship(
        "School", 
        back_populates="blocks", 
        lazy='selectin', 
        foreign_keys=[school_id]
        )

    problems = relationship(
        "Problem", 
        back_populates="block", 
        cascade="all, delete-orphan", 
        lazy='selectin', 
        foreign_keys="[Problem.block_id]"
        )
