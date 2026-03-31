import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, upload, dashboard, sales, stock, debts, orders, branches, tmz
from db import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
