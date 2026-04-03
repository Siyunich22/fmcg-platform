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
  ChevronDown, ChevronRight, Search, X,
} from "lucide-react";

const BRANCH_ORDER = [
  "ALMATY", "BEREКЕ", "MAIN", "AKTAU", "AKTOBE", "ATYRAU",
  "ASTANA", "KARAGANDA", "KOKSHETAU", "KOSTANAY", "SEMEY",
  "SHYMKENT", "PAVLODAR", "URALSK",
];

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}

// ── Upload block ──────────────────────────────────────────────────────────────
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
    accept: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
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
          {isDragActive ? "Отпустите файл" : "Загрузить файл ТМЗ 1330 (.xls / .xlsx)"}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TmzPage() {
  const { data: dates = [] } = useTmzDates();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const periodDate = selectedDate || undefined;
  const { data: summary = [], refetch: refetchSummary } = useTmzSummary(periodDate);
  const { data: rows = [], isLoading, refetch: refetchRows } = useTmz({
    period_date: periodDate,
    branch: selectedBranch || undefined,
    search: search || undefined,
  });

  function handleUploaded() {
    refetchSummary();
    refetchRows();
    setShowUpload(false);
  }

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Branches list from summary (for filter dropdown)
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

  // KPI from summary
  const grandTotal = summary.reduce((s, r) => s + r.total_amount, 0);
  const grandQty = summary.reduce((s, r) => s + r.total_qty, 0);
  const skuCount = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach(r => seen.add(r.product_name));
    return seen.size;
  }, [rows]);

  // Group rows: branch → sub_branch (or "—") → products
  const grouped = useMemo(() => {
    const map = new Map<string, { branchName: string; subs: Map<string, TmzRow[]> }>();
    for (const row of rows) {
      const bKey = row.branch_code;
      const sub = row.sub_branch || "";
      if (!map.has(bKey)) map.set(bKey, { branchName: row.branch_name, subs: new Map() });
      const entry = map.get(bKey)!;
      if (!entry.subs.has(sub)) entry.subs.set(sub, []);
      entry.subs.get(sub)!.push(row);
    }
    // Sort branches by BRANCH_ORDER
    return [...map.entries()].sort((a, b) => {
      const ai = BRANCH_ORDER.indexOf(a[0]);
      const bi = BRANCH_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [rows]);

  const isEmpty = !isLoading && rows.length === 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">ТМЗ — Остатки</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={() => setShowUpload(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Upload size={14} />Загрузить файл
          </button>
        </div>
      </div>

      {showUpload && <UploadBlock onUploaded={handleUploaded} />}

      {/* KPI cards (Stock-style) */}
      {summary.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Итого ТМЗ</div>
              <div className="text-2xl font-black text-emerald-700">{fmt(grandTotal)}</div>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <Package size={20} className="text-blue-500 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Количество</div>
              <div className="text-2xl font-black text-blue-700">{grandQty.toLocaleString("ru")} шт</div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <Package size={20} className="text-amber-500 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Позиций (SKU)</div>
              <div className="text-2xl font-black text-amber-700">{skuCount.toLocaleString("ru")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters (Stock-style) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по товару..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все филиалы</option>
          {branches.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        {(search || selectedBranch) && (
          <button
            onClick={() => { setSearch(""); setSelectedBranch(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <X size={11} />Сбросить
          </button>
        )}
        <div className="ml-auto text-sm text-gray-400 self-center tabular-nums">
          {rows.length.toLocaleString("ru")} позиций
        </div>
      </div>

      {/* Grouped table (Stock-style) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-900">Остатки по товарам</span>
          <span className="text-xs text-gray-400 font-mono">({rows.length.toLocaleString("ru")} поз.)</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
            Загрузка...
          </div>
        ) : isEmpty ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить файл»." : "Нет данных по выбранным фильтрам."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Товар</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Кол-во</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([branchCode, { branchName, subs }]) => {
                  const branchKey = `branch-${branchCode}`;
                  const branchRows = [...subs.values()].flat();
                  const branchTotal = branchRows.reduce((s, r) => s + r.amount_end, 0);
                  const branchQty = branchRows.reduce((s, r) => s + r.qty_end, 0);
                  const isCollapsed = collapsed.has(branchKey);

                  return (
                    <>
                      {/* Branch header row */}
                      <tr
                        key={branchKey}
                        className="bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-150"
                        onClick={() => toggleCollapse(branchKey)}
                      >
                        <td className="px-4 py-2.5 text-gray-500">
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-gray-700 text-xs uppercase tracking-wide">
                          {branchName}
                          <span className="ml-2 font-normal text-gray-400 normal-case">
                            {branchRows.length} позиций
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-gray-600">
                          {branchQty.toLocaleString("ru")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-800">
                          {fmt(branchTotal)}
                        </td>
                      </tr>

                      {!isCollapsed && [...subs.entries()].map(([sub, subRows]) => {
                        const subKey = `sub-${branchCode}-${sub}`;
                        const hasSubBranch = sub !== "";
                        const subTotal = subRows.reduce((s, r) => s + r.amount_end, 0);
                        const subQty = subRows.reduce((s, r) => s + r.qty_end, 0);
                        const isSubCollapsed = collapsed.has(subKey);

                        return (
                          <>
                            {/* Sub-branch header (only if sub_branch exists) */}
                            {hasSubBranch && (
                              <tr
                                key={subKey}
                                className="bg-blue-50/40 border-b border-blue-100/50 cursor-pointer hover:bg-blue-50"
                                onClick={() => toggleCollapse(subKey)}
                              >
                                <td className="pl-8 py-2 text-blue-400">
                                  {isSubCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </td>
                                <td className="px-4 py-2 text-xs font-semibold text-blue-700">
                                  {sub}
                                  <span className="ml-2 font-normal text-blue-400">{subRows.length} поз.</span>
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-xs text-blue-600">
                                  {subQty.toLocaleString("ru")}
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-xs font-semibold text-blue-700">
                                  {fmt(subTotal)}
                                </td>
                              </tr>
                            )}

                            {/* Product rows */}
                            {(!hasSubBranch || !isSubCollapsed) && subRows.map((row, i) => (
                              <tr
                                key={row.id}
                                className={cn(
                                  "border-b border-gray-50 hover:bg-gray-50/60",
                                  i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                                )}
                              >
                                <td></td>
                                <td className={cn("px-4 py-2.5 text-gray-900 max-w-[480px]", hasSubBranch ? "pl-12" : "pl-8")}>
                                  <div className="truncate text-sm">{row.product_name}</div>
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-gray-700 text-sm">
                                  {row.qty_end > 0 ? row.qty_end.toLocaleString("ru") : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900 text-sm">
                                  {row.amount_end !== 0 ? fmt(row.amount_end) : <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-200">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">
                    Итого
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                    {rows.reduce((s, r) => s + r.qty_end, 0).toLocaleString("ru")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                    {fmt(rows.reduce((s, r) => s + r.amount_end, 0))}
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
