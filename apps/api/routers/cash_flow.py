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
    """Return total cash received per branch. Without period_date uses the latest period."""
    # If no period given — use the latest one in DB
    if not period_date:
        latest = await db.execute(
            select(CashFlowEntry.period_date)
            .order_by(CashFlowEntry.period_date.desc())
            .limit(1)
        )
        period_date = str(latest.scalar_one_or_none() or "")

    if not period_date:
        return []

    q = (
        select(
            CashFlowEntry.branch_code,
            CashFlowEntry.branch_name,
            func.sum(CashFlowEntry.amount).label("total_amount"),
            func.count(CashFlowEntry.id).label("tx_count"),
        )
        .where(CashFlowEntry.period_date == period_date)
        .group_by(CashFlowEntry.branch_code, CashFlowEntry.branch_name)
        .order_by(func.sum(CashFlowEntry.amount).desc())
    )

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
