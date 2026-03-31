"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  useSalesReportDates, useSalesReportBranches, useSalesReportSummary,
  useSalesReportRows, useSalesReportTotals, useUploadSalesReport,
  type SalesReportRow, type SalesReportSummaryRow,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Upload, CheckCircle, XCircle, Loader2,
  ChevronRight, ChevronDown, Search, X,
} from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}
function fmtQty(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Upload block ──────────────────────────────────────────────────────────────
function UploadBlock({ onUploaded }: { onUploaded: () => void }) {
  const upload = useUploadSalesReport();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ rows: number; branches: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setState("loading");
    try {
      const res = await upload.mutateAsync(accepted[0]);
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
    multiple: false,
    disabled: state === "loading",
  });

  return (
    <div {...getRootProps()} className={cn(
      "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
      isDragActive ? "border-blue-500 bg-blue-50"
      : state === "success" ? "border-green-400 bg-green-50"
      : state === "error" ? "border-red-300 bg-red-50"
      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
    )}>
      <input {...getInputProps()} />
      {state === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <Loader2 size={18} className="animate-spin text-blue-500" />Обрабатываем файл...
        </div>
      ) : state === "success" && result ? (
        <div className="flex flex-col items-center gap-1">
          <CheckCircle size={22} className="text-green-500" />
          <div className="text-sm font-bold text-green-700">Загружено {result.rows.toLocaleString("ru")} строк</div>
          <div className="text-xs text-gray-500">Филиалы: {result.branches.join(", ")}</div>
          <button className="text-xs text-blue-600 hover:underline mt-1" onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Загрузить ещё</button>
        </div>
      ) : state === "error" ? (
        <div className="flex flex-col items-center gap-1">
          <XCircle size={22} className="text-red-500" />
          <div className="text-sm font-bold text-red-600">Ошибка загрузки</div>
          <div className="text-xs text-red-500">{errorMsg}</div>
          <button className="text-xs text-blue-600 hover:underline mt-1" onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Попробовать снова</button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Upload size={16} />
          {isDragActive ? "Отпустите файл" : "Загрузить отчёт продаж (.xlsx)"}
        </div>
      )}
    </div>
  );
}

// ── Category tree ─────────────────────────────────────────────────────────────
interface TreeNode {
  cat1: string;
  cat2s: {
    cat2: string | null;
    cat3s: {
      cat3: string | null;
      amount: number;
      qty: number;
    }[];
    amount: number;
    qty: number;
  }[];
  amount: number;
  qty: number;
}

function buildTree(summary: SalesReportSummaryRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const r of summary) {
    const c1 = r.cat1 ?? "Прочее";
    if (!map.has(c1)) map.set(c1, { cat1: c1, cat2s: [], amount: 0, qty: 0 });
    const node = map.get(c1)!;
    node.amount += r.amount;
    node.qty += r.qty;

    const c2 = r.cat2 ?? null;
    let sub = node.cat2s.find(x => x.cat2 === c2);
    if (!sub) { sub = { cat2: c2, cat3s: [], amount: 0, qty: 0 }; node.cat2s.push(sub); }
    sub.amount += r.amount;
    sub.qty += r.qty;

    const c3 = r.cat3 ?? null;
    let sub3 = sub.cat3s.find(x => x.cat3 === c3);
    if (!sub3) { sub3 = { cat3: c3, amount: 0, qty: 0 }; sub.cat3s.push(sub3); }
    sub3.amount += r.amount;
    sub3.qty += r.qty;
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function CategoryTree({
  summary, onSelectCat1, onSelectCat2, selectedCat1, selectedCat2,
}: {
  summary: SalesReportSummaryRow[];
  onSelectCat1: (c: string | null) => void;
  onSelectCat2: (c: string | null) => void;
  selectedCat1: string | null;
  selectedCat2: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(summary), [summary]);

  function toggle(key: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  }

  const grandTotal = tree.reduce((s, n) => s + n.amount, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Grand total */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Итого реализация</div>
        <div className="text-base font-black text-gray-900">{fmt(grandTotal)}</div>
      </div>

      <div className="divide-y divide-gray-50">
        {tree.map((node) => {
          const isExp = expanded.has(node.cat1);
          const isSelected = selectedCat1 === node.cat1;
          return (
            <div key={node.cat1}>
              {/* cat1 row */}
              <div
                className={cn("flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer select-none",
                  isSelected && "bg-blue-50")}
                onClick={() => { onSelectCat1(isSelected ? null : node.cat1); onSelectCat2(null); }}
              >
                <button className="text-gray-400 flex-shrink-0" onClick={(e) => { e.stopPropagation(); toggle(node.cat1); }}>
                  {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className={cn("flex-1 text-sm font-semibold", isSelected ? "text-blue-700" : "text-gray-800")}>
                  {node.cat1}
                </span>
                <span className="text-xs text-gray-400 mr-2">{fmtQty(node.qty)} шт</span>
                <span className={cn("text-sm font-bold", isSelected ? "text-blue-700" : "text-gray-900")}>{fmt(node.amount)}</span>
              </div>

              {/* cat2 rows */}
              {isExp && node.cat2s.map((sub) => {
                const key2 = `${node.cat1}__${sub.cat2}`;
                const isSel2 = selectedCat2 === sub.cat2 && selectedCat1 === node.cat1;
                return (
                  <div
                    key={key2}
                    className={cn("flex items-center gap-2 pl-10 pr-4 py-2 hover:bg-gray-50 cursor-pointer select-none",
                      isSel2 && "bg-blue-50/60")}
                    onClick={() => {
                      onSelectCat1(node.cat1);
                      onSelectCat2(isSel2 ? null : sub.cat2);
                    }}
                  >
                    <span className={cn("flex-1 text-sm", isSel2 ? "text-blue-600 font-medium" : "text-gray-600")}>
                      {sub.cat2 ?? "—"}
                    </span>
                    <span className="text-xs text-gray-400 mr-2">{fmtQty(sub.qty)} шт</span>
                    <span className={cn("text-sm font-semibold", isSel2 ? "text-blue-600" : "text-gray-700")}>{fmt(sub.amount)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Products table ────────────────────────────────────────────────────────────
function ProductsTable({ rows, search }: { rows: SalesReportRow[]; search: string }) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  if (filtered.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
        Нет данных по выбранным фильтрам
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Наименование</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Категория</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Кол-во</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={row.id} className={cn("border-b border-gray-50 hover:bg-gray-50/60", i % 2 === 0 ? "bg-white" : "bg-gray-50/30")}>
                <td className="px-4 py-2.5 text-xs text-gray-300">{i + 1}</td>
                <td className="px-4 py-2.5 text-gray-800 max-w-[340px] truncate">{row.name}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  {[row.cat1, row.cat2].filter(Boolean).join(" › ")}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{row.branch_name}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmtQty(row.qty)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{fmt(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-gray-200">
              <td colSpan={4} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Итого по таблице</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                {fmtQty(filtered.reduce((s, r) => s + r.qty, 0))}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                {fmt(filtered.reduce((s, r) => s + r.amount, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SalesReportPage() {
  const { data: dates = [] } = useSalesReportDates();
  const { data: branchList = [] } = useSalesReportBranches();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedCat1, setSelectedCat1] = useState<string | null>(null);
  const [selectedCat2, setSelectedCat2] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const params = {
    period_date: selectedDate || undefined,
    branch_code: selectedBranch || undefined,
  };

  const { data: summary = [], isLoading: summaryLoading } = useSalesReportSummary({
    ...params, is_bonus: false,
  });
  const { data: bonusSummary = [] } = useSalesReportSummary({
    ...params, is_bonus: true,
  });
  const { data: rows = [], isLoading: rowsLoading } = useSalesReportRows({
    ...params,
    cat1: selectedCat1 ?? undefined,
    cat2: selectedCat2 ?? undefined,
    is_bonus: false,
    search: search || undefined,
  });
  const { data: bonusRows = [] } = useSalesReportRows({
    ...params,
    cat1: selectedCat1 ?? undefined,
    cat2: selectedCat2 ?? undefined,
    is_bonus: true,
    search: search || undefined,
  });

  const bonusTotal = useMemo(() => bonusSummary.reduce((s, r) => s + r.amount, 0), [bonusSummary]);

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Отчёт продаж</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Все филиалы</option>
            {branchList.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700")}>
            <Upload size={14} />Загрузить файл
          </button>
        </div>
      </div>

      {showUpload && (
        <UploadBlock onUploaded={() => { setShowUpload(false); }} />
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Поиск по названию..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        {(selectedCat1 || selectedCat2) && (
          <button onClick={() => { setSelectedCat1(null); setSelectedCat2(null); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            Сбросить фильтр
          </button>
        )}
        {selectedCat1 && (
          <div className="flex items-center gap-1 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
            {selectedCat1}{selectedCat2 && <> › {selectedCat2}</>}
          </div>
        )}
        <div className="ml-auto text-sm text-gray-400">{rows.length.toLocaleString("ru")} позиций</div>
      </div>

      {summaryLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : summary.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <TrendingUp size={32} className="text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm">
            {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить файл»." : "Нет данных по выбранным фильтрам."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: category tree */}
          <div className="space-y-4">
            <CategoryTree
              summary={summary}
              selectedCat1={selectedCat1}
              selectedCat2={selectedCat2}
              onSelectCat1={setSelectedCat1}
              onSelectCat2={setSelectedCat2}
            />
          </div>

          {/* Right: products */}
          <div className="space-y-6">
            {rowsLoading ? (
              <div className="flex items-center justify-center h-40 text-gray-400">
                <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
              </div>
            ) : (
              <ProductsTable rows={rows} search={search} />
            )}

            {/* Бонусы section */}
            {bonusRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                    БОНУСЫ
                  </div>
                  <div className="text-sm text-gray-500">
                    Итого бонусы: <span className="font-bold text-gray-800">{fmtQty(bonusRows.reduce((s,r)=>s+r.qty,0))} шт</span>
                    {bonusTotal > 0 && <> · <span className="font-bold text-gray-800">{fmt(bonusTotal)}</span></>}
                  </div>
                </div>
                <div className="bg-white border border-amber-100 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-amber-50/50 border-b border-amber-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Наименование</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Категория</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Кол-во</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusRows.map((row, i) => (
                          <tr key={row.id} className={cn("border-b border-gray-50 hover:bg-amber-50/30", i % 2 === 0 ? "bg-white" : "bg-amber-50/10")}>
                            <td className="px-4 py-2.5 text-xs text-gray-300">{i + 1}</td>
                            <td className="px-4 py-2.5 text-gray-800 max-w-[340px] truncate">{row.name}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-400">{[row.cat1, row.cat2].filter(Boolean).join(" › ")}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded px-1.5 py-0.5">{row.branch_name}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmtQty(row.qty)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                              {row.amount > 0 ? fmt(row.amount) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
