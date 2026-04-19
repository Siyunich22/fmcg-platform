"""P&L (Profit & Loss) router — management accounting per branch per period."""
from datetime import date as date_type
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db import get_db
from models.models import (
    PnlExpense, PnlTarget,
    SalesReportEntry, ProductCost, FotSetting,
)

router = APIRouter()

BRANCH_NAMES = {
    "BEREКЕ":    "Береке",
    "AKTAU":     "Актау",
    "AKTOBE":    "Актобе",
    "ALMATY":    "Алматы",
    "ASTANA":    "Астана",
    "ATYRAU":    "Атырау",
    "KARAGANDA": "Караганда",
    "KOKSHETAU": "Кокшетау",
    "SEMEY":     "Семей",
    "SHYMKENT":  "Шымкент",
}

# Default expense categories with sort order
DEFAULT_CATEGORIES = [
    ("ФОТ",           10),
    ("Аренда",        20),
    ("Логистика",     30),
    ("Маркетинг",     40),
    ("Командировки",  50),
    ("Прочие расходы", 90),
]


async def _resolve_date(period_date: str | None, db: AsyncSession) -> date_type | None:
    if period_date:
        return date_type.fromisoformat(period_date)
    result = await db.execute(
        select(SalesReportEntry.period_date)
        .order_by(SalesReportEntry.period_date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/dates")
async def get_dates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesReportEntry.period_date).distinct().order_by(SalesReportEntry.period_date.desc())
    )
    return [str(d) for d in result.scalars().all()]


@router.get("/summary")
async def get_summary(
    period_date: str | None = Query(None),
    exclude_returns: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Full P&L summary: revenue, COGS, gross profit, expenses, operating profit per branch."""
    pd = await _resolve_date(period_date, db)
    if not pd:
        return {"period_date": None, "branches": [], "rows": [], "targets": []}

    # ── Revenue by branch (non-bonus) ──────────────────────────────────────────
    rev_q = (
        select(
            SalesReportEntry.branch_code,
            func.sum(SalesReportEntry.qty).label("qty"),
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(SalesReportEntry.period_date == pd, SalesReportEntry.is_bonus == False)  # noqa
    )
    if exclude_returns:
        rev_q = rev_q.where(SalesReportEntry.amount >= 0)
    rev_q = rev_q.group_by(SalesReportEntry.branch_code)
    rev_result = await db.execute(rev_q)
    revenue: dict[str, dict] = {
        r.branch_code: {"qty": float(r.qty or 0), "amount": float(r.amount or 0)}
        for r in rev_result.all()
        if r.branch_code != "MAIN"
    }

    # ── Returns (negative rows) ─────────────────────────────────────────────────
    ret_q = (
        select(
            SalesReportEntry.branch_code,
            func.sum(SalesReportEntry.amount).label("amount"),
        )
        .where(
            SalesReportEntry.period_date == pd,
            SalesReportEntry.is_bonus == False,  # noqa
            SalesReportEntry.amount < 0,
        )
        .group_by(SalesReportEntry.branch_code)
    )
    ret_result = await db.execute(ret_q)
    returns: dict[str, float] = {
        r.branch_code: float(r.amount or 0)
        for r in ret_result.all()
        if r.branch_code != "MAIN"
    }

    # ── COGS by branch ──────────────────────────────────────────────────────────
    # Fetch all non-bonus rows to compute qty × unit_cost per branch
    cogs_q = select(
        SalesReportEntry.branch_code,
        SalesReportEntry.code,
        SalesReportEntry.name,
        SalesReportEntry.qty,
    ).where(
        SalesReportEntry.period_date == pd,
        SalesReportEntry.is_bonus == False,  # noqa
    )
    if exclude_returns:
        cogs_q = cogs_q.where(SalesReportEntry.amount >= 0)
    cogs_rows = (await db.execute(cogs_q)).all()

    costs_result = await db.execute(select(ProductCost))
    cost_map: dict[str, float] = {r.code: float(r.unit_cost or 0) for r in costs_result.scalars().all()}

    cogs: dict[str, float] = {}
    for r in cogs_rows:
        if r.branch_code == "MAIN":
            continue
        uc = cost_map.get(r.code or "", 0)
        cogs[r.branch_code] = cogs.get(r.branch_code, 0) + float(r.qty or 0) * uc

    # ── Bonus losses by branch ──────────────────────────────────────────────────
    bonus_q = select(
        SalesReportEntry.branch_code,
        SalesReportEntry.code,
        SalesReportEntry.qty,
    ).where(
        SalesReportEntry.period_date == pd,
        SalesReportEntry.is_bonus == True,  # noqa
    )
    bonus_rows_res = (await db.execute(bonus_q)).all()
    bonus_losses: dict[str, float] = {}
    for r in bonus_rows_res:
        if r.branch_code == "MAIN":
            continue
        uc = cost_map.get(r.code or "", 0)
        bonus_losses[r.branch_code] = bonus_losses.get(r.branch_code, 0) + float(r.qty or 0) * uc

    # ── Manual expenses ─────────────────────────────────────────────────────────
    exp_result = await db.execute(
        select(PnlExpense)
        .where(PnlExpense.period_date == pd)
        .order_by(PnlExpense.sort_order, PnlExpense.category)
    )
    expenses = exp_result.scalars().all()

    # ── Revenue targets ─────────────────────────────────────────────────────────
    tgt_result = await db.execute(
        select(PnlTarget).where(PnlTarget.period_date == pd)
    )
    targets = tgt_result.scalars().all()

    # ── FoT setting ─────────────────────────────────────────────────────────────
    fot_result = await db.execute(select(FotSetting).where(FotSetting.id == 1))
    fot_row = fot_result.scalar_one_or_none()
    fot_pct = float(fot_row.pct) if fot_row else 25.0

    # ── Build branch list ───────────────────────────────────────────────────────
    all_branch_codes = sorted(
        {bc for bc in revenue if bc != "MAIN"} |
        {bc for bc in cogs if bc != "MAIN"} |
        {e.branch_code for e in expenses if e.branch_code != "ALL"}
    )

    branches = [
        {"code": bc, "name": BRANCH_NAMES.get(bc, bc)}
        for bc in all_branch_codes
    ]

    # ── Build expense categories list ───────────────────────────────────────────
    # Merge defaults + any custom categories from DB
    cat_set: dict[str, int] = {c: s for c, s in DEFAULT_CATEGORIES}
    for e in expenses:
        if e.category not in cat_set:
            cat_set[e.category] = e.sort_order
    categories = sorted(cat_set.keys(), key=lambda c: cat_set[c])

    # Build expense lookup: (branch_code, category) -> PnlExpense
    exp_map: dict[tuple, PnlExpense] = {(e.branch_code, e.category): e for e in expenses}

    # ── Build targets lookup ────────────────────────────────────────────────────
    tgt_map: dict[str, PnlTarget] = {t.branch_code: t for t in targets}

    def _branch_summary(bc: str) -> dict:
        rev_amt = revenue.get(bc, {}).get("amount", 0)
        rev_qty = revenue.get(bc, {}).get("qty", 0)
        ret_amt = returns.get(bc, 0)
        net_rev = rev_amt  # net = gross (returns already included in amount)
        cogs_amt = cogs.get(bc, 0)
        bonus_loss = bonus_losses.get(bc, 0)
        gross = net_rev - cogs_amt

        exp_by_cat: dict[str, dict] = {}
        total_opex = 0.0
        for cat in categories:
            entry = exp_map.get((bc, cat)) or exp_map.get(("ALL", cat))
            actual = float(entry.amount_actual or 0) if entry else 0.0
            plan = float(entry.amount_plan) if entry and entry.amount_plan is not None else None
            # Auto-compute ФОТ from fot_pct if not manually set
            if cat == "ФОТ" and actual == 0 and net_rev > 0:
                actual = net_rev * fot_pct / 100
            exp_by_cat[cat] = {"actual": actual, "plan": plan}
            total_opex += actual

        total_opex += bonus_loss
        ebit = gross - total_opex
        ebit_margin = (ebit / net_rev * 100) if net_rev != 0 else 0

        tgt = tgt_map.get(bc)
        revenue_plan = float(tgt.revenue_plan) if tgt and tgt.revenue_plan else None
        basket_plan = float(tgt.basket_plan) if tgt and tgt.basket_plan else None
        sku_plan = tgt.sku_plan if tgt else None

        # Корзина = net revenue / unique product count
        basket_actual = net_rev / rev_qty if rev_qty > 0 else 0

        return {
            "branch_code": bc,
            "branch_name": BRANCH_NAMES.get(bc, bc),
            "revenue_actual": net_rev,
            "revenue_qty": rev_qty,
            "revenue_plan": revenue_plan,
            "returns": ret_amt,
            "cogs": cogs_amt,
            "gross_profit": gross,
            "gross_margin": (gross / net_rev * 100) if net_rev != 0 else 0,
            "bonus_losses": bonus_loss,
            "expenses": exp_by_cat,
            "total_opex": total_opex,
            "ebit": ebit,
            "ebit_margin": ebit_margin,
            "basket_actual": basket_actual,
            "basket_plan": basket_plan,
            "sku_plan": sku_plan,
            "fot_pct": fot_pct,
        }

    branch_data = [_branch_summary(bc) for bc in all_branch_codes]

    # ── Totals row ──────────────────────────────────────────────────────────────
    def _sum_field(field: str) -> float:
        return sum(b[field] for b in branch_data)

    total_rev = _sum_field("revenue_actual")
    total_cogs = _sum_field("cogs")
    total_gross = _sum_field("gross_profit")
    total_opex = _sum_field("total_opex")
    total_ebit = _sum_field("ebit")
    total_rev_plan = sum(b["revenue_plan"] for b in branch_data if b["revenue_plan"])

    total_expenses: dict[str, dict] = {}
    for cat in categories:
        act = sum(b["expenses"].get(cat, {}).get("actual", 0) for b in branch_data)
        plans = [b["expenses"].get(cat, {}).get("plan") for b in branch_data if b["expenses"].get(cat, {}).get("plan") is not None]
        total_expenses[cat] = {"actual": act, "plan": sum(plans) if plans else None}

    totals = {
        "branch_code": "TOTAL",
        "branch_name": "Итого",
        "revenue_actual": total_rev,
        "revenue_plan": total_rev_plan or None,
        "returns": sum(returns.values()),
        "cogs": total_cogs,
        "gross_profit": total_gross,
        "gross_margin": (total_gross / total_rev * 100) if total_rev != 0 else 0,
        "bonus_losses": _sum_field("bonus_losses"),
        "expenses": total_expenses,
        "total_opex": total_opex,
        "ebit": total_ebit,
        "ebit_margin": (total_ebit / total_rev * 100) if total_rev != 0 else 0,
        "basket_actual": total_rev / _sum_field("revenue_qty") if _sum_field("revenue_qty") > 0 else 0,
        "basket_plan": None,
        "sku_plan": None,
        "fot_pct": fot_pct,
    }

    return {
        "period_date": str(pd),
        "branches": branches,
        "categories": categories,
        "branch_data": [totals] + branch_data,
        "fot_pct": fot_pct,
    }


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
        delete(PnlExpense).where(
            PnlExpense.period_date == pd,
            PnlExpense.category == category,
        )
    )
    await db.commit()
    return {"ok": True}
