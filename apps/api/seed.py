"""
Seed script — run once to populate branches and create admin user.
Usage: python seed.py
"""

import asyncio
import bcrypt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os, sys

sys.path.insert(0, os.path.dirname(__file__))

from db import engine, AsyncSessionLocal, Base
from models.models import Branch, User, UserRole

def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

BRANCHES = [
    {"name": "Основной склад",  "code_1c": "MAIN"},
    {"name": "Актау",           "code_1c": "AKTAU"},
    {"name": "Актобе",          "code_1c": "AKTOBE"},
    {"name": "Алматы",          "code_1c": "ALMATY"},
    {"name": "Астана",          "code_1c": "ASTANA"},
    {"name": "ИП Береке",       "code_1c": "БЕРЕКЕ"},
    {"name": "Атырау",          "code_1c": "ATYRAU"},
    {"name": "Кокшетау",        "code_1c": "KOKSHETAU"},
    {"name": "RTA Distribution","code_1c": "RTA"},
    {"name": "Семей",           "code_1c": "SEMEY"},
    {"name": "Шымкент",         "code_1c": "SHYMKENT"},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Branches
        from sqlalchemy import select
        existing = await db.execute(select(Branch))
        if not existing.scalars().first():
            for b in BRANCHES:
                db.add(Branch(**b))
            print(f"✓ Created {len(BRANCHES)} branches")
        else:
            print("  Branches already exist, skipping")

        # Admin user
        existing_user = await db.execute(select(User).where(User.email == "admin@fmcg.kz"))
        if not existing_user.scalar_one_or_none():
            db.add(User(
                email="admin@fmcg.kz",
                hashed_password=_hash("admin123"),
                role=UserRole.admin,
            ))
            print("✓ Created admin user: admin@fmcg.kz / admin123")
        else:
            print("  Admin user already exists, skipping")

        await db.commit()
        print("\n✅ Seed complete!")
        print("   Login: admin@fmcg.kz")
        print("   Pass:  admin123")


if __name__ == "__main__":
    asyncio.run(seed())
