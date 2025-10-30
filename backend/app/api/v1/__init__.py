from app.api.v1.school import router as school_router
from app.api.v1.sector import router as sector_router
from app.api.v1.block import router as block_router
from app.api.v1.problem import router as problem_router
from app.api.v1.user import router as user_router

__all__ = [
    "school_router", 
    "sector_router", 
    "block_router", 
    "problem_router",
    "user_router"
    ]