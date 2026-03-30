"""
Alert engine — runs after every upload and regenerates alerts.
Rules:
  1. Debt overdue 91+ days → CRITICAL
  2. Stock days_supply > 180 → WARNING per SKU
  3. Branch sales drop >20% vs prior snapshot → WARNING  (TODO v1.1)
  4. Stock days_supply < 7 → INFO (near stockout)
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from models.models import Alert, AlertLevel, Debt, Stock, Branch, Nomenclature, StockFlag

logger = logging.getLogger(__name__)


async def run_alerts(db: AsyncSession) -> None:
    """Delete old auto-generated alerts and regenerate from current data."""
    await db.execute(delete(Alert).where(Alert.type != "manual"))

    new_alerts: list[Alert] = []

    # ── Rule 1: critical debt ──────────────────────────────────────────────
    result = await db.execute(
        select(Debt, Branch.name)
        .join(Branch, Debt.branch_id == Branch.id)
        .where(Debt.overdue_days >= 91)
    )
    for debt, branch_name in result.all():
        new_alerts.append(Alert(
            level=AlertLevel.critical,
            type="debt_overdue",
            message=f"Дебиторка {branch_name}: просрочка {debt.overdue_days}+ дней, долг {int(debt.debt_amount):,} тг",
            branch_id=debt.branch_id,
        ))

    # ── Rule 2: slow stock WARNING ─────────────────────────────────────────
    result = await db.execute(
        select(
            Nomenclature.name,
            func.max(Stock.days_supply).label("max_days"),
        )
        .join(Stock, Stock.nomenclature_id == Nomenclature.id)
        .where(Stock.flag == StockFlag.critical)
        .group_by(Nomenclature.id, Nomenclature.name)
        .order_by(func.max(Stock.days_supply).desc())
        .limit(10)
    )
    for nom_name, max_days in result.all():
        display = "∞" if max_days >= 9999 else str(max_days)
        new_alerts.append(Alert(
            level=AlertLevel.warning,
            type="slow_stock",
            message=f"{nom_name}: дней запаса {display} — рекомендован стоп закупок",
        ))

    # ── Rule 4: near stockout INFO ─────────────────────────────────────────
    result = await db.execute(
        select(Nomenclature.name, Branch.name, Stock.days_supply)
        .join(Stock, Stock.nomenclature_id == Nomenclature.id)
        .join(Branch, Stock.branch_id == Branch.id)
        .where(Stock.days_supply < 7, Stock.days_supply > 0)
        .limit(10)
    )
    for nom_name, branch_name, days in result.all():
        new_alerts.append(Alert(
            level=AlertLevel.info,
            type="low_stock",
            message=f"{nom_name} / {branch_name}: осталось {days} дн — скоро дефицит",
        ))

    for alert in new_alerts:
        db.add(alert)

    await db.commit()
    logger.info("Alert engine: generated %d alerts", len(new_alerts))
