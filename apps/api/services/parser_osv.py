"""
Parser for 1C OSV (Оборотно-сальдовая ведомость) files.
Handles accounts 1210 (receivables), 3310 (payables), 1710 (prepayments).

Supported file name formats:
  Single-branch : "{account} {branch} {DD.MM.YY}.xls"
  Multi-branch  : "{account} все филиалы {DD.MM.YY}.xls"
"""
from __future__ import annotations

import os
import re
from datetime import date
from typing import TypedDict

import xlrd


class OsvRow(TypedDict):
    account: str
    branch_name: str
    period_date: date
    counterparty: str
    saldo_start_dt: float
    saldo_start_kt: float
    oborot_dt: float
    oborot_kt: float
    saldo_end_dt: float
    saldo_end_kt: float


# ── Skip rules ──────────────────────────────────────────────────────────────

_SKIP_EXACT = {
    "итого", "kzt", "usd", "eur", "kgs", "rub",
    "вал.", "бу",
    "показатели",
    # Sub-section headers in single-branch files (become branch markers in multi-branch files)
    "головное подразделение", "ип береке", "основной склад",
}

_SKIP_STARTS = (
    "счет", "структурное", "контрагенты", "договоры",
    "валюта", "оборотно", "выводимые", "оборотно-сальдовая",
)

_ACCOUNT_RE = re.compile(r"^\d{3,4}$")
_CURRENCY_RE = re.compile(r"^(KZT|USD|EUR|KGS|RUB)$")
_CONTRACT_RE = re.compile(
    r"^(?:без|бехз|бес|Без|Бехз|Бес)\s+договора"
    r"|^Договор[\s№]"
    r"|^договор[\s№]",
    re.IGNORECASE,
)


def _is_skip(name: str) -> bool:
    n = name.strip()
    if not n:
        return True
    nl = n.lower()
    if nl in _SKIP_EXACT:
        return True
    if _ACCOUNT_RE.match(n):
        return True
    if _CURRENCY_RE.match(n):
        return True
    if _CONTRACT_RE.match(n):
        return True
    for s in _SKIP_STARTS:
        if nl.startswith(s):
            return True
    return False


# ── Multi-branch: branch marker detection ───────────────────────────────────

# Maps section header → branch_name (None = keep current branch, e.g. sub-sections)
_BRANCH_EXACT: dict[str, str | None] = {
    "головное подразделение": "Береке",
    "ип береке":              None,   # sub-section of Головное → keep "Береке"
    "основной склад":         None,   # sub-section of Головное → keep "Береке"
}

# "Филиал Актау" → "Актау"
_FILIAL_RE = re.compile(r"^филиал\s+(.+)$", re.IGNORECASE)


def _detect_branch_marker(name: str) -> tuple[bool, str | None]:
    """
    Returns (is_marker, new_branch_name).
    is_marker=True means skip this row and optionally update branch.
    new_branch_name=None means keep the current branch.
    """
    nl = name.strip().lower()

    if nl in _BRANCH_EXACT:
        return True, _BRANCH_EXACT[nl]

    m = _FILIAL_RE.match(name.strip())
    if m:
        return True, m.group(1).strip()

    return False, None


# ── Filename parsing ─────────────────────────────────────────────────────────

def _extract_date_from_stem(stem: str) -> tuple[date, str]:
    """Returns (period_date, prefix_before_date)."""
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{2,4})$", stem)
    if not m:
        raise ValueError(f"Cannot extract date from filename stem: {stem!r}")
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    return date(year, month, day), stem[: m.start()].strip()


def parse_osv_filename(filename: str) -> tuple[str, str, date]:
    """
    "1210 Береке 30.03.26.xls"  →  ("1210", "Береке", date(2026, 3, 30))
    "3310 ОС 30.03.26.xls"      →  ("3310", "ОС",     date(2026, 3, 30))
    """
    stem = filename.rsplit(".", 1)[0]
    period_date, prefix = _extract_date_from_stem(stem)
    parts = prefix.split(" ", 1)
    account = parts[0]
    branch_name = parts[1].strip() if len(parts) > 1 else "UNKNOWN"
    return account, branch_name, period_date


# ── Row value extraction ─────────────────────────────────────────────────────

def _f(val: str) -> float:
    try:
        return float(val) if val.strip() else 0.0
    except ValueError:
        return 0.0


def _extract_values(row: list[str], is_9col: bool) -> tuple[float, float, float, float, float, float]:
    """Returns (saldo_start_dt, saldo_start_kt, oborot_dt, oborot_kt, saldo_end_dt, saldo_end_kt)."""
    if is_9col:
        # 3310 format: 9 columns
        # col: 0=name, 1=БУ/Вал, 2=s_dt, 3=s_kt, 4=ob_dt, 5=ob_kt, 6=e_dt, 7=empty, 8=e_kt
        return _f(row[2]), _f(row[3]), _f(row[4]), _f(row[5]), _f(row[6]), _f(row[8])
    else:
        # 1210 / 1710 format: 8 columns
        # col: 0=name, 1=empty, 2=s_dt, 3=s_kt, 4=ob_dt, 5=ob_kt, 6=e_dt, 7=e_kt
        return _f(row[2]), _f(row[3]), _f(row[4]), _f(row[5]), _f(row[6]), _f(row[7])


# ── Main parser ──────────────────────────────────────────────────────────────

def parse_osv_file(path: str) -> list[OsvRow]:
    filename = os.path.basename(path)
    stem = filename.rsplit(".", 1)[0]
    is_multi = "все филиалы" in stem.lower()

    period_date, prefix = _extract_date_from_stem(stem)
    account = prefix.split(" ", 1)[0]

    wb = xlrd.open_workbook(path, encoding_override="utf-8")
    ws = wb.sheet_by_index(0)
    is_9col = ws.ncols >= 9

    entries: list[OsvRow] = []

    if is_multi:
        # Multi-branch: branch name comes from section marker rows
        current_branch: str | None = None

        for r in range(ws.nrows):
            row = [str(ws.cell_value(r, c)).strip() for c in range(ws.ncols)]
            name = row[0]

            # Check for branch section marker first
            is_marker, new_branch = _detect_branch_marker(name)
            if is_marker:
                if new_branch is not None:
                    current_branch = new_branch
                continue  # never emit marker rows as data

            # No branch detected yet — skip preamble rows
            if current_branch is None:
                continue

            if _is_skip(name):
                continue

            if is_9col:
                indicator = row[1] if len(row) > 1 else ""
                if indicator != "БУ":
                    continue

            vals = _extract_values(row, is_9col)
            if all(v == 0.0 for v in vals):
                continue

            saldo_start_dt, saldo_start_kt, oborot_dt, oborot_kt, saldo_end_dt, saldo_end_kt = vals
            entries.append(
                OsvRow(
                    account=account,
                    branch_name=current_branch,
                    period_date=period_date,
                    counterparty=name,
                    saldo_start_dt=saldo_start_dt,
                    saldo_start_kt=saldo_start_kt,
                    oborot_dt=oborot_dt,
                    oborot_kt=oborot_kt,
                    saldo_end_dt=saldo_end_dt,
                    saldo_end_kt=saldo_end_kt,
                )
            )

    else:
        # Single-branch: branch name from filename
        parts = prefix.split(" ", 1)
        branch_name = parts[1].strip() if len(parts) > 1 else "UNKNOWN"

        for r in range(ws.nrows):
            row = [str(ws.cell_value(r, c)).strip() for c in range(ws.ncols)]
            name = row[0]

            if _is_skip(name):
                continue

            if is_9col:
                indicator = row[1] if len(row) > 1 else ""
                if indicator != "БУ":
                    continue

            vals = _extract_values(row, is_9col)
            if all(v == 0.0 for v in vals):
                continue

            saldo_start_dt, saldo_start_kt, oborot_dt, oborot_kt, saldo_end_dt, saldo_end_kt = vals
            entries.append(
                OsvRow(
                    account=account,
                    branch_name=branch_name,
                    period_date=period_date,
                    counterparty=name,
                    saldo_start_dt=saldo_start_dt,
                    saldo_start_kt=saldo_start_kt,
                    oborot_dt=oborot_dt,
                    oborot_kt=oborot_kt,
                    saldo_end_dt=saldo_end_dt,
                    saldo_end_kt=saldo_end_kt,
                )
            )

    return entries


def parse_osv_folder(folder: str) -> list[OsvRow]:
    """Scan folder for all OSV files (1210/3310/1710) and parse them all."""
    all_entries: list[OsvRow] = []
    osv_re = re.compile(r"^(1210|3310|1710)\s+", re.IGNORECASE)

    try:
        files = os.listdir(folder)
    except FileNotFoundError:
        return []

    for fname in files:
        if not osv_re.match(fname):
            continue
        if not fname.lower().endswith(".xls") and not fname.lower().endswith(".xlsx"):
            continue
        fpath = os.path.join(folder, fname)
        try:
            rows = parse_osv_file(fpath)
            all_entries.extend(rows)
        except Exception as exc:
            print(f"[parser_osv] Skipping {fname}: {exc}")

    return all_entries
