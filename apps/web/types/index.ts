// ─── Enums ────────────────────────────────────────────────────────────────
export type StockFlag = "ok" | "warning" | "critical";
export type DebtStatus = "ok" | "warning" | "risk" | "critical";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type OrderSource = "manual" | "whatsapp";
export type UserRole = "admin" | "analyst" | "manager" | "branch";
export type AlertLevel = "info" | "warning" | "critical";
export type UploadType = "sales" | "stock";

// ─── Core Entities ────────────────────────────────────────────────────────
export interface Branch {
  id: string;
  name: string;
  code_1c: string;
  active: boolean;
}

export interface Nomenclature {
  id: string;
  code_1c: string;
  name: string;
  category: string;
  unit: string;
  active: boolean;
}

// ─── Dashboard ────────────────────────────────────────────────────────────
export interface DashboardKpis {
  revenue_period: number;
  revenue_period_label: string;
  stock_total: number;
  active_orders: number;
  critical_debt: number;
  total_debt: number;
  total_payment: number;
}

export interface BranchOverview {
  branch_id: string;
  branch_name: string;
  sales_total: number;
  debt_amount: number;
  payment_amount: number;
  payment_to_head: number;
  returns_amount: number;
  overdue_days: number;
  debt_status: string;
  stock_amount: number;
  stock_qty: number;
}

export interface NomenclatureTop {
  nomenclature_id: string;
  name: string;
  category: string;
  sales_total: number;
  stock_qty: number;
  stock_amount: number;
  days_supply: number;
  stock_flag: string;
}

export interface Alert {
  id: string;
  level: AlertLevel;
  type: string;
  message: string;
  branch_id: string | null;
  branch_name: string | null;
  created_at: string;
}

export interface BranchSales {
  branch_id: string;
  branch_name: string;
  amount: number;
}

export interface CategorySales {
  category: string;
  amount: number;
}

export interface SlowStockItem {
  nomenclature_id: string;
  name: string;
  category: string;
  stock_qty: number;
  days_supply: number;
  flag: StockFlag;
}

// ─── Sales ────────────────────────────────────────────────────────────────
export interface SaleRow {
  id: string;
  nomenclature_id: string;
  nomenclature_name: string;
  category: string;
  branch_id: string;
  branch_name: string;
  period_date: string;
  amount: number;
}

// ─── Stock ────────────────────────────────────────────────────────────────
export interface StockCategoryTree {
  category: string;
  subcategories: string[];
}

export interface StockRow {
  id: string;
  nomenclature_id: string;
  name: string;
  nomenclature_name: string;
  category: string;
  subcategory: string;
  branch_id: string;
  branch_name: string;
  snapshot_date: string;
  qty: number;
  amount: number;
  sales_sum: number;
  days_supply: number;
  flag: StockFlag;
}

export interface StockMatrixRow {
  nomenclature_id: string;
  name: string;
  category: string;
  branches: Record<string, { qty: number; amount: number; days_supply: number; flag: StockFlag }>;
}

// ─── Sales breakdown ──────────────────────────────────────────────────────
export interface SaleByBranchProduct {
  branch_id: string;
  branch_name: string;
  nomenclature_id: string;
  nomenclature_name: string;
  category: string;
  total_amount: number;
}

export interface SaleByBranch {
  branch_id: string;
  branch_name: string;
  total_amount: number;
}

// ─── Debts ────────────────────────────────────────────────────────────────
export interface DebtRow {
  id: string;
  branch_id: string;
  branch_name: string;
  period_date: string;
  debt_amount: number;
  payment_amount: number;
  payment_to_head: number;
  returns_amount: number;
  overdue_days: number;
  status: DebtStatus;
}

// ─── Uploads ──────────────────────────────────────────────────────────────
export interface UploadRecord {
  id: string;
  upload_type: UploadType;
  filename: string;
  period_date: string;
  rows_processed: number;
  status: string;
  uploaded_at: string;
}

export interface UploadResponse {
  upload_id: string;
  rows_processed: number;
  period_date: string;
  status: string;
  errors: string[];
}

// ─── Orders ───────────────────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  nomenclature_id: string;
  nomenclature_name: string;
  qty: number;
  price: number;
  amount: number;
  in_stock: boolean;
}

export interface Order {
  id: string;
  number: string;
  branch_id: string;
  branch_name: string;
  status: OrderStatus;
  comment: string | null;
  total_amount: number;
  source: OrderSource;
  created_at: string;
  items: OrderItem[];
}

export interface CreateOrderPayload {
  branch_id: string;
  comment?: string;
  items: {
    nomenclature_id: string;
    qty: number;
    price: number;
  }[];
}

// ─── API Generics ─────────────────────────────────────────────────────────
export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiError {
  detail: string;
  code?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────
export interface SalesFilters {
  branch_id?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface StockFilters {
  branch_id?: string;
  category?: string;
  subcategory?: string;
  flag?: StockFlag;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface OrderFilters {
  status?: OrderStatus;
  branch_id?: string;
  page?: number;
  page_size?: number;
}
