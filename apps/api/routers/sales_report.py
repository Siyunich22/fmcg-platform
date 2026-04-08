from datetime import date as date_type
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from db import get_db
from models.models import SalesReportEntry

router = APIRouter()

BRANCH_NAMES = {
    "BEREКЕ":     "Береке",
    "MAIN":       "Основной склад",
    "AKTAU":      "Актау",
    "AKTOBE":     "Актобе",
    "ALMATY":     "Алматы",
    "ASTANA":     "Астана",
    "ATYRAU":     "Атырау",
    "KARAGANDA":  "Караганда",
    "KOKSHETAU":  "Кокшетау",
    "SEMEY":      "Семей",
    "SHYMKENT":   "Шымкент",
}


@router.get("/dates")
async def get_dates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesReportEntry.period_date).distinct().order_by(SalesReportEntry.period_date.desc())
    )
    return [str(d) for d in result.scalars().all()]


@router.get("/branches")
async def get_branches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesReportEntry.branch_code).distinct()
    )
    codes = result.scalars().all()
    return [{"code": c, "name": BRANCH_NAMES.get(c, c)} for c in sorted(codes)]


@router.get("/summary")
async def get_summary(
    period_date: str | None = Query(None),
    branch_code: str | None = Query(None),
    is_bonus: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Category-level summary: cat1 > cat2 totals."""
    pd = await _resolve_date(period_date, db)
    if not pd:
        return []

    q = (
        select(
            SalesReportEntry.cat1,
            SalesReportEntry.cat2,
            SalesReportEntry.cat3,
            SalesReportEntry.branch_code,
            func.sum(SalesReportEntry.qty).label("qty"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd)
        .where(SalesReportEntry.is_bonus == is_bonus)
    )
    if branch_code:
        q = q.where(SalesReportEntry.branch_code == branch_code)

    q = q.group_by(
        SalesReportEntry.cat1,
        SalesReportEntry.cat2,
        SalesReportEntry.cat3,
        SalesReportEntry.branch_code,
    ).order_by(SalesReportEntry.cat1, SalesReportEntry.cat2, SalesReportEntry.cat3)

    result = await db.execute(q)
    return [
        {
            "cat1": r.cat1,
            "cat2": r.cat2,
            "cat3": r.cat3,
            "branch_code": r.branch_code,
            "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
            "qty": float(r.qty or 0),
            "amount": float(r.amount or 0),
        }
        for r in result.all()
    ]


@router.get("/rows")
async def get_rows(
    period_date: str | None = Query(None),
    branch_code: str | None = Query(None),
    cat1: str | None = Query(None),
    cat2: str | None = Query(None),
    is_bonus: bool = Query(False),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Leaf-level rows (actual products)."""
    pd = await _resolve_date(period_date, db)
    if not pd:
        return []

    q = select(SalesReportEntry).where(
        SalesReportEntry.period_date == pd,
        SalesReportEntry.is_bonus == is_bonus,
    )
    if branch_code:
        q = q.where(SalesReportEntry.branch_code == branch_code)
    if cat1:
        q = q.where(SalesReportEntry.cat1 == cat1)
    if cat2:
        q = q.where(SalesReportEntry.cat2 == cat2)
    if search:
        q = q.where(SalesReportEntry.name.ilike(f"%{search}%"))

    q = q.order_by(
        SalesReportEntry.cat1,
        SalesReportEntry.cat2,
        SalesReportEntry.cat3,
        SalesReportEntry.cat4,
        SalesReportEntry.name,
    )
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "cat1": r.cat1,
            "cat2": r.cat2,
            "cat3": r.cat3,
            "cat4": r.cat4,
            "is_bonus": r.is_bonus,
            "branch_code": r.branch_code,
            "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
            "qty": float(r.qty or 0),
            "amount": float(r.amount or 0),
        }
        for r in rows
    ]


@router.get("/totals")
async def get_totals(
    period_date: str | None = Query(None),
    branch_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Grand totals per branch."""
    pd = await _resolve_date(period_date, db)
    if not pd:
        return []

    q = (
        select(
            SalesReportEntry.branch_code,
            func.sum(SalesReportEntry.qty).label("qty"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd)
        .where(SalesReportEntry.is_bonus == False)  # noqa: E712
    )
    if branch_code:
        q = q.where(SalesReportEntry.branch_code == branch_code)
    q = q.group_by(SalesReportEntry.branch_code).order_by(SalesReportEntry.branch_code)

    result = await db.execute(q)
    return [
        {
            "branch_code": r.branch_code,
            "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
            "qty": float(r.qty or 0),
            "amount": float(r.amount or 0),
        }
        for r in result.all()
    ]


async def _resolve_date(period_date: str | None, db: AsyncSession) -> date_type | None:
    if period_date:
        return date_type.fromisoformat(period_date)
    result = await db.execute(
        select(SalesReportEntry.period_date).order_by(SalesReportEntry.period_date.desc()).limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/stats")
async def get_stats(
    period_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Diagnostic: row counts by branch and cat1 for a period."""
    pd = await _resolve_date(period_date, db)
    if not pd:
        return {"period_date": None, "total_rows": 0, "by_branch": [], "by_cat1": []}

    total = await db.execute(
        select(func.count()).where(SalesReportEntry.period_date == pd)
    )

    by_branch = await db.execute(
        select(
            SalesReportEntry.branch_code,
            SalesReportEntry.is_bonus,
            func.count().label("rows"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd)
        .group_by(SalesReportEntry.branch_code, SalesReportEntry.is_bonus)
        .order_by(SalesReportEntry.branch_code)
    )

    by_cat1 = await db.execute(
        select(
            SalesReportEntry.cat1,
            func.count().label("rows"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus == False)  # noqa
        .group_by(SalesReportEntry.cat1)
        .order_by(func.sum(SalesReportEntry.amount).desc())
    )

    return {
        "period_date": str(pd),
        "total_rows": total.scalar(),
        "by_branch": [
            {
                "branch_code": r.branch_code,
                "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
                "is_bonus": r.is_bonus,
                "rows": r.rows,
                "amount": float(r.amount or 0),
            }
            for r in by_branch.all()
        ],
        "by_cat1": [
            {
                "cat1": r.cat1 or "(нет категории)",
                "rows": r.rows,
                "amount": float(r.amount or 0),
            }
            for r in by_cat1.all()
        ],
    }


@router.delete("/clear")
async def clear_period(
    period_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete all sales report data for a specific period."""
    pd = date_type.fromisoformat(period_date)
    result = await db.execute(
        delete(SalesReportEntry).where(SalesReportEntry.period_date == pd)
    )
    await db.commit()
    return {"ok": True, "deleted": result.rowcount, "period_date": str(pd)}
