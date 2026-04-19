import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from routers import auth, upload, dashboard, sales, stock, debts, orders, branches, tmz, sales_report, cash_flow, pnl
from db import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Normalize: set is_bonus=FALSE for any NULL rows so all queries are consistent
        await conn.execute(text(
            "UPDATE sales_report_entries SET is_bonus = FALSE WHERE is_bonus IS NULL"
        ))
        # Migrate old single-row rent_settings → multi-row rent_items (run once)
        await conn.execute(text("""
            INSERT INTO rent_items (branch_code, label, area_sqm, price_per_sqm, notes)
            SELECT branch_code, 'Аренда', area_sqm, price_per_sqm, notes
            FROM rent_settings
            WHERE (area_sqm > 0 OR price_per_sqm > 0)
              AND branch_code NOT IN (SELECT DISTINCT branch_code FROM rent_items)
        """))
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="FMCG Operations Platform",
    description="Sauda Analytics MVP — FMCG distribution management",
    version="1.0.0",
    lifespan=lifespan,
)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(stock.router, prefix="/api/stock", tags=["stock"])
app.include_router(debts.router, prefix="/api/debts", tags=["debts"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
app.include_router(branches.router, prefix="/api", tags=["branches"])
app.include_router(tmz.router, prefix="/api/tmz", tags=["tmz"])
app.include_router(sales_report.router, prefix="/api/sales-report", tags=["sales-report"])
app.include_router(cash_flow.router, prefix="/api/cash-flow", tags=["cash-flow"])
app.include_router(pnl.router, prefix="/api/pnl", tags=["pnl"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
