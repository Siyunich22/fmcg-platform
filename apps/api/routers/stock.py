from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from db import get_db
from models.models import Stock, Nomenclature, Branch

router = APIRouter()


@router.get("/")
async def list_stock(
    branch_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    flag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, le=2000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(
            Stock,
            Nomenclature.name.label("nom_name"),
            Nomenclature.category.label("category"),
            Nomenclature.subcategory.label("subcategory"),
            Branch.name.label("branch_name"),
        )
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .join(Branch, Stock.branch_id == Branch.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .where(Nomenclature.is_aggregate == False)  # noqa: E712
    )
    if branch_id:
        q = q.where(Stock.branch_id == branch_id)
    if category:
        q = q.where(Nomenclature.category == category)
    if subcategory:
        q = q.where(Nomenclature.subcategory == subcategory)
    if flag:
        q = q.where(Stock.flag == flag)
    if search:
        q = q.where(Nomenclature.name.ilike(f"%{search}%"))
    q = q.order_by(Nomenclature.category, Nomenclature.subcategory, Nomenclature.name).limit(limit).offset(offset)
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "id": str(r.Stock.id),
            "branch_id": str(r.Stock.branch_id),
            "branch_name": r.branch_name,
            "nomenclature_id": str(r.Stock.nomenclature_id),
            "name": r.nom_name,
            "category": r.category,
            "subcategory": r.subcategory,
            "snapshot_date": str(r.Stock.snapshot_date),
            "qty": float(r.Stock.qty),
            "amount": float(r.Stock.amount),
            "sales_sum": float(r.Stock.sales_sum),
            "days_supply": r.Stock.days_supply,
            "flag": r.Stock.flag,
        }
        for r in rows
    ]


@router.get("/categories")
async def get_stock_categories(db: AsyncSession = Depends(get_db)):
    """Get distinct categories and their subcategories for filter UI."""
    result = await db.execute(
        select(Nomenclature.category, Nomenclature.subcategory)
        .select_from(Stock)
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .group_by(Nomenclature.category, Nomenclature.subcategory)
        .order_by(Nomenclature.category, Nomenclature.subcategory)
    )
    rows = result.all()
    # Build tree: {category: [subcategory, ...]}
    tree: dict = {}
    for r in rows:
        tree.setdefault(r.category, []).append(r.subcategory)
    return [{"category": cat, "subcategories": subs} for cat, subs in sorted(tree.items())]


@router.get("/matrix")
async def stock_matrix(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Stock)
    if category:
        q = q.join(Nomenclature, Stock.nomenclature_id == Nomenclature.id).where(
            Nomenclature.category == category
        )
    result = await db.execute(q)
    return result.scalars().all()
