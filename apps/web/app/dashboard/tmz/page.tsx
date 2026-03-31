"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  useTmz, useTmzDates, useTmzSummary, useUploadTmzFiles,
  type TmzRow, type TmzSummaryRow,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  Package, Upload, CheckCircle, XCircle, Loader2,
  ChevronUp, ChevronDown, Search, X,
} from "lucide-react";
type SortKey = "product_name" | "branch_name" | "qty_end" | "amount_end";

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}
type SortDir = "asc" | "desc";

const BRANCH_ORDER = [
  "ALMATY", "BEREКЕ", "MAIN", "AKTAU", "AKTOBE", "ATYRAU",
  "ASTANA", "KARAGANDA", "KOKSHETAU", "KOSTANAY", "SEMEY",
  "SHYMKENT", "PAVLODAR", "URALSK",
];

function UploadBlock({ onUploaded }: { onUploaded: () => void }) {
  const upload = useUploadTmzFiles();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ rows: number; branches: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setState("loading");
    try {
      const res = await upload.mutateAsync(accepted);
      setResult({ rows: res.rows, branches: res.branches });
      setState("success");
      onUploaded();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Ошибка загрузки");
      setState("error");
    }
  }, [upload, onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: true,
    disabled: state === "loading",
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
        isDragActive ? "border-blue-500 bg-blue-50"
        : state === "success" ? "border-green-400 bg-green-50"
        : state === "error" ? "border-red-300 bg-red-50"
        : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
      )}
    >
      <input {...getInputProps()} />
      {state === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <Loader2 size={18} className="animate-spin text-blue-500" />
          Обрабатываем файл...
        </div>
      ) : state === "success" && result ? (
        <div className="flex flex-col items-center gap-1">
          <CheckCircle size={22} className="text-green-500" />
          <div className="text-sm font-bold text-green-700">
            Загружено {result.rows.toLocaleString("ru")} позиций
          </div>
          <div className="text-xs text-gray-500">Филиалы: {result.branches.join(", ")}</div>
          <button className="text-xs text-blue-600 hover:underline mt-1"
            onClick={(e) => { e.stopPropagation(); setState("idle"); }}>
            Загрузить ещё
          </button>
        </div>
      ) : state === "error" ? (
        <div className="flex flex-col items-center gap-1">
          <XCircle size={22} className="text-red-500" />
          <div className="text-sm font-bold text-red-600">Ошибка загрузки</div>
          <div className="text-xs text-red-500">{errorMsg}</div>
          <button className="text-xs text-blue-600 hover:underline mt-1"
            onClick={(e) => { e.stopPropagation(); setState("idle"); }}>
            Попробовать снова
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Upload size={16} />
          {isDragActive ? "Отпустите файл" : "Загрузить файл 1330 ТМЗ (.xls)"}
        </div>
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: TmzSummaryRow[] }) {
  const sorted = useMemo(() => {
    return [...summary].sort((a, b) => {
      const ai = BRANCH_ORDER.indexOf(a.branch_code);
      const bi = BRANCH_ORDER.indexOf(b.branch_code);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return (a.sub_branch ?? "").localeCompare(b.sub_branch ?? "");
    });
  }, [summary]);

  const grandTotal = summary.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">Итого по всем филиалам</div>
        <div className="text-xl font-black text-gray-900">{fmt(grandTotal)}</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {sorted.map((r) => (
          <div key={`${r.branch_code}-${r.sub_branch ?? ""}`}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-xs font-semibold text-gray-500 truncate">
              {r.branch_name}{r.sub_branch ? ` · ${r.sub_branch}` : ""}
            </div>
            <div className="text-sm font-black text-gray-900 mt-0.5">{fmt(r.total_amount)}</div>
            <div className="text-xs text-gray-400">{r.total_qty.toLocaleString("ru")} шт · {r.sku_count} SKU</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp size={12} className="text-gray-300" />;
  return sortDir === "asc" ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />;
}

export default function TmzPage() {
  const { data: dates = [] } = useTmzDates();
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Auto-select the first available date when dates load
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("amount_end");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showUpload, setShowUpload] = useState(false);

  const periodDate = selectedDate || dates[0] || undefined;
  const { data: summary = [], refetch: refetchSummary } = useTmzSummary(periodDate);
  const { data: rows = [], isLoading, refetch: refetchRows } = useTmz({
    period_date: periodDate,
    branch: selectedBranch || undefined,
    search: search || undefined,
  });

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    summary.forEach((r) => {
      if (!r.sub_branch) map.set(r.branch_code, r.branch_name);
    });
    return [...map.entries()].sort((a, b) => {
      const ai = BRANCH_ORDER.indexOf(a[0]);
      const bi = BRANCH_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [summary]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av: string | number = a[sortKey] ?? "";
      let bv: string | number = b[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "amount_end" || key === "qty_end" ? "desc" : "asc");
    }
  }

  function handleUploaded() {
    refetchSummary();
    refetchRows();
    setShowUpload(false);
  }

  const filteredSummary = useMemo(() => {
    if (!selectedBranch) return summary;
    return summary.filter(r => r.branch_code === selectedBranch);
  }, [summary, selectedBranch]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">ТМЗ — Остатки (1330)</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Upload size={14} />
            Загрузить файл
          </button>
        </div>
      </div>

      {/* Upload */}
      {showUpload && (
        <UploadBlock onUploaded={handleUploaded} />
      )}

      {/* Summary cards */}
      {summary.length > 0 && <SummaryCards summary={filteredSummary.length > 0 && selectedBranch ? filteredSummary : summary} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все филиалы</option>
          {branches.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>

        {(search || selectedBranch) && (
          <button onClick={() => { setSearch(""); setSelectedBranch(""); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            Сбросить
          </button>
        )}

        <div className="ml-auto text-sm text-gray-400 self-center">
          {sorted.length.toLocaleString("ru")} позиций
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Загрузка...
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="text-gray-200 mx-auto mb-3" />
            <div className="text-gray-400 text-sm">
              {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить файл»." : "Нет данных по выбранным фильтрам."}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort("product_name")}
                  >
                    <div className="flex items-center gap-1">
                      Наименование <SortIcon col="product_name" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort("branch_name")}
                  >
                    <div className="flex items-center gap-1">
                      Филиал <SortIcon col="branch_name" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort("qty_end")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Кол-во <SortIcon col="qty_end" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort("amount_end")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Сумма <SortIcon col="amount_end" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id} className={cn("border-b border-gray-50 hover:bg-gray-50/60", i % 2 === 0 ? "bg-white" : "bg-gray-50/30")}>
                    <td className="px-4 py-2.5 text-xs text-gray-300">{i + 1}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-[400px]">
                      {row.product_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700 font-medium">{row.branch_name}</span>
                        {row.sub_branch && (
                          <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-1.5 py-0.5 font-semibold">
                            {row.sub_branch}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                      {row.qty_end > 0 ? row.qty_end.toLocaleString("ru") : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                      {row.amount_end !== 0 ? fmt(row.amount_end) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">
                    Итого по таблице
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                    {sorted.reduce((s, r) => s + r.qty_end, 0).toLocaleString("ru")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                    {fmt(sorted.reduce((s, r) => s + r.amount_end, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
