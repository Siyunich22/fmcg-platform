"""
One-time script: reclassify all nomenclature that is currently ПРОЧЕЕ.
Run from apps/api/:  python recategorize.py
"""
import asyncio
import sys
import re
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select, update
from db import DATABASE_URL
from models.models import Nomenclature
from services.parser_sales import detect_category


async def run():
    engine = create_async_engine(DATABASE_URL)
    updated = 0
    skipped = 0

    async with AsyncSession(engine) as s:
        result = await s.execute(select(Nomenclature).where(Nomenclature.category == "ПРОЧЕЕ"))
        items = result.scalars().all()
        print(f"Found {len(items)} items in ПРОЧЕЕ")

        for nom in items:
            new_cat = detect_category(nom.name)
            if new_cat != "ПРОЧЕЕ":
                nom.category = new_cat
                updated += 1
                print(f"  {nom.name[:50]:50} -> {new_cat}")
            else:
                skipped += 1

        await s.commit()

    print(f"\nDone: {updated} updated, {skipped} remain ПРОЧЕЕ")


if __name__ == "__main__":
    asyncio.run(run())
