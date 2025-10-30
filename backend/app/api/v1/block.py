from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from geoalchemy2 import functions as geofunc
from app.models.block import Block
from app.database.connection import get_db
from app.services.utils import wkt_to_geojson
from fastapi import FastAPI, Depends, HTTPException
from app.services.utils import slugify
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.school import School
from app.models.sector import Sector
from app.models.block import Block

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Blocks"])

@router.get("/blocks")
async def get_blocks(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Block).options(selectinload(Block.problems))
        )
        blocks = result.scalars().all()
        return [{
            "id": str(b.id),
            "name": b.name,
            "sector_id": str(b.sector_id),
            "sector_name": str(b.sector_name),
            "school_id": str(b.school_id),
            "school_name": str(b.school_name),
            "problems": [{"id": str(p.id), "name": p.name, "grade": p.grade, "grade_ss": p.grade_ss} for p in b.problems]
            }
            for b in blocks
        ]
    
    except Exception as e:
        logger.error(f"Error getting blocks: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{sector_id}/blocks")
async def get_blocks_geojson(sector_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Block).where(Block.sector_id == sector_id
            ).options(
            selectinload(Block.school),
            selectinload(Block.sector),
            selectinload(Block.problems)
            )
        )
        blocks = result.scalars().all()


        features = []
        for b in blocks:
            try:
                geometry = wkt_to_geojson(b.point)
            except:
                geometry = None

            features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "id": str(b.id),
                    "name": b.name,
                    "sector_id": str(b.sector_id),
                    "sector_name": str(b.sector_name),
                    "school_id": str(b.school_id),
                    "school_name": str(b.school_name),
                    "problems": [{"id": str(p.id), "name": p.name, "grade": p.grade, "grade_ss": p.grade_ss} for p in b.problems]
                }
            })

        return {
            "type": "FeatureCollection",
            "features": features
        }


    except Exception as e:
        logger.error(f"Error getting blocks for {sector_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")
