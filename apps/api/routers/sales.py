from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from db import get_db
from models.models import Sale, Stock, Branch, Nomenclature

router = APIRouter()


@router.get("/")
async def list_sales(
    branch_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    # Show per-product sales from Stock.sales_sum (excludes branch totals)
    q = (
        select(
            Stock.id,
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            Nomenclature.id.label("nomenclature_id"),
            Nomenclature.name.label("nomenclature_name"),
            Nomenclature.category.label("category"),
            Stock.snapshot_date.label("period_date"),
            Stock.sales_sum.label("amount"),
        )
        .join(Branch, Stock.branch_id == Branch.id)
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .where(Stock.sales_sum > 0)
    )
    if branch_id:
        q = q.where(Stock.branch_id == branch_id)
    if category:
        q = q.where(Nomenclature.category == category)
    q = q.order_by(Stock.snapshot_date.desc(), Stock.sales_sum.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "id": str(r.id),
            "branch_id": str(r.branch_id),
            "branch_name": r.branch_name,
            "nomenclature_id": str(r.nomenclature_id),
            "nomenclature_name": r.nomenclature_name,
            "category": r.category,
            "period_date": str(r.period_date),
            "amount": float(r.amount),
        }
        for r in rows
    ]


@router.get("/by-branch-product")
async def sales_by_branch_product(
    branch_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Sales grouped by branch + nomenclature using Stock.sales_sum."""
    q = (
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            Nomenclature.id.label("nomenclature_id"),
            Nomenclature.name.label("nomenclature_name"),
            Nomenclature.category.label("category"),
            func.sum(Stock.sales_sum).label("total_amount"),
        )
        .join(Stock, Stock.branch_id == Branch.id)
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .where(Stock.sales_sum > 0)
        .group_by(Branch.id, Branch.name, Nomenclature.id, Nomenclature.name, Nomenclature.category)
    )
    if branch_id:
        q = q.where(Branch.id == branch_id)
    if category:
        q = q.where(Nomenclature.category == category)
    q = q.order_by(Branch.name, func.sum(Stock.sales_sum).desc())
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "branch_id": str(r.branch_id),
            "branch_name": r.branch_name,
            "nomenclature_id": str(r.nomenclature_id),
            "nomenclature_name": r.nomenclature_name,
            "category": r.category,
            "total_amount": float(r.total_amount),
        }
        for r in rows
    ]


@router.get("/by-branch")
async def sales_by_branch(db: AsyncSession = Depends(get_db)):
    # Use branch-level ИТОГО Sale records for accurate branch totals
    result = await db.execute(
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            func.sum(Sale.amount).label("total_amount"),
        )
        .join(Sale, Sale.branch_id == Branch.id)
        .join(Nomenclature, Sale.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c == "__BRANCH_TOTAL__")
        .group_by(Branch.id, Branch.name)
        .order_by(func.sum(Sale.amount).desc())
    )
    rows = result.all()
    return [
        {
            "branch_id": str(r.branch_id),
            "branch_name": r.branch_name,
            "total_amount": float(r.total_amount),
        }
        for r in rows
    ]


@router.get("/by-period")
async def sales_by_period(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Sale.period_date, func.sum(Sale.amount).label("total"))
        .join(Nomenclature, Sale.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c == "__BRANCH_TOTAL__")
        .group_by(Sale.period_date)
        .order_by(Sale.period_date)
    )
    rows = result.all()
    return [{"period_date": str(r.period_date), "total": float(r.total)} for r in rows]
