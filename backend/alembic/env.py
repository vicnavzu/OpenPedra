import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.models.base import Base
from app.settings.config import settings
from app import models  # Import all models for autogenerate

config = context.config
fileConfig(config.config_file_name)

database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif database_url.startswith("postgresql://") and "+asyncpg" not in database_url:
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata

def include_object(object, name, type_, reflected, compare_to):
    """
    Filter which objects to include in auto migrations.
    Ignore PostGIS system tables and extensions.
    """
    postgis_system_tables = {
        'spatial_ref_sys', 'geometry_columns', 'geography_columns',
        'raster_columns', 'raster_overviews', 'topology'
    }
    
    system_tables = {
        'tiger', 'edges', 'faces', 'addr', 'featnames', 'place', 
        'county', 'state', 'zip_lookup', 'zip_state', 'countysub_lookup',
        'place_lookup', 'state_lookup', 'street_type_lookup', 
        'secondary_unit_lookup', 'direction_lookup', 'layer',
        'pagc_gaz', 'pagc_lex', 'pagc_rules', 'loader_platform',
        'loader_lookuptables', 'loader_variables', 'geocode_settings',
        'geocode_settings_default', 'zip_lookup_all', 'zip_lookup_base',
        'addrfeat', 'bg', 'cousub', 'tabblock', 'tabblock20', 'tract',
        'zcta5', 'zip_state_loc',
    }
    keep_tables = {
    }
    
    if type_ == "table":
        if name in postgis_system_tables:
            return False
        
        if name in keep_tables:
            return False
            
        if name in system_tables:
            return False
            
        if any(name.endswith(suffix) for suffix in ['_lookup', '_all', '_base', '_idx']):
            return False
            
        if any(name.startswith(prefix) for prefix in ['tiger_', 'pg_', 'sql_']):
            return False
            
    if type_ == "index" and any(name.startswith(prefix) for prefix in ['idx_', 'tiger_', 'pg_']):
        return False
        
    return True

def run_migrations_offline():
    """
    Generate migration SQL in offline mode.
    With asyncpg, online mode is recommended.
    """
    raise RuntimeError("Offline mode not supported with AsyncEngine")

def do_run_migrations(connection):
    """
    Run migrations on a synchronized connection.
    """
    context.configure(
        connection=connection, 
        target_metadata=target_metadata,
        include_object=include_object,
        include_schemas=True
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    """
    Run migrations on the actual database (online mode).
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())