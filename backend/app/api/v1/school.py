from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from geoalchemy2 import functions as geofunc
import traceback
from app.models.school import School
from app.database.connection import get_db
from app.services.utils import wkt_to_geojson
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Schools"])
    
@router.get("/schools")
async def get_schools_geojson(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(School)
            .options(
                selectinload(School.sectors),
                selectinload(School.blocks),
                selectinload(School.problems)
            )
        )
        schools = result.scalars().all()

        features = []
        for school in schools:
            if not school.area:
                logger.warning(f"School {school.id} has no defined area")
                continue

            try:
                geometry = wkt_to_geojson(school.area)
                if not geometry:
                    logger.warning(f"School {school.id} has empty geometry")
                    continue
            except Exception as e:
                logger.error(f"Error parsing WKT for school {school.id}: {e}")
                continue

            features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "id": str(school.id),
                    "name": school.name,
                    "sectors": [{"id": str(s.id), "name": s.name} for s in getattr(school, "sectors", [])],
                    "blocks": [{"id": str(b.id), "name": b.name} for b in getattr(school, "blocks", [])],
                    "problems": [{"id": str(p.id), "name": p.name, "grade": p.grade, "grade_ss": p.grade_ss} for p in getattr(school, "problems", [])]
                }
            })

        return {
            "type": "FeatureCollection",
            "features": features
        }

    except Exception as e:
        logger.error(f"Error getting schools: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")