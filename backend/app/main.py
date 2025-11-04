import os
import time
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.database.connection import engine, AsyncSessionLocal, Base, get_db
import app.api.v1 as api_openpedra
from app.settings.config import settings
import logging
from app.services.sync import update
from app.services.utils import slugify
from app.services.initial_admin import create_initial_admin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.school import School
from app.models.sector import Sector
from app.models.block import Block
import json

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

with open(os.path.join(os.path.dirname(__file__), '../config.json')) as f:
    config = json.load(f)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    root_path="/api" 
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    logger.info("Application starting...")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tables created or already exist")

    if config.get("updateGeometries", False):
        buffer_meters = config.get("geometriesBuffer", 5)
        async with AsyncSessionLocal() as db:
            try:
                await update(db, buffer_meters=buffer_meters)
                logger.info(f"Update executed successfully on app startup with buffer {buffer_meters}m.")
            except Exception as e:
                logger.error(f"Error executing update on startup: {e}")
    else:
        logger.info("Skipping geometry update due to config.json settings.")

    try:
        await create_initial_admin()
    except Exception as e:
        logger.error(f"Could not create initial admin: {e}")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Application shutting down...")
    await engine.dispose()

router_prefix = "/v1"
app.include_router(api_openpedra.school_router, prefix=router_prefix, tags=["Schools"])
app.include_router(api_openpedra.sector_router, prefix=router_prefix, tags=["Sectors"])
app.include_router(api_openpedra.block_router, prefix=router_prefix, tags=["Blocks"])
app.include_router(api_openpedra.problem_router, prefix=router_prefix, tags=["Problems"])
app.include_router(api_openpedra.user_router, prefix=router_prefix, tags=["Users"])
app.include_router(api_openpedra.invitation_router, prefix=router_prefix, tags=["Invitations"])

@app.get("/")
async def root():
    return {"message": "API running"}

@app.get("/healthcheck")
async def healthcheck():
    return {"status": "ok"}

@app.post("/update")
async def api_update_all(db: AsyncSession = Depends(get_db)):
    """
    Update all blocks and problems by reading 3DTiles directories.
    """
    return await update(db)

@app.get("/config")
def get_config():
    return JSONResponse({
        "modelsdir": config["modelsdir"],
        "cesiumToken": os.getenv("CESIUM_TOKEN", "")
    })

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
schools_dir = os.path.join(base_dir, config["modelsdir"])
frontend_dir = os.path.join(base_dir, 'frontend')

if os.path.exists(schools_dir):
    app.mount("/3dmodels", StaticFiles(directory=schools_dir), name="3dmodels")
    logger.info(f"Schools directory mounted: {schools_dir}")
else:
    logger.warning(f"Schools directory not found: {schools_dir}")

if os.path.exists(frontend_dir):
    public_dir = os.path.join(frontend_dir, 'public')
    scripts_dir = os.path.join(frontend_dir, 'scripts')
    styles_dir = os.path.join(frontend_dir, 'styles')
    
    if os.path.exists(public_dir):
        app.mount("/static", StaticFiles(directory=public_dir), name="static")
    if os.path.exists(scripts_dir):
        app.mount("/scripts", StaticFiles(directory=scripts_dir), name="scripts")
    if os.path.exists(styles_dir):
        app.mount("/styles", StaticFiles(directory=styles_dir), name="styles")