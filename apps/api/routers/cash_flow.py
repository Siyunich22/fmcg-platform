"""Router for cash flow data (Карточка счета 1000)."""
from datetime import date as date_type

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db import get_db
from models.models import CashFlowEntry

router = APIRouter()


@router.delete("/period/{period_date}")
async def delete_cash_flow_period(period_date: str, db: AsyncSession = Depends(get_db)):
    """Delete all cash flow entries for a given period (YYYY-MM-DD)."""
    from sqlalchemy import delete as sa_delete
    try:
        pd = date_type.fromisoformat(period_date)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")
    result = await db.execute(
        sa_delete(CashFlowEntry).where(CashFlowEntry.period_date == pd)
    )
    await db.commit()
    return {"deleted": result.rowcount, "period_date": period_date}


@router.get("/count")
async def get_cash_flow_count(db: AsyncSession = Depends(get_db)):
    """Debug: return total row count and distinct period dates."""
    total = await db.execute(select(func.count(CashFlowEntry.id)))
    dates_result = await db.execute(
        select(CashFlowEntry.period_date, func.count(CashFlowEntry.id))
        .group_by(CashFlowEntry.period_date)
        .order_by(CashFlowEntry.period_date.desc())
    )
    return {
        "total_rows": total.scalar_one(),
        "by_period": [{"period_date": str(r[0]), "rows": r[1]} for r in dates_result.all()],
    }


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
    # Resolve period_date: use given value or auto-pick latest
    resolved: date_type | None = None
    if period_date:
        try:
            resolved = date_type.fromisoformat(period_date)
        except ValueError:
            pass
    if resolved is None:
        latest = await db.execute(
            select(CashFlowEntry.period_date)
            .order_by(CashFlowEntry.period_date.desc())
            .limit(1)
        )
        resolved = latest.scalar_one_or_none()

    if resolved is None:
        return []

    q = (
        select(
            CashFlowEntry.branch_code,
            CashFlowEntry.branch_name,
            func.sum(CashFlowEntry.amount).label("total_amount"),
            func.count(CashFlowEntry.id).label("tx_count"),
        )
        .where(CashFlowEntry.period_date == resolved)
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
