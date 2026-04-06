"""
Parser for 1C Карточка счета 1000 (cash account register).
Extracts branch transfers to HQ ("Перевод ДС в головное подразделение").

Expected Excel columns (0-based):
  [1]  transaction date
  [3]  our organization — contains "Филиал X" for branch identification
  [4]  counterparty + purpose — contains transfer keyword
  [11] credit amount (money sent to HQ)
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import openpyxl
import xlrd

TRANSFER_KEYWORD = "Перевод ДС в головное подразделение"

# Map of city name (lowercase) → branch_code
BRANCH_MAP: dict[str, str] = {
    "астана": "ASTANA",
    "алматы": "ALMATY",
    "атырау": "ATYRAU",
    "актобе": "AKTOBE",
    "актау": "AKTAU",
    "кокшетау": "KOKSHETAU",
    "семей": "SEMEY",
    "карагандa": "KARAGANDA",
    "шымкент": "SHYMKENT",
    "костанай": "KOSTANAY",
    "павлодар": "PAVLODAR",
    "уральск": "URALSK",
    "береке": "BEREКЕ",
}

_BRANCH_RE = re.compile(r"[Фф]илиал\s+([А-Яа-яёЁ\-]+)", re.UNICODE)


def _extract_period_date(filename: str) -> date:
    """Extract period date from filename, e.g. '1000 март 2026.xlsx' or '1000 31.03.26.xlsx'."""
    stem = Path(filename).stem
    # DD.MM.YY or DD.MM.YYYY
    m = re.search(r"(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})", stem)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        yr = m.group(3)
        year = int(yr) + 2000 if len(yr) == 2 else int(yr)
        return date(year, month, day)
    return date.today()


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


def _extract_branch(cell_val: str) -> tuple[str, str]:
    """Return (branch_name, branch_code) from org column text."""
    m = _BRANCH_RE.search(cell_val)
    if m:
        city = m.group(1).strip()
        code = BRANCH_MAP.get(city.lower(), city.upper())
        return city, code
    return "UNKNOWN", "UNKNOWN"


def _iter_rows_openpyxl(filepath: str):
    """Yield rows as lists of values using openpyxl (for .xlsx)."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    for row in ws.iter_rows(values_only=True):
        yield list(row)
    wb.close()


def _iter_rows_xlrd(filepath: str):
    """Yield rows as lists of values using xlrd (for .xls)."""
    wb = xlrd.open_workbook(filepath)
    ws = wb.sheet_by_index(0)
    for r in range(ws.nrows):
        cells = []
        for c in range(ws.ncols):
            cell = ws.cell(r, c)
            # xlrd type 3 = date
            if cell.ctype == xlrd.XL_CELL_DATE:
                try:
                    dt_tuple = xlrd.xldate_as_tuple(cell.value, wb.datemode)
                    cells.append(datetime(*dt_tuple[:6]).date() if dt_tuple[3:] == (0, 0, 0) else datetime(*dt_tuple[:6]))
                except Exception:
                    cells.append(cell.value)
            elif cell.ctype == xlrd.XL_CELL_TEXT:
                cells.append(cell.value.strip())
            elif cell.ctype == xlrd.XL_CELL_NUMBER:
                cells.append(cell.value)
            else:
                cells.append(None)
        yield cells


def parse_cash_flow_file(filepath: str) -> list[dict]:
    """
    Parse Карточка счета 1000 Excel file (.xls or .xlsx).
    Returns list of dicts:
      transaction_date, branch_name, branch_code, amount, period_date
    """
    path = Path(filepath)
    period_date = _extract_period_date(path.name)

    if path.suffix.lower() == ".xlsx":
        row_iter = _iter_rows_openpyxl(filepath)
    else:
        row_iter = _iter_rows_xlrd(filepath)

    entries: list[dict] = []

    for cells in row_iter:
        if len(cells) < 5:
            continue

        # Find which column contains the transfer keyword
        transfer_col = None
        for ci, cv in enumerate(cells):
            if cv and TRANSFER_KEYWORD in str(cv):
                transfer_col = ci
                break

        if transfer_col is None:
            continue

        # Date: search columns 0-3 for a date value
        txn_date: date | None = None
        for ci in range(min(4, len(cells))):
            txn_date = _parse_date(cells[ci])
            if txn_date is not None:
                break

        if txn_date is None:
            continue

        # Branch: search cols before transfer_col for "Филиал"
        branch_name, branch_code = "UNKNOWN", "UNKNOWN"
        for ci in range(max(0, transfer_col - 4), transfer_col):
            cv = str(cells[ci] or "")
            if "илиал" in cv:
                branch_name, branch_code = _extract_branch(cv)
                break

        # Amount: first positive numeric value from col 5 onwards
        amount = 0.0
        for ci in range(5, len(cells)):
            v = _parse_amount(cells[ci])
            if v > 0:
                amount = v
                break

        if amount <= 0:
            continue

        entries.append({
            "transaction_date": txn_date,
            "branch_name": branch_name,
            "branch_code": branch_code,
            "amount": amount,
            "period_date": period_date,
        })

    return entries
