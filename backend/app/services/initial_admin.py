import os
import logging
from sqlalchemy import select
from app.database.connection import get_db
from app.models.user import User
from app.services.auth import hash_password

logger = logging.getLogger(__name__)

async def create_initial_admin():

    async for db in get_db():
        try:
            existing_admin = await db.scalar(select(User).where(User.is_admin == True))
            if existing_admin:
                logger.info("Admin user already exists!")
                return
        
            username = os.getenv("INIT_ADMIN_USERNAME", "admin")
            email = os.getenv("INIT_ADMIN_EMAIL", "admin@example.com")
            password = os.getenv("INIT_ADMIN_PASSWORD", "admin-pass")

            admin_user = User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                is_admin=True
            )
            
            db.add(admin_user)
            await db.commit()
            logger.info("Initial admin user created!")
            logger.info(f"Username: {username}")
            logger.info(f"Email: {email}")
            logger.info(f"Password: {password}")
        
        except Exception as e:
            logger.error(f"Error creating admin user: {e}")
            await db.rollback()