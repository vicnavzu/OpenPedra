import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.settings.config import settings
from app.models.base import Base
from app.models.school import School
from app.models.sector import Sector
from app.models.block import Block
from app.models.problem import Problem

logging.basicConfig()
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

DATABASE_URL = settings.database_url
if DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

print(f"[DEBUG] Async SQLAlchemy engine URL: {DATABASE_URL}")

engine = create_async_engine(
    DATABASE_URL,
    echo=True,
    future=True
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def get_db() -> AsyncSession:
    """
    Async session generator for dependency injection in FastAPI.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
