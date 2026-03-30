from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from db import get_db
from models.models import Sale, Stock, Debt, Order, Alert, OrderStatus, StockFlag, Branch, Nomenclature

router = APIRouter()


@router.get("/kpis")
async def get_kpis(db: AsyncSession = Depends(get_db)):
    # Revenue = sum of branch-level ИТОГО Sale records only
    rev = await db.execute(
        select(func.sum(Sale.amount))
        .join(Nomenclature, Sale.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c == "__BRANCH_TOTAL__")
    )
    revenue = float(rev.scalar() or 0)

    stk = await db.execute(select(func.sum(Stock.amount)))
    stock_total = float(stk.scalar() or 0)

    orders = await db.execute(
        select(func.count(Order.id)).where(
            Order.status.in_([OrderStatus.pending, OrderStatus.confirmed])
        )
    )
    active_orders = int(orders.scalar() or 0)

    crit_debt = await db.execute(
        select(func.sum(Debt.debt_amount)).where(Debt.status == "critical")
    )
    critical_debt = float(crit_debt.scalar() or 0)

    total_debt = await db.execute(select(func.sum(Debt.debt_amount)))
    total_debt_val = float(total_debt.scalar() or 0)

    total_payment = await db.execute(select(func.sum(Debt.payment_amount)))
    total_payment_val = float(total_payment.scalar() or 0)

    # Period label from latest sale
    latest = await db.execute(select(func.max(Sale.period_date)))
    latest_date = latest.scalar()
    period_label = latest_date.strftime("%B %Y").capitalize() if latest_date else "—"

    return {
        "revenue_period": revenue,
        "revenue_period_label": period_label,
        "stock_total": stock_total,
        "active_orders": active_orders,
        "critical_debt": critical_debt,
        "total_debt": total_debt_val,
        "total_payment": total_payment_val,
    }


@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Alert, Branch.name.label("branch_name"))
        .outerjoin(Branch, Alert.branch_id == Branch.id)
        .where(Alert.resolved == False)  # noqa: E712
        .order_by(Alert.created_at.desc())
        .limit(20)
    )
    rows = result.all()
    return [
        {
            "id": str(r.Alert.id),
            "level": r.Alert.level,
            "type": r.Alert.type,
            "message": r.Alert.message,
            "branch_id": str(r.Alert.branch_id) if r.Alert.branch_id else None,
            "branch_name": r.branch_name,
            "created_at": r.Alert.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/sales-by-branch")
async def get_sales_by_branch(db: AsyncSession = Depends(get_db)):
    # Use Sale records (branch-level ИТОГО values saved during stock upload)
    result = await db.execute(
        select(Branch.id, Branch.name, func.sum(Sale.amount).label("amount"))
        .join(Sale, Sale.branch_id == Branch.id)
        .join(Nomenclature, Sale.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c == "__BRANCH_TOTAL__")
        .group_by(Branch.id, Branch.name)
        .order_by(func.sum(Sale.amount).desc())
    )
    rows = result.all()
    return [{"branch_id": str(r.id), "branch_name": r.name, "amount": float(r.amount)} for r in rows]


@router.get("/sales-by-category")
async def get_sales_by_category(db: AsyncSession = Depends(get_db)):
    # Use Stock.sales_sum per category (per-product sales from stock file)
    result = await db.execute(
        select(Nomenclature.category, func.sum(Stock.sales_sum).label("amount"))
        .select_from(Stock)
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .group_by(Nomenclature.category)
        .order_by(func.sum(Stock.sales_sum).desc())
    )
    rows = result.all()
    return [{"category": r.category, "amount": float(r.amount)} for r in rows]


@router.get("/branches-overview")
async def branches_overview(db: AsyncSession = Depends(get_db)):
    """Per-branch summary: sales, debt, payment, stock."""
    # Sales per branch — use branch-level ИТОГО Sale records only
    sales_q = await db.execute(
        select(Branch.id, Branch.name, func.sum(Sale.amount).label("sales_total"))
        .outerjoin(
            Sale,
            (Sale.branch_id == Branch.id) &
            (Sale.nomenclature_id == select(Nomenclature.id)
             .where(Nomenclature.code_1c == "__BRANCH_TOTAL__").scalar_subquery())
        )
        .where(Branch.active == True)  # noqa: E712
        .group_by(Branch.id, Branch.name)
    )
    sales_map = {str(r.id): {"branch_name": r.name, "sales_total": float(r.sales_total or 0)} for r in sales_q.all()}

    # Debt per branch
    debt_q = await db.execute(
        select(
            Debt.branch_id,
            func.sum(Debt.debt_amount).label("debt_amount"),
            func.sum(Debt.payment_amount).label("payment_amount"),
            func.sum(Debt.payment_to_head).label("payment_to_head"),
            func.sum(Debt.returns_amount).label("returns_amount"),
            func.max(Debt.overdue_days).label("overdue_days"),
        )
        .group_by(Debt.branch_id)
    )
    debt_map: dict = {}
    for r in debt_q.all():
        bid = str(r.branch_id)
        overdue = int(r.overdue_days or 0)
        if overdue <= 30:
            st = "ok"
        elif overdue <= 60:
            st = "warning"
        elif overdue <= 90:
            st = "risk"
        else:
            st = "critical"
        debt_map[bid] = {
            "debt_amount": float(r.debt_amount or 0),
            "payment_amount": float(r.payment_amount or 0),
            "payment_to_head": float(r.payment_to_head or 0),
            "returns_amount": float(r.returns_amount or 0),
            "overdue_days": overdue,
            "debt_status": st,
        }

    # Stock per branch
    stock_q = await db.execute(
        select(
            Stock.branch_id,
            func.sum(Stock.amount).label("stock_amount"),
            func.sum(Stock.qty).label("stock_qty"),
        )
        .group_by(Stock.branch_id)
    )
    stock_map = {
        str(r.branch_id): {
            "stock_amount": float(r.stock_amount or 0),
            "stock_qty": float(r.stock_qty or 0),
        }
        for r in stock_q.all()
    }

    result = []
    for branch_id, sales_data in sales_map.items():
        debt = debt_map.get(branch_id, {
            "debt_amount": 0, "payment_amount": 0,
            "payment_to_head": 0, "returns_amount": 0,
            "overdue_days": 0, "debt_status": "ok",
        })
        stock = stock_map.get(branch_id, {"stock_amount": 0, "stock_qty": 0})
        result.append({
            "branch_id": branch_id,
            "branch_name": sales_data["branch_name"],
            "sales_total": sales_data["sales_total"],
            **debt,
            **stock,
        })

    result.sort(key=lambda x: x["sales_total"], reverse=True)
    return result


@router.get("/top-nomenclature")
async def top_nomenclature(
    branch_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(30, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Top SKUs by sales, with optional branch/category filter. Includes stock info."""
    # Use Stock.sales_sum for per-product sales (exact per-branch product sales from file)
    sq = (
        select(
            Nomenclature.id,
            Nomenclature.name,
            Nomenclature.category,
            func.sum(Stock.sales_sum).label("sales_total"),
            func.sum(Stock.qty).label("stock_qty"),
            func.sum(Stock.amount).label("stock_amount"),
            func.max(Stock.days_supply).label("days_supply"),
            Stock.flag,
        )
        .select_from(Stock)
        .join(Nomenclature, Stock.nomenclature_id == Nomenclature.id)
        .where(Nomenclature.code_1c != "__BRANCH_TOTAL__")
        .group_by(Nomenclature.id, Nomenclature.name, Nomenclature.category, Stock.flag)
    )
    if branch_id:
        sq = sq.where(Stock.branch_id == branch_id)
    if category:
        sq = sq.where(Nomenclature.category == category)
    sq = sq.order_by(func.sum(Stock.sales_sum).desc()).limit(limit)
    rows = (await db.execute(sq)).all()

    return [
        {
            "nomenclature_id": str(r.id),
            "name": r.name,
            "category": r.category,
            "sales_total": float(r.sales_total or 0),
            "stock_qty": float(r.stock_qty or 0),
            "stock_amount": float(r.stock_amount or 0),
            "days_supply": int(r.days_supply or 0),
            "stock_flag": r.flag,
        }
        for r in rows
    ]


@router.get("/top-slow-stock")
async def get_top_slow_stock(limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Nomenclature.id,
            Nomenclature.name,
            Nomenclature.category,
            func.sum(Stock.qty).label("stock_qty"),
            func.max(Stock.days_supply).label("days_supply"),
            Stock.flag,
        )
        .join(Stock, Stock.nomenclature_id == Nomenclature.id)
        .where(Stock.flag.in_([StockFlag.warning, StockFlag.critical]))
        .group_by(Nomenclature.id, Nomenclature.name, Nomenclature.category, Stock.flag)
        .order_by(func.max(Stock.days_supply).desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "nomenclature_id": str(r.id),
            "name": r.name,
            "category": r.category,
            "stock_qty": float(r.stock_qty),
            "days_supply": int(r.days_supply),
            "flag": r.flag,
        }
        for r in rows
    ]
