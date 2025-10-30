from pydantic import BaseModel
from typing import List, Optional
from .block import BlockSerializer
from .problem import ProblemSerializer


class SectorSerializer(BaseModel):
    id: str
    name: str
    area: Optional[str]

    school_id: str

    school_name: str

    blocks: Optional[List[BlockSerializer]] = []    
    problems: Optional[List[ProblemSerializer]] = []

    class Config:
        orm_mode = True
