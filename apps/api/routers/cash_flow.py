"""Router for cash flow data (Карточка счета 1000)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db import get_db
from models.models import CashFlowEntry

router = APIRouter()


@router.get("/dates")
async def get_cash_flow_dates(db: AsyncSession = Depends(get_db)):
    """Return distinct period dates, newest first."""
    result = await db.execute(
        select(CashFlowEntry.period_date)
        .distinct()
        .order_by(CashFlowEntry.period_date.desc())
    )
    return [str(r[0]) for r in result.all()]


@router.get("/summary")
async def get_cash_flow_summary(
    period_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return total cash received per branch for the given period."""
    q = (
        select(
            CashFlowEntry.branch_code,
            CashFlowEntry.branch_name,
            func.sum(CashFlowEntry.amount).label("total_amount"),
            func.count(CashFlowEntry.id).label("tx_count"),
        )
        .group_by(CashFlowEntry.branch_code, CashFlowEntry.branch_name)
        .order_by(func.sum(CashFlowEntry.amount).desc())
    )

    if period_date:
        q = q.where(CashFlowEntry.period_date == period_date)

    result = await db.execute(q)
    rows = result.all()

    total = sum(float(r.total_amount) for r in rows)
    return [
        {
            "branch_code": r.branch_code,
            "branch_name": r.branch_name,
            "total_amount": float(r.total_amount),
            "tx_count": r.tx_count,
            "share": round(float(r.total_amount) / total * 100, 1) if total > 0 else 0,
        }
        for r in rows
    ]
