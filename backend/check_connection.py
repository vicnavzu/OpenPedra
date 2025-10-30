import asyncio
import os
import sys
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL")

async def check_db():
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        await conn.close()
        return True
    except Exception:
        return False

if __name__ == "__main__":
    result = asyncio.run(check_db())
    sys.exit(0 if result else 1)