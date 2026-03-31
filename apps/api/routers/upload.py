import json
import shutil
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from db import get_db
from models.models import Upload, Sale, Stock, Debt, Nomenclature, Branch, UploadType, OsvEntry, TmzEntry
from services.parser_sales import parse_sales_file, detect_category, detect_subcategory, is_group_node
from services.parser_stock import parse_stock_file, _extract_date_from_filename as _stock_date_from_name
from services.parser_osv import parse_osv_folder
from services.alert_engine import run_alerts
from schemas.upload import UploadResponse, UploadRecord
import uuid
from datetime import date

router = APIRouter()

# ── Folder config (persisted in a simple JSON file next to this module) ────────
_CONFIG_PATH = Path(__file__).parent.parent / "folder_config.json"

def _load_folder_config() -> dict:
    if _CONFIG_PATH.exists():
        try:
            return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"stock_folder": "", "sales_folder": "", "osv_folder": ""}

def _save_folder_config(cfg: dict):
    _CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

def _find_latest_xlsx(folder: str, keywords: list[str]) -> Path | None:
    """Find the most recently modified .xlsx file in folder matching any keyword."""
    p = Path(folder)
    if not p.exists() or not p.is_dir():
        return None
    files = [
        f for f in p.glob("*.xlsx")
        if any(kw.lower() in f.name.lower() for kw in keywords)
    ]
    if not files:
        # fallback: any xlsx
        files = list(p.glob("*.xlsx")) + list(p.glob("*.xls"))
    if not files:
        return None
    return max(files, key=lambda f: f.stat().st_mtime)


@router.get("/folder-config")
async def get_folder_config():
    cfg = _load_folder_config()
    # Also list available files for preview
    stock_file = None
    if cfg.get("stock_folder"):
        f = _find_latest_xlsx(cfg["stock_folder"], ["остатк", "продаж", "сток", "stock"])
        if f:
            stock_file = {"name": f.name, "size_kb": round(f.stat().st_size / 1024)}
    return {**cfg, "stock_latest_file": stock_file}


@router.post("/folder-config")
async def save_folder_config(request: Request):
    body = await request.json()
    cfg = _load_folder_config()
    if "stock_folder" in body:
        cfg["stock_folder"] = body["stock_folder"].strip()
    if "sales_folder" in body:
        cfg["sales_folder"] = body["sales_folder"].strip()
    if "osv_folder" in body:
        cfg["osv_folder"] = body["osv_folder"].strip()
    _save_folder_config(cfg)
    return {"ok": True, **cfg}


@router.post("/stock/from-folder", response_model=UploadResponse)
async def upload_stock_from_folder(db: AsyncSession = Depends(get_db)):
    """Pick latest stock file from configured folder and process it."""
    cfg = _load_folder_config()
    folder = cfg.get("stock_folder", "")
    if not folder:
        raise HTTPException(400, "Папка не настроена. Укажи путь в настройках.")

    latest = _find_latest_xlsx(folder, ["остатк", "продаж", "сток", "stock"])
    if not latest:
        raise HTTPException(404, f"Файлы .xlsx не найдены в папке: {folder}")

    # Copy to temp and process (same logic as manual upload)
    suffix = latest.suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copy2(latest, tmp.name)
        tmp_path = tmp.name

    try:
        hint_date = _stock_date_from_name(latest.name)
        parsed = parse_stock_file(tmp_path, snapshot_date=hint_date)
    except Exception as e:
        raise HTTPException(422, f"Ошибка парсинга: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return await _save_stock_to_db(db, parsed, latest.name)


async def _get_or_create_nomenclature(db: AsyncSession, code_1c: str, name: str, category: str) -> uuid.UUID:
    """Return existing nomenclature ID, updating category/subcategory if they were ПРОЧЕЕ."""
    subcategory = detect_subcategory(name, category)
    aggregate = is_group_node(name, subcategory)
    result = await db.execute(select(Nomenclature).where(Nomenclature.code_1c == code_1c))
    nom = result.scalar_one_or_none()
    if nom:
        if nom.category == "ПРОЧЕЕ" and category != "ПРОЧЕЕ":
            nom.category = category
            nom.subcategory = subcategory
            nom.is_aggregate = aggregate
        elif nom.subcategory == "ПРОЧЕЕ" and subcategory != "ПРОЧЕЕ":
            nom.subcategory = subcategory
            nom.is_aggregate = aggregate
        return nom.id
    nom = Nomenclature(code_1c=code_1c, name=name, category=category,
                       subcategory=subcategory, is_aggregate=aggregate)
    db.add(nom)
    await db.flush()
    return nom.id


async def _get_branch_id(db: AsyncSession, code_1c: str) -> uuid.UUID | None:
    """Return branch ID by code_1c."""
    result = await db.execute(select(Branch).where(Branch.code_1c == code_1c))
    branch = result.scalar_one_or_none()
    return branch.id if branch else None


@router.post("/sales", response_model=UploadResponse)
async def upload_sales(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload and parse 1C sales & payments export file."""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only .xlsx and .xls files are supported")

    # Save to temp file
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        parsed = parse_sales_file(tmp_path)
    except Exception as e:
        raise HTTPException(422, f"Parse error: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    period_date: date = parsed["period_date"] or date.today()

    # Delete existing data for this date
    existing = await db.execute(
        select(Upload).where(
            Upload.upload_type == UploadType.sales,
            Upload.period_date == period_date,
        )
    )
    for old in existing.scalars():
        await db.execute(delete(Sale).where(Sale.upload_id == old.id))
        await db.execute(delete(Debt).where(Debt.upload_id == old.id))
        await db.delete(old)

    # Create upload record
    upload = Upload(
        upload_type=UploadType.sales,
        filename=file.filename,
        period_date=period_date,
        rows_processed=len(parsed["sales"]),
        status="ok" if not parsed["errors"] else "partial",
        error_log={"errors": parsed["errors"]} if parsed["errors"] else None,
    )
    db.add(upload)
    await db.flush()

    # Insert sales
    for row in parsed["sales"]:
        branch_id = await _get_branch_id(db, row["branch_code"])
        if not branch_id:
            continue
        nom_id = await _get_or_create_nomenclature(db, row["code_1c"], row["name"], row["category"])
        db.add(Sale(
            upload_id=upload.id,
            nomenclature_id=nom_id,
            branch_id=branch_id,
            period_date=period_date,
            amount=row["amount"],
        ))

    # Insert debts
    for row in parsed["debts"]:
        branch_id = await _get_branch_id(db, row["branch_code"])
        if not branch_id:
            continue
        db.add(Debt(
            upload_id=upload.id,
            branch_id=branch_id,
            period_date=period_date,
            debt_amount=row["debt_amount"],
            payment_amount=row["payment_amount"],
            payment_to_head=row.get("payment_to_head", 0),
            returns_amount=row.get("returns_amount", 0),
            overdue_days=_infer_overdue(row["debt_amount"], row["payment_amount"]),
            status=_debt_status(_infer_overdue(row["debt_amount"], row["payment_amount"])),
        ))

    await db.commit()
    await run_alerts(db)

    return UploadResponse(
        upload_id=str(upload.id),
        rows_processed=len(parsed["sales"]),
        period_date=str(period_date),
        status=upload.status,
        errors=parsed["errors"],
    )


async def _save_stock_to_db(db: AsyncSession, parsed: dict, filename: str) -> UploadResponse:
    """Shared logic: persist parsed stock data to DB and return UploadResponse."""
    snapshot_date: date = parsed["snapshot_date"]

    await db.execute(delete(Sale))
    existing = await db.execute(select(Upload).where(Upload.upload_type == UploadType.stock))
    for old in existing.scalars():
        await db.execute(delete(Stock).where(Stock.upload_id == old.id))
        await db.delete(old)

    upload = Upload(
        upload_type=UploadType.stock,
        filename=filename,
        period_date=snapshot_date,
        rows_processed=parsed["rows_processed"],
        status="ok" if not parsed["errors"] else "partial",
        error_log={"errors": parsed["errors"]} if parsed["errors"] else None,
    )
    db.add(upload)
    await db.flush()

    for row in parsed["rows"]:
        branch_id = await _get_branch_id(db, row["branch_code"])
        if not branch_id:
            continue
        category = detect_category(row["name"])
        nom_id = await _get_or_create_nomenclature(db, row["code_1c"], row["name"], category)
        db.add(Stock(
            upload_id=upload.id,
            nomenclature_id=nom_id,
            branch_id=branch_id,
            snapshot_date=snapshot_date,
            qty=row["stock_qty"],
            amount=row["stock_sum"],
            sales_sum=row["sales_sum"],
            days_supply=row["days_supply"],
            flag=row["flag"],
        ))

    branch_totals: dict = parsed.get("branch_totals", {})
    if branch_totals:
        agg_nom_id = await _get_or_create_nomenclature(
            db, "__BRANCH_TOTAL__", "Итого по филиалу", "ПРОЧЕЕ"
        )
        for branch_code, totals in branch_totals.items():
            branch_id = await _get_branch_id(db, branch_code)
            if not branch_id:
                continue
            if totals["sales_total"] > 0:
                db.add(Sale(
                    upload_id=upload.id,
                    nomenclature_id=agg_nom_id,
                    branch_id=branch_id,
                    period_date=snapshot_date,
                    amount=totals["sales_total"],
                ))

    await db.commit()
    await run_alerts(db)

    return UploadResponse(
        upload_id=str(upload.id),
        rows_processed=parsed["rows_processed"],
        period_date=str(snapshot_date),
        status=upload.status,
        errors=parsed["errors"],
    )


@router.post("/stock", response_model=UploadResponse)
async def upload_stock(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload and parse 1C stock & sales by branch export file."""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only .xlsx and .xls files are supported")

    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        hint_date = _stock_date_from_name(file.filename)
        parsed = parse_stock_file(tmp_path, snapshot_date=hint_date)
    except Exception as e:
        raise HTTPException(422, f"Parse error: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return await _save_stock_to_db(db, parsed, file.filename)


@router.get("/history", response_model=list[UploadRecord])
async def get_history(db: AsyncSession = Depends(get_db)):
    """Get upload history, newest first."""
    result = await db.execute(
        select(Upload).order_by(Upload.uploaded_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.delete("/{upload_id}")
async def delete_upload(upload_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an upload and all its associated data."""
    result = await db.execute(select(Upload).where(Upload.id == upload_id))
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(404, "Upload not found")

    if upload.upload_type == UploadType.sales:
        await db.execute(delete(Sale).where(Sale.upload_id == upload.id))
        await db.execute(delete(Debt).where(Debt.upload_id == upload.id))
    elif upload.upload_type == UploadType.stock:
        await db.execute(delete(Stock).where(Stock.upload_id == upload.id))
        await db.execute(delete(Sale).where(Sale.upload_id == upload.id))

    await db.delete(upload)
    await db.commit()
    return {"ok": True}


# ─── Helpers ─────────────────────────────────────────────────────────────────

@router.post("/osv/files")
async def upload_osv_files(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload multiple OSV files directly (1210/3310/1710 .xls/.xlsx)."""
    from services.parser_osv import parse_osv_file

    all_entries = []
    errors = []

    for file in files:
        if not file.filename or not file.filename.lower().endswith((".xls", ".xlsx")):
            errors.append(f"{file.filename}: неподдерживаемый формат")
            continue

        tmp_dir = Path(tempfile.mkdtemp())
        tmp_path = tmp_dir / file.filename

        try:
            with open(tmp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            entries = parse_osv_file(str(tmp_path))
            all_entries.extend(entries)
        except Exception as e:
            errors.append(f"{file.filename}: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    if not all_entries:
        raise HTTPException(422, f"Нет данных для сохранения. Ошибки: {'; '.join(errors)}")

    period_dates = {e["period_date"] for e in all_entries}
    accounts = {e["account"] for e in all_entries}
    branch_names = {e["branch_name"] for e in all_entries}

    for pd in period_dates:
        for acc in accounts:
            await db.execute(
                delete(OsvEntry).where(
                    OsvEntry.period_date == pd,
                    OsvEntry.account == acc,
                )
            )

    for e in all_entries:
        db.add(OsvEntry(
            account=e["account"],
            branch_name=e["branch_name"],
            period_date=e["period_date"],
            counterparty=e["counterparty"],
            saldo_start_dt=e["saldo_start_dt"],
            saldo_start_kt=e["saldo_start_kt"],
            oborot_dt=e["oborot_dt"],
            oborot_kt=e["oborot_kt"],
            saldo_end_dt=e["saldo_end_dt"],
            saldo_end_kt=e["saldo_end_kt"],
        ))

    await db.commit()
    return {
        "ok": True,
        "rows": len(all_entries),
        "accounts": sorted(accounts),
        "branches": sorted(branch_names),
        "errors": errors,
    }


@router.get("/osv/folder-config")
async def get_osv_folder_config():
    cfg = _load_folder_config()
    folder = cfg.get("osv_folder", "")
    file_count = 0
    if folder:
        from pathlib import Path
        import re
        osv_re = re.compile(r"^(1210|3310|1710)\s+", re.IGNORECASE)
        try:
            file_count = sum(
                1 for f in Path(folder).iterdir()
                if osv_re.match(f.name) and f.suffix.lower() in (".xls", ".xlsx")
            )
        except Exception:
            pass
    return {"osv_folder": folder, "file_count": file_count}


@router.post("/osv/folder-config")
async def save_osv_folder_config(request: Request):
    body = await request.json()
    cfg = _load_folder_config()
    if "osv_folder" in body:
        cfg["osv_folder"] = body["osv_folder"].strip()
    _save_folder_config(cfg)
    return {"ok": True, "osv_folder": cfg.get("osv_folder", "")}


@router.post("/osv/scan-folder")
async def scan_osv_folder(db: AsyncSession = Depends(get_db)):
    """Parse all OSV files from configured folder and save to DB."""
    cfg = _load_folder_config()
    folder = cfg.get("osv_folder", "")
    if not folder:
        raise HTTPException(400, "Папка ОСВ не настроена")

    entries = parse_osv_folder(folder)
    if not entries:
        raise HTTPException(404, f"Файлы ОСВ (1210/3310/1710) не найдены в папке: {folder}")

    # Delete existing entries for the same period_dates found in this batch
    period_dates = {e["period_date"] for e in entries}
    accounts = {e["account"] for e in entries}
    branch_names = {e["branch_name"] for e in entries}

    for pd in period_dates:
        for acc in accounts:
            await db.execute(
                delete(OsvEntry).where(
                    OsvEntry.period_date == pd,
                    OsvEntry.account == acc,
                )
            )

    for e in entries:
        db.add(OsvEntry(
            account=e["account"],
            branch_name=e["branch_name"],
            period_date=e["period_date"],
            counterparty=e["counterparty"],
            saldo_start_dt=e["saldo_start_dt"],
            saldo_start_kt=e["saldo_start_kt"],
            oborot_dt=e["oborot_dt"],
            oborot_kt=e["oborot_kt"],
            saldo_end_dt=e["saldo_end_dt"],
            saldo_end_kt=e["saldo_end_kt"],
        ))

    await db.commit()
    return {
        "ok": True,
        "rows": len(entries),
        "accounts": sorted(accounts),
        "branches": sorted(branch_names),
        "period_dates": [str(d) for d in sorted(period_dates)],
    }


@router.post("/tmz/files")
async def upload_tmz_files(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload 1330 ТМЗ XLS files and save closing balances by branch."""
    from services.parser_tmz import parse_tmz_file

    all_entries = []
    errors = []

    for file in files:
        if not file.filename or not file.filename.lower().endswith((".xls", ".xlsx")):
            errors.append(f"{file.filename}: неподдерживаемый формат")
            continue

        tmp_dir = Path(tempfile.mkdtemp())
        tmp_path = tmp_dir / file.filename

        try:
            with open(tmp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            entries = parse_tmz_file(str(tmp_path))
            all_entries.extend(entries)
        except Exception as e:
            errors.append(f"{file.filename}: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    if not all_entries and not errors:
        raise HTTPException(422, "Файл не содержит данных")
    if not all_entries:
        raise HTTPException(422, f"Ошибок: {'; '.join(errors)}")

    period_dates = {e["period_date"] for e in all_entries}

    # Delete existing entries for same period
    for pd in period_dates:
        await db.execute(delete(TmzEntry).where(TmzEntry.period_date == pd))

    for e in all_entries:
        db.add(TmzEntry(
            branch_code=e["branch_code"],
            sub_branch=e.get("sub_branch"),
            product_name=e["product_name"],
            qty_end=e["qty_end"],
            amount_end=e["amount_end"],
            period_date=e["period_date"],
        ))

    await db.commit()
    branches = sorted({e["branch_code"] for e in all_entries})
    return {
        "ok": True,
        "rows": len(all_entries),
        "branches": branches,
        "period_dates": [str(d) for d in sorted(period_dates)],
        "errors": errors,
    }


def _infer_overdue(debt: float, payment: float) -> int:
    """Rough heuristic: if debt >> payment, flag as overdue."""
    if debt <= 0:
        return 0
    ratio = payment / debt if debt > 0 else 1
    if ratio >= 0.9:
        return 15
    if ratio >= 0.5:
        return 45
    if ratio >= 0.1:
        return 75
    return 100


def _debt_status(days: int) -> str:
    if days <= 30:
        return "ok"
    if days <= 60:
        return "warning"
    if days <= 90:
        return "risk"
    return "critical"
