import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, uploadFile } from "@/lib/api";
import type {
  DashboardKpis, Alert, BranchSales, CategorySales, SlowStockItem,
  BranchOverview, NomenclatureTop,
  ListResponse, SaleRow, StockRow, StockMatrixRow, StockCategoryTree, DebtRow,
  SaleByBranchProduct, SaleByBranch,
  Order, UploadRecord, UploadResponse, CreateOrderPayload,
  SalesFilters, StockFilters, OrderFilters, OrderStatus,
} from "@/types";

// ─── Dashboard ────────────────────────────────────────────────────────────
export const useDashboardKpis = () =>
  useQuery<DashboardKpis>({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => api.get("/api/dashboard/kpis").then((r) => r.data),
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
  });

export const useAlerts = () =>
  useQuery<Alert[]>({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => api.get("/api/dashboard/alerts").then((r) => r.data),
  });

export const useSalesByBranch = () =>
  useQuery<BranchSales[]>({
    queryKey: ["dashboard", "sales-by-branch"],
    queryFn: () => api.get("/api/dashboard/sales-by-branch").then((r) => r.data),
  });

export const useSalesByCategory = () =>
  useQuery<CategorySales[]>({
    queryKey: ["dashboard", "sales-by-category"],
    queryFn: () => api.get("/api/dashboard/sales-by-category").then((r) => r.data),
  });

export const useTopSlowStock = (limit = 10) =>
  useQuery<SlowStockItem[]>({
    queryKey: ["dashboard", "slow-stock", limit],
    queryFn: () =>
      api.get("/api/dashboard/top-slow-stock", { params: { limit } }).then((r) => r.data),
  });

// ─── Sales ────────────────────────────────────────────────────────────────
export const useSales = (filters: SalesFilters = {}) =>
  useQuery<ListResponse<SaleRow>>({
    queryKey: ["sales", filters],
    queryFn: () => api.get("/api/sales", { params: filters }).then((r) => r.data),
  });

// ─── Stock ────────────────────────────────────────────────────────────────
export const useStock = (filters: StockFilters = {}) =>
  useQuery<StockRow[]>({
    queryKey: ["stock", filters],
    queryFn: () => api.get("/api/stock", { params: filters }).then((r) => r.data),
  });

export const useStockCategories = () =>
  useQuery<StockCategoryTree[]>({
    queryKey: ["stock", "categories"],
    queryFn: () => api.get("/api/stock/categories").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useStockMatrix = (params: { category?: string } = {}) =>
  useQuery<StockMatrixRow[]>({
    queryKey: ["stock", "matrix", params],
    queryFn: () => api.get("/api/stock/matrix", { params }).then((r) => r.data),
  });

export const useBranches = () =>
  useQuery<import("@/types").Branch[]>({
    queryKey: ["branches"],
    queryFn: () => api.get("/api/branches").then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  });

export const useBranchesOverview = () =>
  useQuery<BranchOverview[]>({
    queryKey: ["dashboard", "branches-overview"],
    queryFn: () => api.get("/api/dashboard/branches-overview").then((r) => r.data),
  });

export const useTopNomenclature = (params: { branch_id?: string; category?: string; limit?: number } = {}) =>
  useQuery<NomenclatureTop[]>({
    queryKey: ["dashboard", "top-nomenclature", params],
    queryFn: () => api.get("/api/dashboard/top-nomenclature", { params }).then((r) => r.data),
  });

export const useSalesByBranchProduct = (params: { branch_id?: string; category?: string } = {}) =>
  useQuery<SaleByBranchProduct[]>({
    queryKey: ["sales", "by-branch-product", params],
    queryFn: () => api.get("/api/sales/by-branch-product", { params }).then((r) => r.data),
  });

export const useSalesByBranchSummary = () =>
  useQuery<SaleByBranch[]>({
    queryKey: ["sales", "by-branch"],
    queryFn: () => api.get("/api/sales/by-branch").then((r) => r.data),
  });

// ─── Debts ────────────────────────────────────────────────────────────────
export const useDebts = (params: { status?: string } = {}) =>
  useQuery<DebtRow[]>({
    queryKey: ["debts", params],
    queryFn: () => api.get("/api/debts", { params }).then((r) => r.data),
  });

// ─── Orders ───────────────────────────────────────────────────────────────
export const useOrders = (filters: OrderFilters = {}) =>
  useQuery<ListResponse<Order>>({
    queryKey: ["orders", filters],
    queryFn: () => api.get("/api/orders", { params: filters }).then((r) => r.data),
  });

export const useOrder = (id: string) =>
  useQuery<Order>({
    queryKey: ["orders", id],
    queryFn: () => api.get(`/api/orders/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useCreateOrder = () => {
  const qc = useQueryClient();
  return useMutation<Order, Error, CreateOrderPayload>({
    mutationFn: (payload) => api.post("/api/orders", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
};

export const useUpdateOrderStatus = () => {
  const qc = useQueryClient();
  return useMutation<Order, Error, { id: string; status: OrderStatus }>({
    mutationFn: ({ id, status }) =>
      api.patch(`/api/orders/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};

// ─── Upload ───────────────────────────────────────────────────────────────
export const useUploadHistory = () =>
  useQuery<UploadRecord[]>({
    queryKey: ["uploads"],
    queryFn: () => api.get("/api/upload/history").then((r) => r.data),
  });

export const useDeleteUpload = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/api/upload/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
};

export const useUploadSales = () => {
  const qc = useQueryClient();
  return useMutation<UploadResponse, Error, File>({
    mutationFn: (file) => uploadFile("/api/upload/sales", file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};

export const useFolderConfig = () =>
  useQuery<{ stock_folder: string; stock_latest_file: { name: string; size_kb: number } | null }>({
    queryKey: ["folder-config"],
    queryFn: () => api.get("/api/upload/folder-config").then((r) => r.data),
  });

export const useSaveFolderConfig = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { stock_folder: string }>({
    mutationFn: (body) => api.post("/api/upload/folder-config", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folder-config"] }),
  });
};

export const useSyncFromFolder = () => {
  const qc = useQueryClient();
  return useMutation<import("@/types").UploadResponse, Error, void>({
    mutationFn: () => api.post("/api/upload/stock/from-folder").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["folder-config"] });
    },
  });
};

// ── OSV hooks ────────────────────────────────────────────────────────────────

export const useOsvFolderConfig = () =>
  useQuery<{ osv_folder: string; file_count: number }>({
    queryKey: ["osv-folder-config"],
    queryFn: () => api.get("/api/upload/osv/folder-config").then((r) => r.data),
  });

export const useSaveOsvFolderConfig = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { osv_folder: string }>({
    mutationFn: (body) => api.post("/api/upload/osv/folder-config", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["osv-folder-config"] }),
  });
};

export const useUploadOsvFiles = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; rows: number; accounts: string[]; branches: string[]; errors: string[] }, Error, File[]>({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await api.post("/api/upload/osv/files", form);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["osv-analysis"] });
      qc.invalidateQueries({ queryKey: ["osv-dates"] });
      qc.invalidateQueries({ queryKey: ["osv-branches"] });
    },
  });
};

export const useScanOsvFolder = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; rows: number; accounts: string[]; branches: string[]; period_dates: string[] }, Error, void>({
    mutationFn: () => api.post("/api/upload/osv/scan-folder").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["osv-analysis"] });
      qc.invalidateQueries({ queryKey: ["osv-dates"] });
      qc.invalidateQueries({ queryKey: ["osv-branches"] });
      qc.invalidateQueries({ queryKey: ["osv-folder-config"] });
    },
  });
};

export const useOsvDates = () =>
  useQuery<string[]>({
    queryKey: ["osv-dates"],
    queryFn: () => api.get("/api/debts/osv/dates").then((r) => r.data),
  });

export const useOsvBranches = (periodDate?: string) =>
  useQuery<string[]>({
    queryKey: ["osv-branches", periodDate],
    queryFn: () =>
      api.get("/api/debts/osv/branches", { params: { period_date: periodDate } }).then((r) => r.data),
  });

export interface OsvAnalysisRow {
  branch_name: string;
  counterparty: string;
  a1210: number;
  a3310: number;
  a1710: number;
  net: number;
}

export interface OsvAnalysisResult {
  period_date: string | null;
  totals: {
    total_1210: number;
    total_3310: number;
    total_1710: number;
    total_net: number;
    count: number;
  };
  rows: OsvAnalysisRow[];
  excluded: OsvAnalysisRow[];
}

export interface OsvByDateRow {
  period_date: string;
  total_net: number;
  total_1210: number;
  total_3310: number;
  total_1710: number;
  count: number;
}

export interface OsvByBranchRow {
  branch_name: string;
  total_net: number;
  total_1210: number;
  total_3310: number;
  total_1710: number;
  count: number;
  share: number;
}

export const useOsvByDate = (onlyPositive: boolean) =>
  useQuery<OsvByDateRow[]>({
    queryKey: ["osv-by-date", onlyPositive],
    queryFn: () =>
      api.get("/api/debts/osv/by-date", { params: { only_positive: onlyPositive } }).then((r) => r.data),
  });

export const useOsvByBranch = (periodDate: string | undefined, onlyPositive: boolean) =>
  useQuery<OsvByBranchRow[]>({
    queryKey: ["osv-by-branch", periodDate, onlyPositive],
    queryFn: () =>
      api.get("/api/debts/osv/by-branch", { params: { period_date: periodDate, only_positive: onlyPositive } }).then((r) => r.data),
    enabled: !!periodDate,
  });

export const useOsvAnalysis = (params: {
  period_date?: string;
  branch_name?: string;
  search?: string;
  only_positive?: boolean;
}) =>
  useQuery<OsvAnalysisResult>({
    queryKey: ["osv-analysis", params],
    queryFn: () =>
      api.get("/api/debts/osv/analysis", { params }).then((r) => r.data),
    enabled: true,
  });

// ── TMZ (1330 ТМЗ) hooks ─────────────────────────────────────────────────────

export interface TmzRow {
  id: string;
  branch_code: string;
  branch_name: string;
  sub_branch: string | null;
  product_name: string;
  qty_end: number;
  amount_end: number;
  period_date: string;
}

export interface TmzSummaryRow {
  branch_code: string;
  branch_name: string;
  sub_branch: string | null;
  total_qty: number;
  total_amount: number;
  sku_count: number;
}

export const useTmzDates = () =>
  useQuery<string[]>({
    queryKey: ["tmz-dates"],
    queryFn: () => api.get("/api/tmz/dates").then((r) => r.data),
  });

export const useTmz = (params: { period_date?: string; branch?: string; search?: string }) =>
  useQuery<TmzRow[]>({
    queryKey: ["tmz", params],
    queryFn: () => api.get("/api/tmz", { params }).then((r) => r.data),
  });

export const useTmzSummary = (periodDate?: string) =>
  useQuery<TmzSummaryRow[]>({
    queryKey: ["tmz-summary", periodDate],
    queryFn: () => api.get("/api/tmz/summary", { params: { period_date: periodDate } }).then((r) => r.data),
  });

export const useUploadTmzFiles = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; rows: number; branches: string[]; period_dates: string[]; errors: string[] }, Error, File[]>({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await api.post("/api/upload/tmz/files", form);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tmz"] });
      qc.invalidateQueries({ queryKey: ["tmz-dates"] });
      qc.invalidateQueries({ queryKey: ["tmz-summary"] });
    },
  });
};

// ── Sales Report hooks ───────────────────────────────────────────────────────

export interface SalesReportRow {
  id: string;
  code: string;
  name: string;
  cat1: string | null;
  cat2: string | null;
  cat3: string | null;
  cat4: string | null;
  is_bonus: boolean;
  branch_code: string;
  branch_name: string;
  qty: number;
  amount: number;
}

export interface SalesReportSummaryRow {
  cat1: string | null;
  cat2: string | null;
  cat3: string | null;
  branch_code: string;
  branch_name: string;
  qty: number;
  amount: number;
}

export interface SalesReportTotal {
  branch_code: string;
  branch_name: string;
  qty: number;
  amount: number;
}

export const useSalesReportDates = () =>
  useQuery<string[]>({
    queryKey: ["sales-report-dates"],
    queryFn: () => api.get("/api/sales-report/dates").then((r) => r.data),
  });

export const useSalesReportBranches = () =>
  useQuery<{ code: string; name: string }[]>({
    queryKey: ["sales-report-branches"],
    queryFn: () => api.get("/api/sales-report/branches").then((r) => r.data),
  });

export const useSalesReportSummary = (params: {
  period_date?: string;
  branch_code?: string;
  is_bonus?: boolean;
}) =>
  useQuery<SalesReportSummaryRow[]>({
    queryKey: ["sales-report-summary", params],
    queryFn: () => api.get("/api/sales-report/summary", { params }).then((r) => r.data),
    enabled: true,
  });

export const useSalesReportRows = (params: {
  period_date?: string;
  branch_code?: string;
  cat1?: string;
  cat2?: string;
  is_bonus?: boolean;
  search?: string;
}) =>
  useQuery<SalesReportRow[]>({
    queryKey: ["sales-report-rows", params],
    queryFn: () => api.get("/api/sales-report/rows", { params }).then((r) => r.data),
    enabled: true,
  });

export const useSalesReportTotals = (params: {
  period_date?: string;
  branch_code?: string;
}) =>
  useQuery<SalesReportTotal[]>({
    queryKey: ["sales-report-totals", params],
    queryFn: () => api.get("/api/sales-report/totals", { params }).then((r) => r.data),
    enabled: true,
  });

export interface SalesReportStats {
  period_date: string | null;
  total_rows: number;
  by_branch: { branch_code: string; branch_name: string; is_bonus: boolean; rows: number; amount: number }[];
  by_cat1: { cat1: string; rows: number; amount: number }[];
}

export const useSalesReportStats = (period_date?: string) =>
  useQuery<SalesReportStats>({
    queryKey: ["sales-report-stats", period_date],
    queryFn: () => api.get("/api/sales-report/stats", { params: { period_date } }).then(r => r.data),
    enabled: true,
  });

export const useClearSalesReport = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; deleted: number }, Error, string>({
    mutationFn: (period_date) =>
      api.delete("/api/sales-report/clear", { params: { period_date } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-report-dates"] });
      qc.invalidateQueries({ queryKey: ["sales-report-summary"] });
      qc.invalidateQueries({ queryKey: ["sales-report-rows"] });
      qc.invalidateQueries({ queryKey: ["sales-report-totals"] });
      qc.invalidateQueries({ queryKey: ["sales-report-branches"] });
      qc.invalidateQueries({ queryKey: ["sales-report-stats"] });
    },
  });
};

export const useUploadSalesReport = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; rows: number; branches: string[] }, Error, File>({
    mutationFn: (file) => {
      const form = new FormData();
      form.append("file", file);
      return api.post("/api/upload/sales-report", form).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-report-dates"] });
      qc.invalidateQueries({ queryKey: ["sales-report-summary"] });
      qc.invalidateQueries({ queryKey: ["sales-report-rows"] });
      qc.invalidateQueries({ queryKey: ["sales-report-totals"] });
      qc.invalidateQueries({ queryKey: ["sales-report-branches"] });
    },
  });
};

// ── Cash Flow hooks ──────────────────────────────────────────────────────────

export interface CashFlowSummaryRow {
  branch_code: string;
  branch_name: string;
  total_amount: number;
  tx_count: number;
  share: number;
}

export const useCashFlowDates = () =>
  useQuery<string[]>({
    queryKey: ["cash-flow-dates"],
    queryFn: () => api.get("/api/cash-flow/dates").then((r) => r.data),
  });

export const useCashFlowSummary = (periodDate?: string) =>
  useQuery<CashFlowSummaryRow[]>({
    queryKey: ["cash-flow-summary", periodDate],
    queryFn: () =>
      api.get("/api/cash-flow/summary", { params: { period_date: periodDate } }).then((r) => r.data),
    staleTime: 0,
    refetchOnMount: true,
  });

export const useUploadCashFlow = () => {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; rows: number; branches: string[]; period_dates: string[]; errors: string[] },
    Error,
    File[]
  >({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await api.post("/api/upload/cash-flow", form);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-flow-summary"] });
      qc.invalidateQueries({ queryKey: ["cash-flow-dates"] });
    },
  });
};

export const useUploadStock = () => {
  const qc = useQueryClient();
  return useMutation<UploadResponse, Error, File>({
    mutationFn: (file) => uploadFile("/api/upload/stock", file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};
