"""
Parser for 1C sales & payments export file.

File structure (0-indexed rows):
  row[0]  = empty title row
  row[1]  = date header (col[1] contains the date)
  row[2]  = column headers
  row[3+] = data rows

Column → Branch mapping (col index → branch code_1c):
  2  = MAIN       (Основной склад)
  3  = AKTAU
  4  = AKTOBE
  5  = ALMATY
  6  = ASTANA
  7  = BEREКЕ     (ИП Береке)
  8  = ATYRAU
  9  = KOKSHETAU
  10 = RTA
  11 = SEMEY
  12 = SHYMKENT
  13 = ИТОГО      (skip — validation only)
"""

import logging
import re
from datetime import date
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

# Branch column index → branch code_1c
BRANCH_COLUMNS: dict[int, str] = {
    2: "MAIN",
    3: "AKTAU",
    4: "AKTOBE",
    5: "ALMATY",
    6: "ASTANA",
    7: "BEREКЕ",
    8: "ATYRAU",
    9: "KOKSHETAU",
    10: "RTA",
    11: "SEMEY",
    12: "SHYMKENT",
}

# Category detection patterns (checked in order — more specific first)
CATEGORY_PATTERNS: list[tuple[str, str]] = [
    # Масло (oil) — "масло", "оливковое масло"
    (r"масл|olive|олив", "МАСЛО"),
    # Варенье / джем
    (r"варень|джем|повидло", "ВАРЕНЬЕ"),
    # Чай
    (r"чай|tea\b", "ЧАЙ"),
    # Нарын (traditional Kazakh dish) + бешбармак
    (r"нарын|бешбармак|беш.?бармак|кеспе", "НАРЫН"),
    # Лапша (noodles) — алькони, euro express, экспресс
    (r"лапш|алькони|euro.?express|евро.?экспресс|евро.?экс", "ЛАПША"),
    # Соусы / перец / специи — аджика, горчица, кетчуп, перец, закуска
    (r"перец|пряност|специ|аджик|горчиц|кетчуп|соус|закуск|нектар|сальс", "СОУСЫ"),
    # Салфетки (wet & dry)
    (r"салфет", "САЛФЕТКИ"),
    # Монпасье / конфеты / сладости
    (r"монпасье|халва|конфет|карамел|шоколад", "СЛАДОСТИ"),
]


def detect_category(name: str) -> str:
    """Detect product category from nomenclature name."""
    name_lower = name.lower()
    for pattern, category in CATEGORY_PATTERNS:
        if re.search(pattern, name_lower):
            return category
    return "ПРОЧЕЕ"


def detect_subcategory(name: str, category: str) -> str:
    """Derive subcategory from product name within a known category.

    Rules:
    - ЧАЙ   → group by weight: "Чай 100 гр", "Чай 150 гр", etc.
    - МАСЛО  → "ЖБ" for tin-can, else group by volume: "Масло 250 мл", etc.
    - ВАРЕНЬЕ→ group by fruit/type
    - НАРЫН  → group by product line (Бешбармак / Кеспе / Нарын)
    - СОУСЫ  → group by type (Кетчуп / Аджика / Горчица / Соус / Перец)
    - ЛАПША  → group by packaging (Стакан / Пакет)
    - Others → returns category name as-is
    """
    n = name.strip()
    nl = n.lower()

    if category == "ЧАЙ":
        m = re.search(r'\b(\d{2,4})\s*(?:гр?|г|g)\b', nl)
        if m:
            return f"Чай {m.group(1)} гр"
        return "Чай (прочее)"

    if category == "МАСЛО":
        if re.search(r'\bжб\b|железн', nl):
            return "ЖБ"
        if re.search(r'\bпэт\b|пластик|plastic', nl):
            return "ПЭТ"
        m = re.search(r'\b(\d+(?:[,\.]\d+)?)\s*(мл|л|ml|l)\b', nl)
        if m:
            vol = m.group(1).replace(",", ".")
            unit = "л" if m.group(2).lower() in ("л", "l") else "мл"
            return f"Масло {vol} {unit}"
        return "Масло (прочее)"

    if category == "ВАРЕНЬЕ":
        fruit_map = [
            (r"клубник", "Клубничное"),
            (r"малин", "Малиновое"),
            (r"вишн|черешн", "Вишнёвое"),
            (r"яблок|яблочн", "Яблочное"),
            (r"абрикос", "Абрикосовое"),
            (r"смород", "Смородиновое"),
            (r"слив", "Сливовое"),
            (r"груш", "Грушевое"),
            (r"персик", "Персиковое"),
            (r"ягод", "Ягодное"),
        ]
        for pat, label in fruit_map:
            if re.search(pat, nl):
                return label
        return "Варенье (прочее)"

    if category == "НАРЫН":
        if re.search(r"бешбармак|беш.?бармак", nl):
            return "Бешбармак"
        if re.search(r"кеспе", nl):
            return "Кеспе"
        return "Нарын"

    if category == "СОУСЫ":
        if re.search(r"кетчуп", nl):
            return "Кетчуп"
        if re.search(r"аджик", nl):
            return "Аджика"
        if re.search(r"горчиц", nl):
            return "Горчица"
        if re.search(r"перец|пири", nl):
            return "Перец"
        if re.search(r"соус", nl):
            return "Соус"
        return "Соусы (прочее)"

    if category == "ЛАПША":
        if re.search(r"стакан|cup", nl):
            return "Стакан"
        if re.search(r"лоток|block|блок", nl):
            return "Лоток/блок"
        return "Пакет"

    if category == "САЛФЕТКИ":
        return "Салфетки"

    if category == "СЛАДОСТИ":
        return "Сладости"

    return category


def is_group_node(name: str, subcategory: str) -> bool:
    """Return True if this product is a 1C group/aggregate node, not a real SKU.

    Group nodes appear in 1C exports as subtotal rows for a product line.
    They are identified by having a short generic name that matches the
    detected subcategory (e.g. "Масло 1 л", "Чай 150 гр", "ЖБ", "ПЭТ").
    Also catches standalone category names like "Масло", "Чай", "Варенье".
    """
    n = name.strip()
    # Name exactly equals its subcategory → group node
    if n == subcategory:
        return True
    # ALL-CAPS short category name (e.g. "ВАРЕНЬЕ", "МАСЛО", "ЧАЙ")
    if re.match(r'^[А-ЯЁ\s]{3,20}$', n) and n == n.upper():
        return True
    # Single Cyrillic word of any length with no digits or brand markers
    # e.g. "Белорусское", "Вкуснэль", "Карлсон"
    if re.match(r'^[А-ЯЁа-яё\-]{3,25}$', n):
        return True
    # 1–3 words, no digits, no Latin, no quotes → brand/line group header
    # e.g. "Варенье Вкуснэль", "Чай пакетированный"
    if not re.search(r'\d|["\'«»A-Za-z]', n) and len(n.split()) <= 3:
        return True
    # Pattern: "Category Volume unit" with no brand info, e.g. "Масло 1 л", "Чай 150 гр"
    if re.match(r'^[А-ЯЁа-яё]+\s+\d+(?:[,\.]\d+)?\s*(?:гр?|г|мл|л|кг)\s*$', n, re.IGNORECASE):
        return True
    # Pattern: multi-word ending in "N кг/л/мл/гр" with NO quotes → size group header
    # e.g. "Варенье Вкуснэль 4 кг", "Варенье Карлсон 6.8 кг"
    if (re.search(r'\d+(?:[,\.]\d+)?\s*(?:гр?|г|мл|л|кг)\s*$', n, re.IGNORECASE)
            and not re.search(r'["\'"«»]', n)):
        return True
    return False


def _safe_numeric(value: Any) -> float:
    """Convert cell value to float, return 0.0 on failure."""
    try:
        if pd.isna(value):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def parse_sales_file(file_path: str) -> dict:
    """
    Parse 1C sales & payments export xlsx/xls file.

    Returns:
        {
            "period_date": date,
            "sales": [{"code_1c", "name", "category", "branch_code", "amount"}],
            "debts": [{"branch_code", "debt_amount", "payment_amount"}],
            "rows_processed": int,
            "errors": []
        }
    """
    df = pd.read_excel(file_path, sheet_name=0, header=None, dtype=str)
    result: dict = {
        "period_date": None,
        "sales": [],
        "debts": [],
        "rows_processed": 0,
        "errors": [],
    }
    errors: list[str] = []

    # --- Extract period date from row[1], col[1] ---
    try:
        raw_date = df.iloc[1, 1]
        if pd.notna(raw_date):
            result["period_date"] = pd.to_datetime(raw_date).date()
    except Exception as e:
        errors.append(f"Could not parse period date: {e}")
        result["period_date"] = date.today()

    # --- Accumulate debt/payment by branch ---
    debt_map: dict[str, dict] = {
        code: {"debt_amount": 0.0, "payment_amount": 0.0, "payment_to_head": 0.0, "returns_amount": 0.0}
        for code in BRANCH_COLUMNS.values()
    }

    # --- Iterate data rows starting at index 3 ---
    for idx in range(3, len(df)):
        row = df.iloc[idx]
        code_raw = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
        name_raw = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ""

        if not name_raw or name_raw == "nan":
            continue

        name_lower = name_raw.lower()
        is_total_row = "итого" in name_lower
        is_debt_row = "долг" in name_lower and "оплат" not in name_lower
        is_payment_to_head = "головн" in name_lower
        is_payment_row = "оплат" in name_lower and "головн" not in name_lower
        is_returns_row = "возврат" in name_lower
        is_product_row = bool(re.match(r"^БК\d+", code_raw))

        if is_total_row:
            pass  # skip totals
        elif is_debt_row or is_payment_row or is_payment_to_head or is_returns_row:
            for col_idx, branch_code in BRANCH_COLUMNS.items():
                if col_idx >= len(row):
                    continue
                val = _safe_numeric(row.iloc[col_idx])
                if val == 0.0:
                    continue
                if is_debt_row:
                    debt_map[branch_code]["debt_amount"] += val
                elif is_payment_row:
                    debt_map[branch_code]["payment_amount"] += val
                elif is_payment_to_head:
                    debt_map[branch_code]["payment_to_head"] += val
                elif is_returns_row:
                    debt_map[branch_code]["returns_amount"] += val

        elif is_product_row:
            category = detect_category(name_raw)
            for col_idx, branch_code in BRANCH_COLUMNS.items():
                if col_idx >= len(row):
                    continue
                amount = _safe_numeric(row.iloc[col_idx])
                if amount == 0.0:
                    continue
                result["sales"].append({
                    "code_1c": code_raw,
                    "name": name_raw,
                    "category": category,
                    "branch_code": branch_code,
                    "amount": amount,
                })

        result["rows_processed"] += 1

    # --- Flatten debt map ---
    for branch_code, amounts in debt_map.items():
        if any(v > 0 for v in amounts.values()):
            result["debts"].append({
                "branch_code": branch_code,
                **amounts,
            })

    result["errors"] = errors
    logger.info(
        "Parsed sales file: %d sales rows, %d debt records, date=%s",
        len(result["sales"]),
        len(result["debts"]),
        result["period_date"],
    )
    return result


# ── CLI runner for debugging in VS Code ──────────────────────────────────────
if __name__ == "__main__":
    import argparse, json, sys

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()

    result = parse_sales_file(args.file)
    print(f"Period date : {result['period_date']}")
    print(f"Sales rows  : {len(result['sales'])}")
    print(f"Debt records: {len(result['debts'])}")
    print(f"Errors      : {result['errors']}")
    print("\nFirst 3 sales:")
    for row in result["sales"][:3]:
        print(" ", row)
    print("\nDebts:")
    for row in result["debts"]:
        print(" ", row)
