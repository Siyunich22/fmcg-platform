"""
Parser for 1C Карточка счета 1000 (cash account register).

Excel structure (0-based columns):
  col[0]  - date (string "DD.MM.YYYY" or Excel date serial)
  col[4]  - counterparty multiline: line[0]="Головное подразделение"
                                    line[1]="АСТАНА филиал" (city + " филиал")
                                    line[2]="Без договора"
  col[5]  - debit account number (e.g. "1030")
  col[6]  - amount
  col[8]  - credit account number (e.g. "1240")

Filter: col[5]=="1030" AND col[8]=="1240" AND "филиал" in col[4]
This uniquely identifies incoming transfers from branches to HQ.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import openpyxl
import xlrd

# Map of city name (upper, as it appears in 1C) → branch_code
BRANCH_MAP: dict[str, str] = {
    "АСТАНА":    "ASTANA",
    "АЛМАТА":    "ALMATY",
    "АЛМАТЫ":    "ALMATY",
    "АТЫРАУ":    "ATYRAU",
    "АКТОБЕ":    "AKTOBE",
    "АКТАУ":     "AKTAU",
    "КОКШЕТАУ":  "KOKSHETAU",
    "СЕМЕЙ":     "SEMEY",
    "КАРАГАНДA": "KARAGANDA",
    "ШЫМКЕНТ":   "SHYMKENT",
    "КОСТАНАЙ":  "KOSTANAY",
    "ПАВЛОДАР":  "PAVLODAR",
    "УРАЛЬСК":   "URALSK",
    "БЕРЕКЕ":    "BEREКЕ",
}

FILIAL_KEYWORD = "филиал"          # literal Cyrillic, U+0444 ф и л и а л


def _extract_period_date(filename: str) -> date:
    """Extract period end date from filename, e.g. '1000 КС потоки ОС март.xls'."""
    stem = Path(filename).stem
    # DD.MM.YY or DD.MM.YYYY
    m = re.search(r"(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})", stem)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        yr = m.group(3)
        year = int(yr) + 2000 if len(yr) == 2 else int(yr)
        return date(year, month, day)
    # Month name → last day of month
    MONTHS = {
        "январ": (1, 31), "феврал": (2, 28), "март": (3, 31),
        "апрел": (4, 30), "май": (5, 31), "июн": (6, 30),
        "июл": (7, 31), "август": (8, 31), "сентябр": (9, 30),
        "октябр": (10, 31), "ноябр": (11, 30), "декабр": (12, 31),
    }
    stem_lower = stem.lower()
    year_m = re.search(r"20(\d{2})", stem)
    year = int("20" + year_m.group(1)) if year_m else date.today().year
    for key, (mon, day) in MONTHS.items():
        if key in stem_lower:
            return date(year, mon, day)
    return date.today()


def _parse_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _extract_branch(cell_text: str) -> tuple[str, str]:
    """
    Extract (city_name, branch_code) from cell text like:
      "Головное подразделение\nАСТАНА филиал\nБез договора"
    """
    for line in cell_text.split("\n"):
        line = line.strip()
        if FILIAL_KEYWORD in line.lower():
            # Take the part before " филиал"
            city = re.split(r"\s+филиал", line, flags=re.IGNORECASE)[0].strip()
            code = BRANCH_MAP.get(city.upper(), city.upper())
            return city, code
    return "UNKNOWN", "UNKNOWN"


def _process_rows(rows_iter) -> list[dict]:
    """
    Core logic: iterate rows (as lists), apply filter, extract fields.
    Returns list of entry dicts.
    """
    entries: list[dict] = []

    for cells in rows_iter:
        if len(cells) < 9:
            continue

        # Account filter: 1030 (debit) / 1240 (credit) = branch incoming transfer
        acc_debit  = str(cells[5] or "").strip()
        acc_credit = str(cells[8] or "").strip()
        if acc_debit != "1030" or acc_credit != "1240":
            continue

        # Must mention "филиал" in col[4]
        col4 = str(cells[4] or "")
        if FILIAL_KEYWORD not in col4.lower():
            continue

        # Date from col[0]
        txn_date = _parse_date(cells[0])
        if txn_date is None:
            continue

        # Branch from col[4]
        branch_name, branch_code = _extract_branch(col4)

        # Amount from col[6]
        amount = _parse_amount(cells[6])
        if amount <= 0:
            continue

        entries.append({
            "transaction_date": txn_date,
            "branch_name": branch_name,
            "branch_code": branch_code,
            "amount": amount,
        })

    return entries


def _iter_xlrd(filepath: str):
    """Yield rows as lists using xlrd (for .xls)."""
    wb = xlrd.open_workbook(filepath)
    ws = wb.sheet_by_index(0)
    for r in range(ws.nrows):
        cells = []
        for c in range(ws.ncols):
            cell = ws.cell(r, c)
            if cell.ctype == xlrd.XL_CELL_DATE:
                try:
                    tup = xlrd.xldate_as_tuple(cell.value, wb.datemode)
                    cells.append(datetime(*tup[:6]))
                except Exception:
                    cells.append(cell.value)
            else:
                cells.append(cell.value)
        yield cells


def _iter_openpyxl(filepath: str):
    """Yield rows as lists using openpyxl (for .xlsx)."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    for row in ws.iter_rows(values_only=True):
        yield list(row)
    wb.close()


def parse_cash_flow_file(filepath: str) -> list[dict]:
    """
    Parse Карточка счета 1000 file (.xls or .xlsx).
    Returns list of dicts:
      transaction_date, branch_name, branch_code, amount, period_date
    """
    path = Path(filepath)
    period_date = _extract_period_date(path.name)

    if path.suffix.lower() == ".xlsx":
        rows = _iter_openpyxl(filepath)
    else:
        rows = _iter_xlrd(filepath)

    entries = _process_rows(rows)

    # Attach period_date to every entry
    for e in entries:
        e["period_date"] = period_date

    return entries
