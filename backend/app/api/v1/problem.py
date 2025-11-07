from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

import uuid
from app.models.problem import Problem
from app.models.block import Block
from app.models.sector import Sector
from app.models.school import School
from app.models.user import User

from app.services.auth import get_current_user
from app.database.connection import get_db

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Problems"])

@router.get("/problems")
async def list_problems(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Problem))
        problems = result.scalars().all()
        return [
            {
                "id": str(p.id),
                "name": p.name,
                "grade": p.grade,
                "grade_ss": p.grade_ss,
                "length": p.length,
                "height": p.height,
                "positions": p.positions,
                "block_id": str(p.block_id),
                "block_name": p.block_name,
                "sector_id": str(p.sector_id),
                "sector_name": p.sector_name,
                "school_id": str(p.school_id),
                "school_name": p.school_name
            }
            for p in problems
        ]
    
    except Exception as e:
        logger.error(f"Error obteniendo bloques: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.get("/problem/{problem_id}")
async def get_problem(problem_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Problem).where(Problem.id == problem_id))
        p = result.scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Problem not found")
    
        return {
                "id": str(p.id),
                "name": p.name,
                "grade": p.grade,
                "grade_ss": p.grade_ss,
                "length": p.length,
                "height": p.height,
                "positions": p.positions,
                "block_id": str(p.block_id),
                "block_name": p.block_name,
                "sector_id": str(p.sector_id),
                "sector_name": p.sector_name,
                "school_id": str(p.school_id),
                "school_name": p.school_name
            }
    
    except Exception as e:
        logger.error(f"Error getting problems: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{school}/{sector}/{block}/problems")
async def get_problems(school: str, sector: str, block: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Block)
        .options(selectinload(Block.problems))
        .join(Block.sector)
        .join(Sector.school)
        .where(School.name == school)
        .where(Sector.name == sector)
        .where(Block.name == block)
    )
    block_obj = result.scalars().first()

    if not block_obj:
        raise HTTPException(status_code=404, detail="Block not found")

    return [
        {
            "id": str(p.id),
            "name": p.name,
            "grade": p.grade,
            "grade_ss": p.grade_ss,
            "length": p.length,
            "height": p.height,
            "positions": p.positions,
            "block_id": str(p.block_id),
            "block_name": p.block_name,
            "sector_id": str(p.sector_id),
            "sector_name": p.sector_name,
            "school_id": str(p.school_id),
            "school_name": p.school_name
        }
        for p in block_obj.problems
    ]

@router.post("/{school}/{sector}/{block}/new-problem", status_code=201)
async def create_problem(
    school: str,
    sector: str,
    block: str,
    problem_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    """
    Create a new problem in a specific block of a school and sector.
    """

    if not problem_data.get("name"):
        raise HTTPException(status_code=400, detail="name is required")

    result = await db.execute(select(School).where(School.name == school))
    school_obj = result.scalars().first()
    if not school_obj:
        raise HTTPException(status_code=404, detail=f"School '{school}' not found")

    result = await db.execute(
        select(Sector).where(Sector.name == sector, Sector.school_id == school_obj.id)
    )
    sector_obj = result.scalars().first()
    if not sector_obj:
        raise HTTPException(status_code=404, detail=f"Sector '{sector}' not found in school '{school}'")

    result = await db.execute(
        select(Block).where(Block.name == block, Block.sector_id == sector_obj.id)
    )
    block_obj = result.scalars().first()
    if not block_obj:
        raise HTTPException(status_code=404, detail=f"Block '{block}' not found in sector '{sector}'")

    result = await db.execute(
        select(Problem).where(
            Problem.name == problem_data["name"],
            Problem.block_id == block_obj.id
        )
    )
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="A problem with that name already exists in this block")
    
    problem = Problem(
        id=uuid.uuid4(),
        name=problem_data.get("name"),
        grade=problem_data.get("grade"),
        grade_ss=problem_data.get("grade_ss"),
        length=problem_data.get("length"),
        height=problem_data.get("heigth"),
        positions=problem_data.get("positions"),
        block_id=block_obj.id,
        block_name=block_obj.name,
        sector_id=sector_obj.id,
        sector_name=sector_obj.name,
        school_id=school_obj.id,
        school_name=school_obj.name
    )

    db.add(problem)
    await db.commit()
    await db.refresh(problem)

    return {
        "id": str(problem.id),
        "name": problem.name,
        "grade": problem.grade,
        "grade_ss": problem.grade_ss,
        "length": problem.length,
        "heigth": problem.height,
        "positions": problem.positions,
        "block_id": block_obj.id,
        "block_name": block_obj.name,
        "sector_id": sector_obj.id,
        "sector_name": sector_obj.name,
        "school_id": school_obj.id,
        "school_name": school_obj.name,
    }

@router.delete("/problem/{problem_id}", status_code=200)
async def delete_problem(
    problem_id: str, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    """
    Delete a specific problem.
    """
    result = await db.execute(select(Problem).where(Problem.id == problem_id))
    problem = result.scalars().first()

    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    await db.delete(problem)
    await db.commit()

@router.put("/problem/{problem_id}", status_code=200)
async def update_problem(
    problem_id: str, 
    problem_data: dict, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user) ):
    """
    Actualiza un problema existente.
    """
    result = await db.execute(select(Problem).where(Problem.id == problem_id))
    p = result.scalars().first()

    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")

    if "name" in problem_data:
        p.name = problem_data["name"]
    if "grade" in problem_data:
        p.grade = problem_data["grade"]
    if "grade_ss" in problem_data:
        p.grade_ss = problem_data["grade_ss"]
    if "length" in problem_data:
        p.length = problem_data["length"]
    if "heigth" in problem_data:
        p.height = problem_data["heigth"]
    if "positions" in problem_data:
        p.positions = problem_data["positions"]
        flag_modified(p, "positions")

    db.add(p)
    await db.commit()
    await db.refresh(p)

    return {
        "id": str(p.id),
        "name": p.name,
        "grade": p.grade,
        "grade_ss": p.grade_ss,
        "length": p.length,
        "heigth": p.height,
        "positions": p.positions,
    }
