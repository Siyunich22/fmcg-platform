"""
Parser for 1C stock & sales by branch export file (new format).

File structure (0-indexed rows):
  row[0]  = headers: col[0]="Код", col[1]="Номенклатура",
            then branch names at base cols 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46
  row[1]  = sub-headers per branch (4 cols each):
            +0: Количество реализации (с возвратами)   = sales_qty
            +1: Сумма реализации (с возвратами)         = sales_sum
            +2: Остаток на конец количество Из ОСВ      = stock_qty
            +3: сумма на конец по себестоимости (По ОСВ)= stock_sum
  row[2+] = data rows

Branch column mapping (base_col → code_1c):
  2  = БЕРЕКЕ     (ИП Береке)
  6  = MAIN       (Основной склад)
  10 = AKTAU      (Филиал Актау)
  14 = AKTOBE     (Филиал Актобе)
  18 = ALMATY     (Филиал Алматы)
  22 = ASTANA     (Филиал Астана)
  26 = ATYRAU     (Филиал Атырау)
  30 = KARAGANDA  (Филиал Карагда)
  34 = KOKSHETAU  (Филиал Кокшетау)
  38 = KOSTANAY   (Филиал Костанай)
  42 = SEMEY      (Филиал Семей)
  46 = SHYMKENT   (Филиал Шымкент)
  50 = Итого      (skip — aggregate only)
"""

import logging
import re
from datetime import date
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# base_col → branch code_1c (each block = 4 cols)
BRANCH_BLOCKS: list[tuple[int, str]] = [
    (2,  "БЕРЕКЕ"),
    (6,  "MAIN"),
    (10, "AKTAU"),
    (14, "AKTOBE"),
    (18, "ALMATY"),
    (22, "ASTANA"),
    (26, "ATYRAU"),
    (30, "KARAGANDA"),
    (34, "KOKSHETAU"),
    (38, "KOSTANAY"),
    (42, "SEMEY"),
    (46, "SHYMKENT"),
]

# Branches that are distribution centers — sales may be negative (outbound).
# Include their stock, but use only positive sales values.
WAREHOUSE_BRANCHES = {"MAIN"}


def _flag(days: int) -> str:
    if days <= 90:
        return "ok"
    if days <= 180:
        return "warning"
    return "critical"


def _safe_float(val) -> float:
    try:
        if pd.isna(val):
            return 0.0
        return float(str(val).replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _extract_date_from_filename(filename: str) -> date | None:
    """Extract date from filename like 'остатки и продажи 26.03.xlsx' or '26.03.2026.xlsx'."""
    m = re.search(r'(\d{1,2})[.\-](\d{1,2})(?:[.\-](\d{2,4}))?', filename)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    if not (1 <= day <= 31 and 1 <= month <= 12):
        return None
    year = int(m.group(3)) if m.group(3) else date.today().year
    if year < 100:
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _find_товары_row(df) -> int | None:
    """Find the ТОВАРЫ aggregate row (code '00000000002') for branch sales totals."""
    for i in range(2, min(200, len(df))):
        code = str(df.iloc[i, 0]).strip()
        if code == "00000000002":
            return i
    return None


def _extract_branch_totals(df, row_idx: int) -> dict[str, dict]:
    """Read branch sales totals from the ТОВАРЫ row."""
    totals: dict[str, dict] = {}
    try:
        row = df.iloc[row_idx]
        for base_col, branch_code in BRANCH_BLOCKS:
            if branch_code in WAREHOUSE_BRANCHES:
                continue
            sales_sum_col = base_col + 1
            if sales_sum_col >= len(row):
                continue
            sales_total = _safe_float(row.iloc[sales_sum_col])
            if sales_total > 0:
                totals[branch_code] = {"sales_total": sales_total}
    except Exception:
        pass
    return totals


def _is_product_row(code: str, name: str) -> bool:
    """Return True if this row is a candidate product row (passes basic sanity checks).

    NOTE: group-node filtering is handled downstream by is_group_node() in upload.py
    which marks is_aggregate=True. This function only skips rows that are clearly
    not products at all (totals, system entries, empty rows).
    """
    # Skip empty or nan
    if not code or code == "nan" or not name or name == "nan":
        return False
    # Skip "Итого" summary rows
    if code.lower() == "итого" or name.lower() == "итого":
        return False
    # Skip system entries by name
    skip_keywords = ["НЕ ИСПОЛЬЗОВАТЬ", "НА УДАЛЕНИЕ", "УСЛУГИ"]
    name_upper = name.upper()
    if any(kw in name_upper for kw in skip_keywords):
        return False
    return True


def parse_stock_file(file_path: str, snapshot_date: date | None = None) -> dict:
    """
    Parse 1C stock & sales by branch export file (new multi-branch format).

    Returns:
        {
            "snapshot_date": date,
            "rows": [{"code_1c", "name", "branch_code",
                      "sales_qty", "sales_sum", "stock_qty", "stock_sum",
                      "days_supply", "flag"}],
            "branch_totals": {branch_code: {"sales_total": float}},
            "rows_processed": int,
            "errors": []
        }
    """
    filename = Path(file_path).name
    df = pd.read_excel(file_path, sheet_name=0, header=None, dtype=str)
    errors: list[str] = []

    # Determine snapshot date
    if snapshot_date is None:
        snapshot_date = _extract_date_from_filename(filename) or date.today()

    # Period days for days_supply: use day-of-month (e.g. 26 for March 26)
    period_days = max(snapshot_date.day, 1)

    # Find ТОВАРЫ row for branch-level sales totals
    товары_idx = _find_товары_row(df)
    branch_totals = _extract_branch_totals(df, товары_idx) if товары_idx is not None else {}

    result: dict = {
        "snapshot_date": snapshot_date,
        "rows": [],
        "branch_totals": branch_totals,
        "rows_processed": 0,
        "errors": errors,
    }

    # Data rows start at index 2 (after 2 header rows)
    for idx in range(2, len(df)):
        row = df.iloc[idx]
        code_raw = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
        name_raw = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ""

        if not _is_product_row(code_raw, name_raw):
            continue

        result["rows_processed"] += 1

        for base_col, branch_code in BRANCH_BLOCKS:
            if base_col + 3 >= len(row):
                continue

            sales_qty = _safe_float(row.iloc[base_col])
            sales_sum = _safe_float(row.iloc[base_col + 1])
            stock_qty = _safe_float(row.iloc[base_col + 2])
            stock_sum = _safe_float(row.iloc[base_col + 3])

            # Warehouse branches may have negative sales (outbound transfers) — clamp to 0
            if branch_code in WAREHOUSE_BRANCHES:
                sales_qty = max(0.0, sales_qty)
                sales_sum = max(0.0, sales_sum)

            # Skip rows with no data at all
            if sales_qty == 0 and sales_sum == 0 and stock_qty == 0 and stock_sum == 0:
                continue

            # Compute days of supply from quantity
            if sales_qty > 0 and period_days > 0:
                days_supply = round(stock_qty / (sales_qty / period_days))
            else:
                days_supply = 9999
            days_supply = min(days_supply, 9999)

            result["rows"].append({
                "code_1c": code_raw,
                "name": name_raw,
                "branch_code": branch_code,
                "sales_qty": sales_qty,
                "sales_sum": sales_sum,
                "stock_qty": stock_qty,
                "stock_sum": stock_sum,
                "days_supply": days_supply,
                "flag": _flag(days_supply),
            })

    logger.info(
        "Parsed stock file: %d product records, %d branches, date=%s, totals=%s",
        len(result["rows"]),
        len(BRANCH_BLOCKS),
        result["snapshot_date"],
        list(branch_totals.keys()),
    )
    return result


# ── CLI runner ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    import io
    import sys
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()

    r = parse_stock_file(args.file)
    print(f"Snapshot date : {r['snapshot_date']}")
    print(f"Total records : {len(r['rows'])}")
    print(f"Rows processed: {r['rows_processed']}")
    print(f"Errors        : {r['errors']}")

    from collections import defaultdict
    branch_sales: dict = defaultdict(float)
    branch_stock: dict = defaultdict(float)
    for row in r["rows"]:
        branch_sales[row["branch_code"]] += row["sales_sum"]
        branch_stock[row["branch_code"]] += row["stock_sum"]

    print("\nBranch sales/stock totals (from per-product rows):")
    for b in sorted(branch_sales, key=lambda x: branch_sales[x], reverse=True):
        print(f"  {b:12} sales={branch_sales[b]:>15,.0f}  stock={branch_stock[b]:>15,.0f}")

    print("\nBranch totals from ТОВАРЫ row:")
    for b, t in r["branch_totals"].items():
        print(f"  {b:12} sales_total={t['sales_total']:>15,.0f}")
