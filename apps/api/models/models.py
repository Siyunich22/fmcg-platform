import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Numeric, Integer, Date,
    DateTime, ForeignKey, Text, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db import Base
import enum


class UploadType(str, enum.Enum):
    sales = "sales"
    stock = "stock"


class StockFlag(str, enum.Enum):
    ok = "ok"
    warning = "warning"
    critical = "critical"


class DebtStatus(str, enum.Enum):
    ok = "ok"
    warning = "warning"
    risk = "risk"
    critical = "critical"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class OrderSource(str, enum.Enum):
    manual = "manual"
    whatsapp = "whatsapp"


class UserRole(str, enum.Enum):
    admin = "admin"
    analyst = "analyst"
    manager = "manager"
    branch = "branch"


class AlertLevel(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Branch(Base):
    __tablename__ = "branches"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    code_1c = Column(String(20), unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Nomenclature(Base):
    __tablename__ = "nomenclature"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code_1c = Column(String(50), unique=True, nullable=False)
    name = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, default="ПРОЧЕЕ")
    subcategory = Column(String(100), nullable=False, default="ПРОЧЕЕ")
    is_aggregate = Column(Boolean, default=False)
    unit = Column(String(20), default="шт")
    active = Column(Boolean, default=True)


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.analyst)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Upload(Base):
    __tablename__ = "uploads"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_type = Column(SAEnum(UploadType), nullable=False)
    filename = Column(Text, nullable=False)
    period_date = Column(Date, nullable=False)
    rows_processed = Column(Integer, default=0)
    status = Column(String(20), default="ok")
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    error_log = Column(JSONB, nullable=True)


class Sale(Base):
    __tablename__ = "sales"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id = Column(UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"))
    nomenclature_id = Column(UUID(as_uuid=True), ForeignKey("nomenclature.id"))
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"))
    period_date = Column(Date, nullable=False)
    amount = Column(Numeric(15, 2), default=0)


class Stock(Base):
    __tablename__ = "stock"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id = Column(UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"))
    nomenclature_id = Column(UUID(as_uuid=True), ForeignKey("nomenclature.id"))
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"))
    snapshot_date = Column(Date, nullable=False)
    qty = Column(Numeric(12, 3), default=0)
    amount = Column(Numeric(15, 2), default=0)
    sales_sum = Column(Numeric(15, 2), default=0)
    days_supply = Column(Integer, default=9999)
    flag = Column(SAEnum(StockFlag), default=StockFlag.ok)


class Debt(Base):
    __tablename__ = "debts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id = Column(UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"))
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"))
    period_date = Column(Date, nullable=False)
    debt_amount = Column(Numeric(15, 2), default=0)
    payment_amount = Column(Numeric(15, 2), default=0)
    payment_to_head = Column(Numeric(15, 2), default=0)
    returns_amount = Column(Numeric(15, 2), default=0)
    overdue_days = Column(Integer, default=0)
    status = Column(SAEnum(DebtStatus), default=DebtStatus.ok)


class Order(Base):
    __tablename__ = "orders"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number = Column(String(20), unique=True, nullable=False)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"))
    status = Column(SAEnum(OrderStatus), default=OrderStatus.pending)
    comment = Column(Text, nullable=True)
    total_amount = Column(Numeric(15, 2), default=0)
    source = Column(SAEnum(OrderSource), default=OrderSource.manual)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"))
    nomenclature_id = Column(UUID(as_uuid=True), ForeignKey("nomenclature.id"))
    qty = Column(Numeric(10, 3), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    in_stock = Column(Boolean, default=True)
    order = relationship("Order", back_populates="items")


class OsvEntry(Base):
    __tablename__ = "osv_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account = Column(String(4), nullable=False)        # 1210 / 3310 / 1710
    branch_name = Column(String(100), nullable=False)  # from filename
    period_date = Column(Date, nullable=False)
    counterparty = Column(Text, nullable=False)
    saldo_start_dt = Column(Numeric(18, 2), default=0)
    saldo_start_kt = Column(Numeric(18, 2), default=0)
    oborot_dt = Column(Numeric(18, 2), default=0)
    oborot_kt = Column(Numeric(18, 2), default=0)
    saldo_end_dt = Column(Numeric(18, 2), default=0)
    saldo_end_kt = Column(Numeric(18, 2), default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class TmzEntry(Base):
    __tablename__ = "tmz_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_code = Column(String(20), nullable=False)   # ALMATY, AKTAU, etc.
    sub_branch = Column(String(50), nullable=True)     # Fighter, Брак, etc.
    product_name = Column(Text, nullable=False)
    qty_end = Column(Numeric(14, 3), default=0)
    amount_end = Column(Numeric(18, 2), default=0)
    period_date = Column(Date, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class SalesReportEntry(Base):
    __tablename__ = "sales_report_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_date = Column(Date, nullable=False)
    code = Column(String(50))
    name = Column(Text, nullable=False)
    cat1 = Column(String(300))   # top category (e.g. ВАРЕНЬЕ)
    cat2 = Column(String(300))   # subcategory
    cat3 = Column(String(300))   # sub-subcategory
    cat4 = Column(String(300))   # sub-sub-subcategory
    is_bonus = Column(Boolean, default=False)
    branch_code = Column(String(20), nullable=False)
    qty = Column(Numeric(14, 3), default=0)
    amount = Column(Numeric(18, 2), default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class CashFlowEntry(Base):
    __tablename__ = "cash_flow_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_date = Column(Date, nullable=False)
    branch_name = Column(String(100), nullable=False)
    branch_code = Column(String(20), nullable=False)
    amount = Column(Numeric(18, 2), default=0)
    period_date = Column(Date, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class ProductCost(Base):
    """Unit cost (себестоимость) per product code."""
    __tablename__ = "product_costs"
    code = Column(String(50), primary_key=True)
    name = Column(Text, nullable=True)
    unit_cost = Column(Numeric(14, 2), default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FotSetting(Base):
    """ФОТ (payroll) setting — a single row with id=1."""
    __tablename__ = "fot_settings"
    id = Column(Integer, primary_key=True, default=1)
    pct = Column(Numeric(5, 2), default=25.00)   # % of реализация
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentSetting(Base):
    """Legacy single-row rent per branch — kept for migration only."""
    __tablename__ = "rent_settings"
    branch_code = Column(String(20), primary_key=True)
    area_sqm = Column(Numeric(10, 2), default=0)
    price_per_sqm = Column(Numeric(14, 2), default=0)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HqFotItem(Base):
    """Head-office payroll line: one row per person/role with fixed + motivation."""
    __tablename__ = "hq_fot_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    fixed_amount = Column(Numeric(14, 2), default=0)
    motivation_amount = Column(Numeric(14, 2), default=0)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentItem(Base):
    """Rent line item per branch: multiple rows per branch (office, warehouse, etc.)."""
    __tablename__ = "rent_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_code = Column(String(20), nullable=False)
    label = Column(String(100), nullable=False, default="Офис")
    area_sqm = Column(Numeric(10, 2), default=0)
    price_per_sqm = Column(Numeric(14, 2), default=0)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PnlExpense(Base):
    """Manual expense/cost entries for P&L per branch per period."""
    __tablename__ = "pnl_expenses"
    id = Column(Integer, primary_key=True, autoincrement=True)
    period_date = Column(Date, nullable=False)
    branch_code = Column(String(20), nullable=False, default="ALL")
    category = Column(String(100), nullable=False)
    sort_order = Column(Integer, default=100)
    amount_actual = Column(Numeric(14, 2), default=0)
    amount_plan = Column(Numeric(14, 2), nullable=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("period_date", "branch_code", "category", name="uq_pnl_expense"),)


class PnlTarget(Base):
    """Revenue / KPI targets per branch per period."""
    __tablename__ = "pnl_targets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    period_date = Column(Date, nullable=False)
    branch_code = Column(String(20), nullable=False, default="ALL")
    revenue_plan = Column(Numeric(14, 2), nullable=True)
    basket_plan = Column(Numeric(14, 2), nullable=True)   # target avg order ₸
    sku_plan = Column(Integer, nullable=True)              # target active SKU count
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("period_date", "branch_code", name="uq_pnl_target"),)


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    level = Column(SAEnum(AlertLevel), nullable=False)
    type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
