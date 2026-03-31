from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, distinct
from db import get_db
from models.models import TmzEntry

router = APIRouter()

BRANCH_NAMES = {
    "ALMATY": "Алматы",
    "BEREКЕ": "Береке",
    "MAIN": "Основной склад",
    "AKTAU": "Актау",
    "AKTOBE": "Актобе",
    "ATYRAU": "Атырау",
    "KOKSHETAU": "Кокшетау",
    "SEMEY": "Семей",
    "ASTANA": "Астана",
    "KARAGANDA": "Карагнда",
    "SHYMKENT": "Шымкент",
    "KOSTANAY": "Костанай",
    "PAVLODAR": "Павлодар",
    "URALSK": "Уральск",
}


@router.get("/dates")
async def get_tmz_dates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(distinct(TmzEntry.period_date)).order_by(TmzEntry.period_date.desc())
    )
    return [str(d) for d in result.scalars().all()]


@router.get("")
async def get_tmz(
    period_date: str | None = Query(None),
    branch: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(TmzEntry)

    if period_date:
        q = q.where(TmzEntry.period_date == period_date)
    else:
        # Latest date
        latest = await db.execute(
            select(TmzEntry.period_date).order_by(TmzEntry.period_date.desc()).limit(1)
        )
        latest_date = latest.scalar_one_or_none()
        if latest_date:
            q = q.where(TmzEntry.period_date == latest_date)

    if branch:
        q = q.where(TmzEntry.branch_code == branch)

    if search:
        q = q.where(TmzEntry.product_name.ilike(f"%{search}%"))

    q = q.order_by(TmzEntry.branch_code, TmzEntry.sub_branch.nulls_first(), TmzEntry.product_name)

    result = await db.execute(q)
    rows = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "branch_code": r.branch_code,
            "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
            "sub_branch": r.sub_branch,
            "product_name": r.product_name,
            "qty_end": float(r.qty_end or 0),
            "amount_end": float(r.amount_end or 0),
            "period_date": str(r.period_date),
        }
        for r in rows
    ]


@router.get("/summary")
async def get_tmz_summary(
    period_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Branch totals for TMZ."""
    from sqlalchemy import func

    q = select(
        TmzEntry.branch_code,
        TmzEntry.sub_branch,
        func.sum(TmzEntry.qty_end).label("total_qty"),
        func.sum(TmzEntry.amount_end).label("total_amount"),
        func.count(TmzEntry.id).label("sku_count"),
    )

    if period_date:
        q = q.where(TmzEntry.period_date == period_date)
    else:
        latest = await db.execute(
            select(TmzEntry.period_date).order_by(TmzEntry.period_date.desc()).limit(1)
        )
        latest_date = latest.scalar_one_or_none()
        if latest_date:
            q = q.where(TmzEntry.period_date == latest_date)

    q = q.group_by(TmzEntry.branch_code, TmzEntry.sub_branch).order_by(TmzEntry.branch_code)
    result = await db.execute(q)

    return [
        {
            "branch_code": r.branch_code,
            "branch_name": BRANCH_NAMES.get(r.branch_code, r.branch_code),
            "sub_branch": r.sub_branch,
            "total_qty": float(r.total_qty or 0),
            "total_amount": float(r.total_amount or 0),
            "sku_count": r.sku_count,
        }
        for r in result.all()
    ]
