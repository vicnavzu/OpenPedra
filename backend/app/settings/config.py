import os
from pydantic_settings import BaseSettings
from pydantic import Field
import secrets

def ensure_secret_key():

    if os.getenv("SECRET_KEY"):
        return os.getenv("SECRET_KEY")
    else:
        return secrets.token_hex(32)
    

class Settings(BaseSettings):
    app_name: str = Field(default="OpenPedra API")
    secret_key: str = Field(...)
    jwt_algorithm: str = Field(default="HS256")
    database_url: str = Field(...)

def get_settings():
    if "DATABASE_URL" not in os.environ:
        user = os.getenv("POSTGRES_USER", "openpedra")
        password = os.getenv("POSTGRES_PASSWORD", "openpedra-pass")
        db = os.getenv("POSTGRES_DB", "openpedra")
        host = os.getenv("POSTGRES_HOST", "openpedra-db")
        os.environ["DATABASE_URL"] = f"postgresql+asyncpg://{user}:{password}@{host}:5432/{db}"
    return Settings()

settings = get_settings()
