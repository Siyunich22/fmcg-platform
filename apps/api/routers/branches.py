from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_db
from models.models import Branch, Nomenclature

router = APIRouter()


@router.get("/branches")
async def list_branches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Branch).where(Branch.active == True).order_by(Branch.name))
    branches = result.scalars().all()
    return [
        {"id": str(b.id), "name": b.name, "code_1c": b.code_1c, "active": b.active}
        for b in branches
    ]


@router.get("/nomenclature")
async def list_nomenclature(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Nomenclature).where(Nomenclature.active == True).order_by(Nomenclature.name).limit(500)
    )
    items = result.scalars().all()
    return [
        {"id": str(n.id), "name": n.name, "code_1c": n.code_1c, "category": n.category, "unit": n.unit, "active": n.active}
        for n in items
    ]
