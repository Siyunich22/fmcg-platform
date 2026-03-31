from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

# Supabase и Render дают postgresql://, asyncpg требует postgresql+asyncpg://
_raw_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://fmcg:fmcg@localhost:5432/fmcg")
DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1) if _raw_url.startswith("postgresql://") else _raw_url

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
