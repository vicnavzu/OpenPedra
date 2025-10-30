from pydantic import BaseModel
from typing import List, Optional
from .problem import ProblemSerializer

class BlockSerializer(BaseModel):
    id: str
    name: str
    point: str

    sector_id: str
    school_id: str

    sector_name: str
    school_name: str
    
    problems: Optional[List[ProblemSerializer]] = []

    class Config:
        orm_mode = True
