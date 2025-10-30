import os
import json
import logging
from uuid import uuid4
from math import atan2, sqrt, sin, cos, radians, degrees
import numpy as np

from shapely.geometry import Point, MultiPoint, LineString
from shapely.ops import transform
from pyproj import Transformer

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from geoalchemy2 import WKTElement 
from shapely.wkt import loads as wkt_loads

from app.models.school import School
from app.models.sector import Sector
from app.models.block import Block
from app.models.problem import Problem

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG) 

config_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'config.json')
)
with open(config_path, "r") as f:
    data = json.load(f)
    BASE_PATH = data["modelsdir"]

def ecef_to_geodetic(x, y, z):
    """Convert ECEF coordinates to WGS84 (lat, lon, alt)."""
    a = 6378137.0 
    e2 = 6.69437999014e-3
    lon = atan2(y, x)
    p = sqrt(x**2 + y**2)
    lat = atan2(z, p * (1 - e2))

    for _ in range(5):
        N = a / sqrt(1 - e2 * (sin(lat) ** 2))
        alt = p / cos(lat) - N
        lat = atan2(z, p * (1 - e2 * N / (N + alt)))

    return degrees(lat), degrees(lon), alt

def get_center_from_tileset(tileset_path: str):
    """Read a Cesium ion tileset.json and return (lon, lat) from the transform translation."""
    try:
        with open(tileset_path, "r") as f:
            data = json.load(f)

        transform = data["root"]["transform"]
        tx, ty, tz, _ = transform[-4:]

        lat, lon, _ = ecef_to_geodetic(tx, ty, tz)

        return lon, lat

    except Exception as e:
        logger.error(f"Error reading {tileset_path}: {e}")
        return 0.0, 0.0

def calculate_convex_hull_area(points: list, buffer_meters: float = 5, utm_epsg: int = 32629):
    """
    Receive a list of shapely Points in WGS84 (lon, lat),
    calculate convex hull and add buffer in meters.
    Handle cases with 1, 2 or more points.
    utm_epsg: EPSG of the UTM zone corresponding to your data.
    """
    if not points:
        return None

    transformer_to_utm = Transformer.from_crs("epsg:4326", f"epsg:{utm_epsg}", always_xy=True)
    transformer_to_wgs84 = Transformer.from_crs(f"epsg:{utm_epsg}", "epsg:4326", always_xy=True)

    if len(points) == 1:
        point_utm = transform(transformer_to_utm.transform, points[0])
        buffered = point_utm.buffer(buffer_meters)
        return transform(transformer_to_wgs84.transform, buffered)

    elif len(points) == 2:
        line_utm = transform(transformer_to_utm.transform, LineString([(p.x, p.y) for p in points]))
        buffered = line_utm.buffer(buffer_meters, cap_style=1)
        return transform(transformer_to_wgs84.transform, buffered)

    else:
        multipoint_utm = MultiPoint([transform(transformer_to_utm.transform, p) for p in points])
        hull = multipoint_utm.convex_hull
        buffered = hull.buffer(buffer_meters)
        return transform(transformer_to_wgs84.transform, buffered)

async def sync_schools_from_files(db: AsyncSession):
    """Create/update schools based on subdirectories in BASE_PATH."""
    if not os.path.exists(BASE_PATH):
        logger.warning(f"Path {BASE_PATH} does not exist")
        return []

    dirs = [d for d in os.listdir(BASE_PATH) if os.path.isdir(os.path.join(BASE_PATH, d))]
    existing_schools = {
        school.name: school for school in (await db.execute(select(School))).scalars().all()
    }

    processed = []
    for dirname in dirs:
        if dirname in existing_schools:
            logger.info(f"Existing school: {dirname}")
            school = existing_schools[dirname]
        else:
            school = School(id=uuid4(), name=dirname)
            db.add(school)
            logger.info(f"School added: {dirname}")
        processed.append(dirname)

    if processed:
        await db.commit()
    return processed

async def sync_sectors_from_files(db: AsyncSession):
    """Create/update sectors based on subdirectories within each school."""
    existing_schools = {
        school.name: school for school in (await db.execute(select(School))).scalars().all()
    }
    existing_sectors = {
        sector.name: sector for sector in (await db.execute(select(Sector))).scalars().all()
    }

    processed = []
    for school_name, school in existing_schools.items():
        school_path = os.path.join(BASE_PATH, school_name)
        if not os.path.exists(school_path):
            continue

        sector_dirs = [d for d in os.listdir(school_path) if os.path.isdir(os.path.join(school_path, d))]
        for sector_name in sector_dirs:
            if sector_name in existing_sectors:
                logger.info(f"Existing sector: {sector_name}")
            else:
                sector = Sector(id=uuid4(), name=sector_name, school_id=school.id, school_name=school_name)
                db.add(sector)
                logger.info(f"Sector added: {sector_name}")
            processed.append(sector_name)

    if processed:
        await db.commit()
    return processed

async def sync_blocks_from_files(db: AsyncSession):
    """Create/update blocks based on subdirectories within each sector."""
    existing_schools = {
        school.name: school for school in (await db.execute(select(School))).scalars().all()
    }
    existing_sectors = {
        sector.name: sector for sector in (await db.execute(select(Sector))).scalars().all()
    }
    existing_blocks = {
        block.name: block for block in (await db.execute(select(Block))).scalars().all()
    }

    processed = []
    for school_name, school in existing_schools.items():
        school_path = os.path.join(BASE_PATH, school_name)
        if not os.path.exists(school_path):
            continue

        for sector_name in os.listdir(school_path):
            sector_path = os.path.join(school_path, sector_name)
            if not os.path.isdir(sector_path):
                continue

            sector = existing_sectors.get(sector_name)
            if not sector:
                continue

            for block_name in os.listdir(sector_path):
                block_path = os.path.join(sector_path, block_name)
                if not os.path.isdir(block_path):
                    continue

                tileset_path = os.path.join(block_path, "tileset.json")
                lon, lat = get_center_from_tileset(tileset_path) if os.path.exists(tileset_path) else (0.0, 0.0)

                if block_name in existing_blocks:
                    block = existing_blocks[block_name]
                    block.point = WKTElement(f"POINT({lon} {lat})", srid=4326)
                    logger.info(f"Block updated: {block_name}")
                else:
                    block = Block(
                        id=uuid4(),
                        name=block_name,
                        sector_id=sector.id,
                        sector_name=sector_name,
                        school_id=school.id,
                        school_name=school_name,
                        point=WKTElement(f"POINT({lon} {lat})", srid=4326)
                    )
                    db.add(block)
                    logger.info(f"Block added: {block_name}")

                processed.append(block_name)

    if processed:
        await db.commit()
    return processed

async def sync_problems_from_files(db: AsyncSession):
    """
    Create problems for each block based on problems.json,
    including block_name, sector_name and school_name.
    """
    new_problems = []
    existing_blocks = {
        block.id: block for block in (await db.execute(select(Block).options(selectinload(Block.sector), selectinload(Block.school)))).scalars().all()
    }

    for block in existing_blocks.values():
        block_path = os.path.join(BASE_PATH, block.school.name, block.sector.name, block.name)
        problems_path = os.path.join(block_path, "problems.json")
        if not os.path.exists(problems_path):
            continue

        try:
            with open(problems_path, "r", encoding="utf-8") as f:
                problems_data = json.load(f)

            block_new_problems = []
            for item in problems_data:
                name = item.get("name")
                if not name:
                    continue

                existing_problem = await db.execute(
                    select(Problem).where(Problem.name == name, Problem.block_id == block.id)
                )
                if existing_problem.scalars().first():
                    continue

                problem = Problem(
                    id=uuid4(),
                    name=name,
                    block_id=block.id,
                    sector_id=block.sector_id,
                    school_id=block.school_id,
                    block_name=block.name,
                    sector_name=block.sector_name,
                    school_name=block.school_name,
                    grade=item.get("grade"),
                    grade_ss=item.get("grade_ss"),
                    length=item.get("length"),
                    height=item.get("height"),
                    positions=item.get("positions")
                )
                db.add(problem)
                block_new_problems.append(name)

            if block_new_problems:
                new_problems.extend(block_new_problems)
                logger.info(f"Problems added for block {block.name}: {block_new_problems}")

        except Exception as e:
            logger.error(f"Error reading problems.json in {block.name}: {e}")

    if new_problems:
        await db.commit()
    return new_problems

async def update(db: AsyncSession, buffer_meters: float = 5):
    """
    Update sectors and schools:
      - Calculate sector areas from their block points (convex hull + buffer_meters)
      - Calculate school areas from all block points of their sectors (convex hull + buffer_meters + 2)
    """

    schools_updated = await sync_schools_from_files(db)
    sectors_updated = await sync_sectors_from_files(db)
    blocks_updated = await sync_blocks_from_files(db)
    problems_updated = await sync_problems_from_files(db)

    sectors_stmt = select(Sector).options(selectinload(Sector.blocks))
    sectors_result = await db.execute(sectors_stmt)
    sectors = sectors_result.scalars().all()

    for sector in sectors:
        points = []
        for block in sector.blocks:
            if block.point:
                try:
                    point = wkt_loads(str(block.point))
                    points.append(Point(point.x, point.y))
                except Exception as e:
                    logger.error(f"Error reading point from block {block.id}: {e}")

        logger.info(f"Sector {sector.name} has {len(points)} points")

        if points:
            hull = calculate_convex_hull_area(points, buffer_meters=buffer_meters)
            if hull:
                sector.area = WKTElement(hull.wkt, srid=4326)

    await db.commit()

    schools_stmt = select(School).options(selectinload(School.sectors).selectinload(Sector.blocks))
    schools_result = await db.execute(schools_stmt)
    schools = schools_result.scalars().all()

    for school in schools:
        points = []
        for sector in school.sectors:
            for block in sector.blocks:
                if block.point:
                    try:
                        point = wkt_loads(str(block.point))
                        points.append(Point(point.x, point.y))
                    except Exception as e:
                        logger.error(f"Error reading point from block {block.id} (school {school.name}): {e}")

        logger.info(f"School {school.name} has {len(points)} total points from its blocks")

        if points:
            hull = calculate_convex_hull_area(points, buffer_meters=buffer_meters + 2)
            if hull:
                school.area = WKTElement(hull.wkt, srid=4326)

    await db.commit()

    return {
        "schools_created_or_updated": schools_updated,
        "sectors_created_or_updated": sectors_updated,
        "blocks_created_or_updated": blocks_updated,
        "problems_created": problems_updated
    }