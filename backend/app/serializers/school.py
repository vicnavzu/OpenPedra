from pydantic import BaseModel
from typing import List, Optional
from .sector import SectorSerializer

class SchoolSerializer(BaseModel):
    id: str
    name: str
    area: Optional[str]

    sectors: Optional[List[SectorSerializer]] = []
    blocks: Optional[List[SectorSerializer]] = []
    problems: Optional[List[SectorSerializer]] = []
    
    class Config:
        orm_mode = True