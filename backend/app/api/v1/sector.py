from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from geoalchemy2 import functions as geofunc
import traceback
from app.models.sector import Sector
from app.database.connection import get_db
from app.services.utils import wkt_to_geojson
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


router = APIRouter(tags=["Sectors"])


@router.get("/sectors")
async def list_schools(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Sector).options(selectinload(Sector.blocks))
        )
        sectors = result.scalars().all()

        data = []
        for s in sectors:

            data.append({
                "id": str(s.id),
                "name": s.name,
                "school_id": str(s.school_id),
                "school_name": s.school_name,
                "blocks": [{"id": str(b.id), "name": b.name} for b in s.blocks],
                "problems": [{"id": str(p.id), "name": p.name, "grade": p.grade, "grade_ss": p.grade_ss} for p in s.problems]
            })

        return data

    except Exception as e:
        logger.error(f"Error getting sectors: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="INternal server error")
    
@router.get("/{school_id}/sectors")
async def get_sectors_geojson(school_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(
                Sector
            ).where(
                Sector.school_id == school_id
            ).options(
            selectinload(Sector.school),
            selectinload(Sector.blocks),
            selectinload(Sector.problems)
            )
        )
        sectors = result.scalars().all()

        features = []
        for s in sectors:
            try:
                geometry = wkt_to_geojson(s.area)
            except:
                geometry = None

            features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "id": str(s.id),
                    "name": s.name,
                    "school_id": str(s.school_id),
                    "school_name": str(s.school_name),
                    "blocks": [{"id": str(b.id), "name": b.name} for b in s.blocks],
                    "problems": [{"id": str(p.id), "name": p.name, "grade": p.grade, "grade_ss": p.grade_ss} for p in s.problems]
                }
            })

        return {
            "type": "FeatureCollection",
            "features": features
        }

    except Exception as e:
        logger.error(f"Error getting sector: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")