"""
Parser for 1C OSV (Оборотно-сальдовая ведомость) files.
Handles accounts 1210 (receivables), 3310 (payables), 1710 (prepayments).

File name format: "{account} {branch} {DD.MM.YY}.xls"
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
    "головное подразделение",
    "основной склад",
    "показатели",
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


# ── Filename parsing ─────────────────────────────────────────────────────────

def parse_osv_filename(filename: str) -> tuple[str, str, date]:
    """
    "1210 Береке 30.03.26.xls"  →  ("1210", "Береке", date(2026, 3, 30))
    "3310 ОС 30.03.26.xls"      →  ("3310", "ОС",     date(2026, 3, 30))
    """
    stem = filename.rsplit(".", 1)[0]  # strip .xls
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{2,4})$", stem)
    if not m:
        raise ValueError(f"Cannot extract date from filename: {filename!r}")
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    period_date = date(year, month, day)

    prefix = stem[: m.start()].strip()  # "1210 Береке"
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
    account, branch_name, period_date = parse_osv_filename(filename)

    wb = xlrd.open_workbook(path, encoding_override="utf-8")
    ws = wb.sheet_by_index(0)
    is_9col = ws.ncols >= 9  # 3310 has 9 columns, 1210/1710 have 8

    entries: list[OsvRow] = []

    for r in range(ws.nrows):
        row = [str(ws.cell_value(r, c)).strip() for c in range(ws.ncols)]
        name = row[0]

        if _is_skip(name):
            continue

        # For 3310 (9-col): skip Вал. rows (col 1 = "Вал." or empty indicator rows)
        if is_9col:
            indicator = row[1] if len(row) > 1 else ""
            if indicator != "БУ":
                continue

        vals = _extract_values(row, is_9col)
        saldo_start_dt, saldo_start_kt, oborot_dt, oborot_kt, saldo_end_dt, saldo_end_kt = vals

        # Skip if no values at all
        if all(v == 0.0 for v in vals):
            continue

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
