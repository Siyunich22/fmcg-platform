"""Parser for 1330 ТМЗ (inventory) XLS files from 1C."""
import re
from pathlib import Path
from datetime import date

import xlrd

# Warehouse name patterns → (branch_code, sub_branch_label)
WAREHOUSE_MAP = [
    (re.compile(r"^алмата\s*$", re.I), "ALMATY", None),
    (re.compile(r"береке\s+алмата", re.I), "BEREКЕ", None),
    (re.compile(r"основной\s+склад\s*\(ос\)", re.I), "MAIN", None),
    (re.compile(r"основной\s+склад\s+актау", re.I), "AKTAU", None),
    (re.compile(r"основной\s+склад\s+актобе", re.I), "AKTOBE", None),
    (re.compile(r"склад\s+в\s+г\.?\s*актобе", re.I), "AKTOBE", None),
    (re.compile(r"основной\s+склад\s+атырау", re.I), "ATYRAU", None),
    (re.compile(r"основной\s+склад\s+кокшетау", re.I), "KOKSHETAU", None),
    (re.compile(r"основной\s+склад\s+семей", re.I), "SEMEY", None),
    (re.compile(r"основной\s+склад\s+филиал\s+астана", re.I), "ASTANA", None),
    (re.compile(r"основной\s+склад\s+филиал\s+кар", re.I), "KARAGANDA", None),
    (re.compile(r"склад\s+офис\s+филиал\s+кар", re.I), "KARAGANDA", None),
    (re.compile(r"основной\s+склад\s+шымкент", re.I), "SHYMKENT", None),
    (re.compile(r"склад\s+fighter", re.I), "ALMATY", "Fighter"),
    (re.compile(r"склад\s+алматы_?брак", re.I), "ALMATY", "Брак"),
    (re.compile(r"склад\s+костанай", re.I), "KOSTANAY", None),
    (re.compile(r"склад_?ип\s+береке", re.I), "BEREКЕ", None),
    (re.compile(r"основной\s+склад\s+павлодар", re.I), "PAVLODAR", None),
    (re.compile(r"основной\s+склад\s+уральск", re.I), "URALSK", None),
    (re.compile(r"склад\s+павлодар", re.I), "PAVLODAR", None),
    (re.compile(r"склад\s+уральск", re.I), "URALSK", None),
]

SKIP_NAMES = re.compile(
    r"^(головное\s+подразделение|1330|структурное\s+подразделение|номенклатура)\s*$",
    re.I,
)


def _match_warehouse(name: str):
    """Return (branch_code, sub_branch) if name is a warehouse header, else None."""
    n = name.strip()
    for pattern, branch, sub in WAREHOUSE_MAP:
        if pattern.search(n):
            return branch, sub
    return None


def _extract_period_date(filename: str) -> date:
    """Extract period end date from filename like '1330 1 кв.26 все.xls'."""
    name = Path(filename).stem
    # Quarter pattern: "1 кв.26", "2 кв 26", etc.
    q_match = re.search(r"(\d)\s*кв\.?\s*\.?\s*(\d{2,4})", name, re.I)
    if q_match:
        quarter = int(q_match.group(1))
        year_str = q_match.group(2)
        year = int(year_str) + 2000 if len(year_str) == 2 else int(year_str)
        quarter_end = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}
        month, day = quarter_end.get(quarter, (3, 31))
        return date(year, month, day)
    # Direct date pattern: "30.03.26" or "30.03.2026"
    d_match = re.search(r"(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})", name)
    if d_match:
        day = int(d_match.group(1))
        month = int(d_match.group(2))
        year_str = d_match.group(3)
        year = int(year_str) + 2000 if len(year_str) == 2 else int(year_str)
        return date(year, month, day)
    return date.today()


def parse_tmz_file(filepath: str) -> list[dict]:
    """
    Parse 1330 ТМЗ XLS file.
    Returns list of dicts with keys:
      branch_code, sub_branch, product_name, qty_end, amount_end, period_date
    """
    wb = xlrd.open_workbook(filepath)
    ws = wb.sheet_by_index(0)

    period_date = _extract_period_date(Path(filepath).name)

    entries = []
    current_branch: str | None = None
    current_sub: str | None = None

    i = 0
    while i < ws.nrows:
        name_raw = ws.cell_value(i, 0)
        indicator_raw = ws.cell_value(i, 1)

        name = str(name_raw).strip() if name_raw else ""
        ind = str(indicator_raw).strip() if indicator_raw else ""

        # Skip non-БУ rows (except we'll read Кол. in pairs below)
        if ind != "БУ":
            i += 1
            continue

        # Skip empty name
        if not name:
            i += 1
            continue

        # Skip account total
        if name == "1330":
            i += 1
            continue

        # Skip known sub-section headers
        if SKIP_NAMES.match(name):
            i += 1
            continue

        # Check if warehouse section header
        wh = _match_warehouse(name)
        if wh is not None:
            current_branch, current_sub = wh
            i += 1
            continue

        # Product row — collect БУ values
        if current_branch is None:
            i += 1
            continue

        saldo_end_raw = ws.cell_value(i, 6)
        amount_end = float(saldo_end_raw) if saldo_end_raw else 0.0

        # Next row should be Кол.
        qty_end = 0.0
        if i + 1 < ws.nrows:
            next_ind = str(ws.cell_value(i + 1, 1)).strip()
            if next_ind == "Кол.":
                qty_raw = ws.cell_value(i + 1, 6)
                qty_end = float(qty_raw) if qty_raw else 0.0
                i += 2
            else:
                i += 1
        else:
            i += 1

        # Only save if there's something in stock
        if amount_end == 0 and qty_end == 0:
            continue

        entries.append({
            "branch_code": current_branch,
            "sub_branch": current_sub,
            "product_name": name,
            "qty_end": qty_end,
            "amount_end": amount_end,
            "period_date": period_date,
        })

    return entries
