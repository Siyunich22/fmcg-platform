from datetime import date as date_type
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db import get_db
from models.models import SalesReportEntry, ProductCost, FotSetting

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


@router.get("/costs")
async def get_costs(db: AsyncSession = Depends(get_db)):
    """All product unit costs (себестоимость)."""
    result = await db.execute(select(ProductCost))
    rows = result.scalars().all()
    return {r.code: float(r.unit_cost or 0) for r in rows}


@router.post("/costs")
async def upsert_cost(
    code: str = Body(...),
    name: Optional[str] = Body(None),
    unit_cost: float = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Upsert unit cost for a product code."""
    stmt = pg_insert(ProductCost).values(
        code=code, name=name, unit_cost=unit_cost
    ).on_conflict_do_update(
        index_elements=["code"],
        set_={"unit_cost": unit_cost, "name": name},
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True, "code": code, "unit_cost": unit_cost}


@router.get("/fot")
async def get_fot(db: AsyncSession = Depends(get_db)):
    """Get ФОТ setting (pct of реализация)."""
    result = await db.execute(select(FotSetting).where(FotSetting.id == 1))
    row = result.scalar_one_or_none()
    return {"pct": float(row.pct) if row else 25.0}


@router.post("/fot")
async def set_fot(
    pct: float = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Set ФОТ percentage."""
    stmt = pg_insert(FotSetting).values(id=1, pct=pct).on_conflict_do_update(
        index_elements=["id"],
        set_={"pct": pct},
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True, "pct": pct}


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


@router.post("/normalize")
async def normalize_categories(db: AsyncSession = Depends(get_db)):
    """
    Normalize categories in existing data:
    1. Strip 'БОНУСЫ' suffix from cat1/cat2, mark those rows as is_bonus=TRUE
    2. Normalize case variants of КУХМАСТЕР
    """
    from sqlalchemy import update, case as sa_case

    # Fetch distinct cat1 values that need normalizing
    r_cat1 = await db.execute(
        select(SalesReportEntry.cat1).distinct().where(SalesReportEntry.cat1.isnot(None))
    )
    all_cat1 = [row[0] for row in r_cat1.all()]

    suffix = "БОНУСЫ"
    bonus_cats = [c for c in all_cat1 if c.upper().rstrip().endswith(suffix)]
    kuhmaster_cats = [c for c in all_cat1 if c.upper() == "КУХМАСТЕР" and c != "КУХМАСТЕР"]

    bonus_count = 0
    for cat in bonus_cats:
        cleaned = cat.upper().rstrip()
        # Strip the suffix and any trailing space
        new_cat = cat[:len(cat) - len(cat) + len(cat.rstrip())].rstrip()
        # Find where БОНУСЫ starts (case-insensitive)
        upper = cat.upper()
        idx = upper.rfind(" " + suffix)
        if idx == -1:
            idx = upper.rfind(suffix)
        new_cat = cat[:idx].strip() if idx >= 0 else cat

        r = await db.execute(
            text("""
                UPDATE sales_report_entries
                SET cat1 = :new_cat, is_bonus = TRUE
                WHERE cat1 = :old_cat
            """),
            {"new_cat": new_cat, "old_cat": cat},
        )
        bonus_count += r.rowcount

    kuhmaster_count = 0
    for cat in kuhmaster_cats:
        r = await db.execute(
            text("UPDATE sales_report_entries SET cat1 = 'КУХМАСТЕР' WHERE cat1 = :old_cat"),
            {"old_cat": cat},
        )
        kuhmaster_count += r.rowcount

    # Also strip БОНУСЫ from cat2
    r_cat2 = await db.execute(
        select(SalesReportEntry.cat2).distinct().where(SalesReportEntry.cat2.isnot(None))
    )
    for row in r_cat2.all():
        c = row[0]
        upper = c.upper()
        idx = upper.rfind(" " + suffix)
        if idx >= 0:
            new_cat = c[:idx].strip()
            await db.execute(
                text("UPDATE sales_report_entries SET cat2 = :new_cat WHERE cat2 = :old_cat"),
                {"new_cat": new_cat, "old_cat": c},
            )

    await db.commit()
    return {
        "ok": True,
        "bonus_rows_fixed": bonus_count,
        "kuhmaster_rows_fixed": kuhmaster_count,
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
