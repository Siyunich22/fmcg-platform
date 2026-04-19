"""P&L management accounting router."""
from datetime import date as date_type
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db import get_db
from models.models import PnlExpense, PnlTarget, SalesReportEntry, ProductCost, FotSetting

router = APIRouter()

BRANCH_NAMES = {
    "BEREКЕ": "Береке", "AKTAU": "Актау", "AKTOBE": "Актобе",
    "ALMATY": "Алматы", "ASTANA": "Астана", "ATYRAU": "Атырау",
    "KARAGANDA": "Караганда", "KOKSHETAU": "Кокшетау",
    "SEMEY": "Семей", "SHYMKENT": "Шымкент",
}

EXPENSE_CATEGORIES = [
    ("ФОТ", 10), ("Аренда", 20), ("Маркетинг", 30),
    ("Логистика", 40), ("Адм. расходы", 50), ("Прочие расходы", 90),
]


async def _latest_date(db: AsyncSession) -> Optional[date_type]:
    r = await db.execute(
        select(SalesReportEntry.period_date).order_by(SalesReportEntry.period_date.desc()).limit(1)
    )
    return r.scalar_one_or_none()


@router.get("/dates")
async def get_dates(db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(SalesReportEntry.period_date).distinct().order_by(SalesReportEntry.period_date.desc())
    )
    return [str(d) for d in r.scalars().all()]


@router.get("/summary")
async def get_summary(
    period_date: Optional[str] = Query(None),
    exclude_returns: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    pd = date_type.fromisoformat(period_date) if period_date else await _latest_date(db)
    if not pd:
        return {"period_date": None, "branches": [], "categories": [], "branch_data": [], "fot_pct": 25}

    # ── Cost map ────────────────────────────────────────────────────────────────
    costs_r = await db.execute(select(ProductCost))
    cost_map: dict[str, float] = {r.code: float(r.unit_cost or 0) for r in costs_r.scalars().all()}

    fot_r = await db.execute(select(FotSetting).where(FotSetting.id == 1))
    fot_row = fot_r.scalar_one_or_none()
    fot_pct = float(fot_row.pct) if fot_row else 25.0

    # ── Revenue aggregation by branch + cat1 ───────────────────────────────────
    rev_q = (
        select(
            SalesReportEntry.branch_code,
            SalesReportEntry.cat1,
            func.sum(SalesReportEntry.qty).label("qty"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.isnot(True))  # noqa: E712
    )
    if exclude_returns:
        rev_q = rev_q.where(SalesReportEntry.amount >= 0)
    rev_q = rev_q.group_by(SalesReportEntry.branch_code, SalesReportEntry.cat1)
    rev_rows = (await db.execute(rev_q)).all()

    # ── COGS: need qty per (branch, product_code) ──────────────────────────────
    cogs_q = (
        select(
            SalesReportEntry.branch_code,
            SalesReportEntry.code,
            func.sum(SalesReportEntry.qty).label("qty"),
        )
        .where(SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.isnot(True))  # noqa: E712
    )
    if exclude_returns:
        cogs_q = cogs_q.where(SalesReportEntry.amount >= 0)
    cogs_q = cogs_q.group_by(SalesReportEntry.branch_code, SalesReportEntry.code)
    cogs_rows = (await db.execute(cogs_q)).all()

    # ── Bonus losses ────────────────────────────────────────────────────────────
    bonus_q = (
        select(SalesReportEntry.branch_code, SalesReportEntry.code, func.sum(SalesReportEntry.qty).label("qty"))
        .where(SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.is_(True))  # noqa: E712
        .group_by(SalesReportEntry.branch_code, SalesReportEntry.code)
    )
    bonus_rows_res = (await db.execute(bonus_q)).all()

    # ── Manual expenses ─────────────────────────────────────────────────────────
    exp_r = await db.execute(
        select(PnlExpense).where(PnlExpense.period_date == pd).order_by(PnlExpense.sort_order)
    )
    expenses = exp_r.scalars().all()
    exp_map: dict[tuple, PnlExpense] = {(e.branch_code, e.category): e for e in expenses}

    # ── Targets ─────────────────────────────────────────────────────────────────
    tgt_r = await db.execute(select(PnlTarget).where(PnlTarget.period_date == pd))
    tgt_map: dict[str, PnlTarget] = {t.branch_code: t for t in tgt_r.scalars().all()}

    # ── Build branch set ─────────────────────────────────────────────────────────
    branch_set = {r.branch_code for r in rev_rows if r.branch_code and r.branch_code != "MAIN"}
    branch_codes = sorted(branch_set, key=lambda bc: -(
        sum(float(r.amount or 0) for r in rev_rows if r.branch_code == bc)
    ))

    # ── Category set ───────────────────────────────────────────────────────────
    cat_set: set[str] = set()
    for r in rev_rows:
        if r.cat1 and r.branch_code != "MAIN":
            cat_set.add(r.cat1)
    categories = sorted(cat_set, key=lambda c: -(
        sum(float(r.amount or 0) for r in rev_rows if r.cat1 == c)
    ))

    # ── Expense categories ──────────────────────────────────────────────────────
    custom_cats = {e.category for e in expenses if e.category not in dict(EXPENSE_CATEGORIES)}
    all_exp_cats = [c for c, _ in EXPENSE_CATEGORIES] + sorted(custom_cats)
    # also include any custom from DB not in defaults
    for e in expenses:
        if e.category not in all_exp_cats:
            all_exp_cats.append(e.category)

    def _build_branch(bc: str) -> dict:
        # Revenue by category
        rev_by_cat: dict[str, float] = {}
        rev_qty_by_cat: dict[str, float] = {}
        for r in rev_rows:
            if r.branch_code != bc:
                continue
            cat = r.cat1 or "Прочее"
            rev_by_cat[cat] = rev_by_cat.get(cat, 0) + float(r.amount or 0)
            rev_qty_by_cat[cat] = rev_qty_by_cat.get(cat, 0) + float(r.qty or 0)

        total_rev = sum(rev_by_cat.values())
        total_qty = sum(rev_qty_by_cat.values())

        # COGS of regular (non-bonus) products
        cogs_regular = sum(
            float(r.qty or 0) * cost_map.get(r.code or "", 0)
            for r in cogs_rows if r.branch_code == bc
        )

        # Bonus losses (cost of bonus/promo goods — no revenue, pure cost)
        bonus_loss = sum(
            float(r.qty or 0) * cost_map.get(r.code or "", 0)
            for r in bonus_rows_res if r.branch_code == bc
        )

        # Total COGS includes bonus losses (they are cost of sales, not opex)
        cogs_total = cogs_regular + bonus_loss

        gross = total_rev - cogs_total

        # Expenses — ФОТ and other manual entries only (no bonus losses here)
        exp_by_cat: dict[str, dict] = {}
        total_opex = 0.0
        for cat in all_exp_cats:
            e = exp_map.get((bc, cat)) or exp_map.get(("ALL", cat))
            actual = float(e.amount_actual or 0) if e else 0.0
            plan_v = float(e.amount_plan) if e and e.amount_plan is not None else None
            if cat == "ФОТ" and actual == 0 and total_rev > 0:
                actual = total_rev * fot_pct / 100
            exp_by_cat[cat] = {"actual": actual, "plan": plan_v}
            total_opex += actual

        ebitda = gross - total_opex
        ebitda_margin = ebitda / total_rev * 100 if total_rev else 0
        gross_margin = gross / total_rev * 100 if total_rev else 0

        tgt = tgt_map.get(bc)
        rev_plan = float(tgt.revenue_plan) if tgt and tgt.revenue_plan else None
        basket_plan = float(tgt.basket_plan) if tgt and tgt.basket_plan else None

        return {
            "branch_code": bc,
            "branch_name": BRANCH_NAMES.get(bc, bc),
            "revenue_by_cat": rev_by_cat,
            "revenue_total": total_rev,
            "revenue_qty": total_qty,
            "revenue_plan": rev_plan,
            "cogs": cogs_total,
            "cogs_regular": cogs_regular,
            "bonus_losses": bonus_loss,
            "gross_profit": gross,
            "gross_margin": gross_margin,
            "expenses": exp_by_cat,
            "total_opex": total_opex,
            "ebitda": ebitda,
            "ebitda_margin": ebitda_margin,
            "basket_actual": total_rev / total_qty if total_qty > 0 else 0,
            "basket_plan": basket_plan,
        }

    branch_data = [_build_branch(bc) for bc in branch_codes]

    # ── Totals ──────────────────────────────────────────────────────────────────
    def _total_rev_by_cat() -> dict[str, float]:
        r: dict[str, float] = {}
        for b in branch_data:
            for cat, amt in b["revenue_by_cat"].items():
                r[cat] = r.get(cat, 0) + amt
        return r

    total_rev = sum(b["revenue_total"] for b in branch_data)
    total_qty = sum(b["revenue_qty"] for b in branch_data)
    total_cogs = sum(b["cogs"] for b in branch_data)
    total_cogs_regular = sum(b["cogs_regular"] for b in branch_data)
    total_bonus = sum(b["bonus_losses"] for b in branch_data)
    total_gross = sum(b["gross_profit"] for b in branch_data)
    total_opex_sum = sum(b["total_opex"] for b in branch_data)
    total_ebitda = sum(b["ebitda"] for b in branch_data)
    total_rev_plan = sum(b["revenue_plan"] or 0 for b in branch_data) or None

    total_exp: dict[str, dict] = {}
    for cat in all_exp_cats:
        act = sum(b["expenses"].get(cat, {}).get("actual", 0) for b in branch_data)
        plans = [b["expenses"].get(cat, {}).get("plan") for b in branch_data if b["expenses"].get(cat, {}).get("plan") is not None]
        total_exp[cat] = {"actual": act, "plan": sum(plans) if plans else None}

    totals = {
        "branch_code": "TOTAL",
        "branch_name": "Итого",
        "revenue_by_cat": _total_rev_by_cat(),
        "revenue_total": total_rev,
        "revenue_qty": total_qty,
        "revenue_plan": total_rev_plan,
        "cogs": total_cogs,
        "cogs_regular": total_cogs_regular,
        "bonus_losses": total_bonus,
        "gross_profit": total_gross,
        "gross_margin": total_gross / total_rev * 100 if total_rev else 0,
        "expenses": total_exp,
        "total_opex": total_opex_sum,
        "ebitda": total_ebitda,
        "ebitda_margin": total_ebitda / total_rev * 100 if total_rev else 0,
        "basket_actual": total_rev / total_qty if total_qty > 0 else 0,
        "basket_plan": None,
    }

    return {
        "period_date": str(pd),
        "branches": [{"code": bc, "name": BRANCH_NAMES.get(bc, bc)} for bc in branch_codes],
        "categories": categories,
        "expense_categories": all_exp_cats,
        "branch_data": [totals] + branch_data,
        "fot_pct": fot_pct,
    }


@router.get("/months")
async def get_months(
    exclude_returns: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Summary per each available period date (for month-over-month comparison)."""
    dates_r = await db.execute(
        select(SalesReportEntry.period_date).distinct().order_by(SalesReportEntry.period_date)
    )
    all_dates = [d for d in dates_r.scalars().all()]

    costs_r = await db.execute(select(ProductCost))
    cost_map: dict[str, float] = {r.code: float(r.unit_cost or 0) for r in costs_r.scalars().all()}

    months = []
    for pd in all_dates:
        rev_q = select(func.sum(SalesReportEntry.amount)).where(
            SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.isnot(True)  # noqa
        )
        if exclude_returns:
            rev_q = rev_q.where(SalesReportEntry.amount >= 0)
        rev_total = float((await db.execute(rev_q)).scalar() or 0)

        cogs_q = select(SalesReportEntry.code, func.sum(SalesReportEntry.qty).label("qty")).where(
            SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.isnot(True)  # noqa
        )
        if exclude_returns:
            cogs_q = cogs_q.where(SalesReportEntry.amount >= 0)
        cogs_q = cogs_q.group_by(SalesReportEntry.code)
        cogs_rows = (await db.execute(cogs_q)).all()
        cogs_regular = sum(float(r.qty or 0) * cost_map.get(r.code or "", 0) for r in cogs_rows)

        bonus_q = select(SalesReportEntry.code, func.sum(SalesReportEntry.qty).label("qty")).where(
            SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus.is_(True)  # noqa
        ).group_by(SalesReportEntry.code)
        bonus_rows_r = (await db.execute(bonus_q)).all()
        bonus_loss = sum(float(r.qty or 0) * cost_map.get(r.code or "", 0) for r in bonus_rows_r)

        # Bonus losses are part of COGS, not opex
        cogs_total = cogs_regular + bonus_loss
        gross = rev_total - cogs_total

        opex = float((await db.execute(
            select(func.sum(PnlExpense.amount_actual)).where(PnlExpense.period_date == pd)
        )).scalar() or 0)

        ebitda = gross - opex

        tgt_r = await db.execute(
            select(func.sum(PnlTarget.revenue_plan)).where(PnlTarget.period_date == pd)
        )
        rev_plan = float(tgt_r.scalar() or 0) or None

        months.append({
            "period_date": str(pd),
            "label": str(pd),
            "revenue": rev_total,
            "revenue_plan": rev_plan,
            "cogs": cogs_total,
            "bonus_losses": bonus_loss,
            "gross_profit": gross,
            "gross_margin": gross / rev_total * 100 if rev_total else 0,
            "total_opex": opex,
            "ebitda": ebitda,
            "ebitda_margin": ebitda / rev_total * 100 if rev_total else 0,
        })

    return months


@router.post("/expense")
async def upsert_expense(
    period_date: str = Body(...),
    branch_code: str = Body(...),
    category: str = Body(...),
    amount_actual: float = Body(0),
    amount_plan: Optional[float] = Body(None),
    notes: Optional[str] = Body(None),
    sort_order: int = Body(100),
    db: AsyncSession = Depends(get_db),
):
    pd = date_type.fromisoformat(period_date)
    stmt = pg_insert(PnlExpense).values(
        period_date=pd, branch_code=branch_code, category=category,
        amount_actual=amount_actual, amount_plan=amount_plan,
        notes=notes, sort_order=sort_order,
    ).on_conflict_do_update(
        constraint="uq_pnl_expense",
        set_={"amount_actual": amount_actual, "amount_plan": amount_plan, "notes": notes},
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}


@router.post("/target")
async def upsert_target(
    period_date: str = Body(...),
    branch_code: str = Body(...),
    revenue_plan: Optional[float] = Body(None),
    basket_plan: Optional[float] = Body(None),
    sku_plan: Optional[int] = Body(None),
    db: AsyncSession = Depends(get_db),
):
    pd = date_type.fromisoformat(period_date)
    stmt = pg_insert(PnlTarget).values(
        period_date=pd, branch_code=branch_code,
        revenue_plan=revenue_plan, basket_plan=basket_plan, sku_plan=sku_plan,
    ).on_conflict_do_update(
        constraint="uq_pnl_target",
        set_={"revenue_plan": revenue_plan, "basket_plan": basket_plan, "sku_plan": sku_plan},
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}


@router.delete("/expense")
async def delete_expense_category(
    period_date: str = Query(...),
    category: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    pd = date_type.fromisoformat(period_date)
    await db.execute(
        delete(PnlExpense).where(PnlExpense.period_date == pd, PnlExpense.category == category)
    )
    await db.commit()
    return {"ok": True}
