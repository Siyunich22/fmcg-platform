from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct, cast
from sqlalchemy.types import Date
from typing import Optional
from datetime import date as date_type

from db import get_db
from models.models import Debt, Branch, OsvEntry

router = APIRouter()


# ── Legacy debts (branch-level) ──────────────────────────────────────────────

@router.get("/")
async def list_debts(
    branch_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Debt, Branch.name.label("branch_name"))
        .join(Branch, Debt.branch_id == Branch.id)
    )
    if branch_id:
        q = q.where(Debt.branch_id == branch_id)
    if status:
        q = q.where(Debt.status == status)
    q = q.order_by(Debt.period_date.desc(), Branch.name).limit(limit).offset(offset)
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "id": str(r.Debt.id),
            "branch_id": str(r.Debt.branch_id),
            "branch_name": r.branch_name,
            "period_date": str(r.Debt.period_date),
            "debt_amount": float(r.Debt.debt_amount),
            "payment_amount": float(r.Debt.payment_amount),
            "payment_to_head": float(r.Debt.payment_to_head or 0),
            "returns_amount": float(r.Debt.returns_amount or 0),
            "overdue_days": r.Debt.overdue_days,
            "status": r.Debt.status,
        }
        for r in rows
    ]


@router.get("/summary")
async def debts_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.sum(Debt.debt_amount).label("total_debt"),
            func.sum(Debt.payment_amount).label("total_payment"),
            func.sum(Debt.payment_to_head).label("total_payment_to_head"),
            func.sum(Debt.returns_amount).label("total_returns"),
        )
    )
    row = result.one()
    return {
        "total_debt": float(row.total_debt or 0),
        "total_payment": float(row.total_payment or 0),
        "total_payment_to_head": float(row.total_payment_to_head or 0),
        "total_returns": float(row.total_returns or 0),
    }


# ── OSV analysis ─────────────────────────────────────────────────────────────

# Branch name normalization (stored value → display value)
BRANCH_RENAMES: dict[str, str] = {
    "ОС": "Основной склад",
}
# Reverse map: display value → stored value (for filtering)
BRANCH_RENAMES_REV: dict[str, str] = {v: k for k, v in BRANCH_RENAMES.items()}

# Counterparties excluded from main totals (shown separately)
EXCLUDED_COUNTERPARTIES = {"ПРОИЗВОДСТВО Астана"}


def rename_branch(name: str) -> str:
    return BRANCH_RENAMES.get(name, name)


def unrename_branch(display: str) -> str:
    """Convert display name back to stored DB value."""
    return BRANCH_RENAMES_REV.get(display, display)


@router.get("/osv/dates")
async def osv_dates(db: AsyncSession = Depends(get_db)):
    """Returns distinct period_dates available in OSV data."""
    result = await db.execute(
        select(distinct(OsvEntry.period_date)).order_by(OsvEntry.period_date.desc())
    )
    return [str(r) for r in result.scalars()]


@router.get("/osv/branches")
async def osv_branches(
    period_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Returns distinct branch names in OSV data (with renames applied)."""
    q = select(distinct(OsvEntry.branch_name)).order_by(OsvEntry.branch_name)
    if period_date:
        q = q.where(OsvEntry.period_date == date_type.fromisoformat(period_date))
    result = await db.execute(q)
    return [rename_branch(r) for r in result.scalars()]


@router.get("/osv/analysis")
async def osv_analysis(
    period_date: Optional[str] = Query(None),
    branch_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    only_positive: bool = Query(False, description="Show only counterparties with net > 0"),
    limit: int = Query(500, le=5000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-counterparty netting:
      net = 1210.saldo_end_dt - 3310.saldo_end_kt - 1710.saldo_end_dt
    """
    # Use latest period_date if not specified
    if not period_date:
        pd_result = await db.execute(
            select(OsvEntry.period_date).order_by(OsvEntry.period_date.desc()).limit(1)
        )
        pd_row = pd_result.scalar_one_or_none()
        if pd_row is None:
            return {"rows": [], "totals": {}, "period_date": None}
        period_date = str(pd_row)

    pd = date_type.fromisoformat(period_date)

    # Translate display branch name back to stored DB value
    db_branch_name = unrename_branch(branch_name) if branch_name else None

    def base_q(account: str):
        q = select(OsvEntry).where(
            OsvEntry.period_date == pd,
            OsvEntry.account == account,
        )
        if db_branch_name:
            q = q.where(OsvEntry.branch_name == db_branch_name)
        return q

    r1210 = (await db.execute(base_q("1210"))).scalars().all()
    r3310 = (await db.execute(base_q("3310"))).scalars().all()
    r1710 = (await db.execute(base_q("1710"))).scalars().all()

    def index(rows):
        m: dict = {}
        for r in rows:
            key = (r.branch_name, r.counterparty)
            if key not in m:
                m[key] = {"saldo_end_dt": float(r.saldo_end_dt or 0),
                           "saldo_end_kt": float(r.saldo_end_kt or 0)}
            else:
                m[key]["saldo_end_dt"] += float(r.saldo_end_dt or 0)
                m[key]["saldo_end_kt"] += float(r.saldo_end_kt or 0)
        return m

    idx1210 = index(r1210)
    idx3310 = index(r3310)
    idx1710 = index(r1710)

    all_keys = set(idx1210) | set(idx3310) | set(idx1710)

    result_rows = []
    for key in all_keys:
        branch, counterparty = key
        amt_1210 = idx1210[key]["saldo_end_dt"] if key in idx1210 else 0.0
        amt_3310 = idx3310[key]["saldo_end_kt"] if key in idx3310 else 0.0
        amt_1710 = idx1710[key]["saldo_end_dt"] if key in idx1710 else 0.0
        net = amt_1210 - amt_3310 - amt_1710

        if only_positive and net <= 0:
            continue

        if search:
            q_low = search.lower()
            if q_low not in counterparty.lower() and q_low not in branch.lower():
                continue

        result_rows.append({
            "branch_name": branch,
            "counterparty": counterparty,
            "a1210": amt_1210,
            "a3310": amt_3310,
            "a1710": amt_1710,
            "net": net,
        })

    # Apply branch renames
    for row in result_rows:
        row["branch_name"] = rename_branch(row["branch_name"])

    result_rows.sort(key=lambda r: abs(r["net"]), reverse=True)

    # Separate excluded counterparties (e.g. ПРОИЗВОДСТВО Астана)
    main_rows = [r for r in result_rows if r["counterparty"] not in EXCLUDED_COUNTERPARTIES]
    excluded_rows = [r for r in result_rows if r["counterparty"] in EXCLUDED_COUNTERPARTIES]

    totals = {
        "total_1210": sum(r["a1210"] for r in main_rows),
        "total_3310": sum(r["a3310"] for r in main_rows),
        "total_1710": sum(r["a1710"] for r in main_rows),
        "total_net": sum(r["net"] for r in main_rows),
        "count": len(main_rows),
    }

    return {
        "period_date": period_date,
        "totals": totals,
        "rows": main_rows[offset: offset + limit],
        "excluded": excluded_rows,
    }


def _netting_from_raw(rows_raw, only_positive: bool = False):
    """
    rows_raw: list of OsvEntry ORM objects.
    Returns dict: (date_str, branch, counterparty) -> {a1210, a3310, a1710, net}
    """
    # index by (period_date, branch_name, counterparty, account)
    idx: dict = {}
    for r in rows_raw:
        key = (str(r.period_date), r.branch_name, r.counterparty, r.account)
        if key not in idx:
            idx[key] = {"dt": 0.0, "kt": 0.0}
        idx[key]["dt"] += float(r.saldo_end_dt or 0)
        idx[key]["kt"] += float(r.saldo_end_kt or 0)

    # netting per (date, branch, counterparty)
    nets: dict = {}
    for (pd_str, branch, cp, acct), vals in idx.items():
        k = (pd_str, branch, cp)
        if k not in nets:
            nets[k] = {"a1210": 0.0, "a3310": 0.0, "a1710": 0.0}
        if acct == "1210":
            nets[k]["a1210"] += vals["dt"]
        elif acct == "3310":
            nets[k]["a3310"] += vals["kt"]
        elif acct == "1710":
            nets[k]["a1710"] += vals["dt"]

    result = []
    for (pd_str, branch, cp), v in nets.items():
        if cp in EXCLUDED_COUNTERPARTIES:
            continue
        net = v["a1210"] - v["a3310"] - v["a1710"]
        if only_positive and net <= 0:
            continue
        result.append({
            "period_date": pd_str,
            "branch_name": rename_branch(branch),
            "counterparty": cp,
            "a1210": v["a1210"],
            "a3310": v["a3310"],
            "a1710": v["a1710"],
            "net": net,
        })
    return result


@router.get("/osv/by-date")
async def osv_by_date(
    only_positive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Total net receivables per period_date (for dashboard chart)."""
    rows_raw = (await db.execute(select(OsvEntry))).scalars().all()
    rows = _netting_from_raw(rows_raw, only_positive=only_positive)

    # aggregate by date
    by_date: dict = {}
    for r in rows:
        pd = r["period_date"]
        if pd not in by_date:
            by_date[pd] = {"total_net": 0.0, "total_1210": 0.0,
                           "total_3310": 0.0, "total_1710": 0.0, "count": 0}
        by_date[pd]["total_net"] += r["net"]
        by_date[pd]["total_1210"] += r["a1210"]
        by_date[pd]["total_3310"] += r["a3310"]
        by_date[pd]["total_1710"] += r["a1710"]
        by_date[pd]["count"] += 1

    return sorted(
        [{"period_date": pd, **vals} for pd, vals in by_date.items()],
        key=lambda x: x["period_date"],
        reverse=True,
    )


@router.get("/osv/by-branch")
async def osv_by_branch(
    period_date: Optional[str] = Query(None),
    only_positive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Net receivables per branch for a given date (for dashboard breakdown)."""
    if not period_date:
        pd_result = await db.execute(
            select(OsvEntry.period_date).order_by(OsvEntry.period_date.desc()).limit(1)
        )
        pd_row = pd_result.scalar_one_or_none()
        if pd_row is None:
            return []
        period_date = str(pd_row)

    pd = date_type.fromisoformat(period_date)
    rows_raw = (await db.execute(select(OsvEntry).where(OsvEntry.period_date == pd))).scalars().all()
    rows = _netting_from_raw(rows_raw, only_positive=only_positive)

    by_branch: dict = {}
    for r in rows:
        b = r["branch_name"]
        if b not in by_branch:
            by_branch[b] = {"total_net": 0.0, "total_1210": 0.0,
                            "total_3310": 0.0, "total_1710": 0.0, "count": 0}
        by_branch[b]["total_net"] += r["net"]
        by_branch[b]["total_1210"] += r["a1210"]
        by_branch[b]["total_3310"] += r["a3310"]
        by_branch[b]["total_1710"] += r["a1710"]
        by_branch[b]["count"] += 1

    items = sorted(
        [{"branch_name": b, **vals} for b, vals in by_branch.items()],
        key=lambda x: x["total_net"],
        reverse=True,
    )

    total_net_all = sum(abs(x["total_net"]) for x in items) or 1
    for x in items:
        x["share"] = round(abs(x["total_net"]) / total_net_all * 100, 1)

    return items
