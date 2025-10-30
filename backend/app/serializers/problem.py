from pydantic import BaseModel
from typing import List, Optional

class PositionSerializer(BaseModel):
    lat: float
    lon: float
    height: float

class ProblemSerializer(BaseModel):
    id: str
    name: str
    grade: str
    grade_ss: str
    length: float
    height: float

    positions: Optional[List[PositionSerializer]] = []

    block_id:str
    sector_id: str
    school_id: str

    block_name: str
    sector_name: str
    school_name: str

    class Config:
        orm_mode = True
