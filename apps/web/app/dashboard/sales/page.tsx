"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import {
  useSalesReportDates, useSalesReportBranches, useSalesReportSummary,
  useSalesReportRows, useSalesReportTotals, useUploadSalesReport,
  useSalesReportStats, useClearSalesReport,
  useTmzSummary, useOsvDates, useOsvByBranch,
  type SalesReportRow, type SalesReportSummaryRow, type SalesReportTotal,
  type TmzSummaryRow, type OsvByBranchRow,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Upload, CheckCircle, XCircle, Loader2,
  ChevronRight, ChevronDown, X,
  Search, Building2, Tag, ShoppingBag, BarChart2,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const C = [
  "#3b82f6","#6366f1","#8b5cf6","#ec4899","#f97316",
  "#eab308","#22c55e","#06b6d4","#f43f5e","#a855f7",
];

type Tab = "overview" | "branches" | "categories" | "products";

// ── Formatters ────────────────────────────────────────────────────────────────
const ru = (n: number) => n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt = (n: number) => ru(n) + " ₸";
const fmtQ = (n: number) => ru(n) + " шт";
const fmtM = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
};

// ── Pivot tree types + builder ────────────────────────────────────────────────
interface Cell { qty: number; amount: number; }
interface PivotNode {
  id: string; label: string; level: 0 | 1 | 2;
  total: Cell; byBranch: Record<string, Cell>;
  children: PivotNode[];
  cat1: string; cat2: string | null; cat3: string | null;
}

function buildPivotTree(rows: SalesReportSummaryRow[]): PivotNode[] {
  const add = (c: Cell, r: SalesReportSummaryRow) => { c.qty += r.qty; c.amount += r.amount; };
  const ens = (m: Record<string, Cell>, k: string) => { if (!m[k]) m[k] = { qty: 0, amount: 0 }; return m[k]; };
  const m1 = new Map<string, { n: PivotNode; m2: Map<string, { n: PivotNode; m3: Map<string, PivotNode> }> }>();
  for (const r of rows) {
    const c1 = r.cat1 ?? "Прочее", c2 = r.cat2, c3 = r.cat3;
    if (!m1.has(c1)) m1.set(c1, { n: { id: c1, label: c1, level: 0, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: null, cat3: null }, m2: new Map() });
    const e1 = m1.get(c1)!; add(e1.n.total, r); add(ens(e1.n.byBranch, r.branch_code), r);
    const k2 = c2 ?? "__";
    if (!e1.m2.has(k2)) e1.m2.set(k2, { n: { id: `${c1}|${k2}`, label: c2 ?? "—", level: 1, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: c2 ?? null, cat3: null }, m3: new Map() });
    const e2 = e1.m2.get(k2)!; add(e2.n.total, r); add(ens(e2.n.byBranch, r.branch_code), r);
    if (c3) {
      if (!e2.m3.has(c3)) e2.m3.set(c3, { id: `${c1}|${k2}|${c3}`, label: c3, level: 2, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: c2 ?? null, cat3: c3 });
      const n3 = e2.m3.get(c3)!; add(n3.total, r); add(ens(n3.byBranch, r.branch_code), r);
    }
  }
  for (const [, e1] of m1) {
    for (const [, e2] of e1.m2) {
      e2.n.children = [...e2.m3.values()].sort((a, b) => b.total.amount - a.total.amount);
      e1.n.children.push(e2.n);
    }
    e1.n.children.sort((a, b) => b.total.amount - a.total.amount);
  }
  return [...m1.values()].map(e => e.n).sort((a, b) => b.total.amount - a.total.amount);
}

// ── Upload + Diagnostics ──────────────────────────────────────────────────────
function UploadBlock({ onDone, selectedDate }: { onDone: () => void; selectedDate: string }) {
  const upload = useUploadSalesReport();
  const clearMut = useClearSalesReport();
  const { data: stats, refetch: refetchStats } = useSalesReportStats(selectedDate || undefined);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ rows: number; branches: string[] } | null>(null);
  const [msg, setMsg] = useState("");

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setState("loading");
    try {
      const res = await upload.mutateAsync(files[0]);
      setResult(res);
      setState("success");
      onDone();
      refetchStats();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Ошибка загрузки");
      setState("error");
    }
  }, [upload, onDone, refetchStats]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false, disabled: state === "loading",
    accept: { "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
  });

  const handleClear = async () => {
    if (!selectedDate || !confirm(`Удалить все данные за ${selectedDate}?`)) return;
    await clearMut.mutateAsync(selectedDate);
    setState("idle");
    setResult(null);
  };

  // Group stats by branch (non-bonus)
  const salesBranches = stats?.by_branch.filter(b => !b.is_bonus) ?? [];
  const bonusBranches = stats?.by_branch.filter(b => b.is_bonus) ?? [];

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div {...getRootProps()} className={cn("border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
        isDragActive ? "border-blue-500 bg-blue-50" : state === "success" ? "border-green-400 bg-green-50"
          : state === "error" ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:border-blue-300")}>
        <input {...getInputProps()} />
        {state === "loading" && <div className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin text-blue-500" />Обрабатываем...</div>}
        {state === "success" && result && (
          <div className="text-sm text-green-700">
            <div className="flex items-center justify-center gap-2 mb-1"><CheckCircle size={15} /><span className="font-semibold">Загружено {result.rows.toLocaleString("ru")} строк</span></div>
            <div className="text-xs text-green-600">Филиалы: {result.branches.map(b => b).join(", ")}</div>
            <button className="text-xs text-blue-600 underline mt-1" onClick={e => { e.stopPropagation(); setState("idle"); }}>Загрузить другой файл</button>
          </div>
        )}
        {state === "error" && <div className="flex items-center justify-center gap-2 text-sm text-red-600"><XCircle size={15} />{msg} <button className="text-xs text-blue-600 underline ml-1" onClick={e => { e.stopPropagation(); setState("idle"); }}>Повторить</button></div>}
        {state === "idle" && <div className="flex items-center justify-center gap-2 text-sm text-gray-500"><Upload size={14} />{isDragActive ? "Отпустите файл" : "Перетащите или нажмите — загрузить отчёт продаж .xlsx"}</div>}
      </div>

      {/* DB Diagnostics */}
      {stats && stats.total_rows > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              В базе за {stats.period_date}: {stats.total_rows.toLocaleString("ru")} строк
            </div>
            <button onClick={handleClear} disabled={clearMut.isPending}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
              {clearMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
              Очистить данные
            </button>
          </div>

          {/* Sales branches */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Продажи по филиалам</div>
            {salesBranches.length === 0
              ? <div className="text-xs text-red-500">⚠ Нет данных по продажам — загрузите файл</div>
              : <div className="flex flex-wrap gap-1.5">
                {salesBranches.map(b => (
                  <div key={b.branch_code} className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                    <span className="text-[10px] font-semibold text-blue-700">{b.branch_name}</span>
                    <span className="text-[9px] text-blue-400">{b.rows} стр</span>
                  </div>
                ))}
              </div>
            }
          </div>

          {/* Categories */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Категории ({stats.by_cat1.length})</div>
            {stats.by_cat1.length === 0
              ? <div className="text-xs text-red-500">⚠ Нет категорий — загрузите файл повторно</div>
              : <div className="flex flex-wrap gap-1.5">
                {stats.by_cat1.slice(0, 15).map(c => (
                  <div key={c.cat1} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                    <span className="text-[10px] font-semibold text-indigo-700">{c.cat1}</span>
                    <span className="text-[9px] text-indigo-400">{c.rows} стр</span>
                  </div>
                ))}
                {stats.by_cat1.length > 15 && <span className="text-[10px] text-gray-400">+{stats.by_cat1.length - 15} ещё</span>}
              </div>
            }
          </div>

          {/* Bonus branches */}
          {bonusBranches.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Бонусы по филиалам</div>
              <div className="flex flex-wrap gap-1.5">
                {bonusBranches.map(b => (
                  <div key={b.branch_code} className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                    <span className="text-[10px] font-semibold text-amber-700">{b.branch_name}</span>
                    <span className="text-[9px] text-amber-400">{b.rows} стр</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stats && stats.total_rows === 0 && selectedDate && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
          ⚠ В базе нет данных за {selectedDate}. Загрузите Excel-файл отчёта продаж.
        </div>
      )}
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────
function ProductModal({ product, allRows, bonusRows, onClose }: {
  product: SalesReportRow; allRows: SalesReportRow[]; bonusRows: SalesReportRow[]; onClose: () => void;
}) {
  const byBranch = useMemo(() => allRows.filter(r => r.code === product.code && !r.is_bonus).sort((a, b) => b.amount - a.amount), [allRows, product.code]);
  const bonuses = useMemo(() => bonusRows.filter(r => r.cat1 === product.cat1).sort((a, b) => b.qty - a.qty).slice(0, 20), [bonusRows, product.cat1]);
  const total = byBranch.reduce((s, r) => s + r.amount, 0);
  const qty = byBranch.reduce((s, r) => s + r.qty, 0);
  const chartData = byBranch.map(r => ({ name: r.branch_name, amount: r.amount, qty: r.qty }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-gray-400">{product.code}</div>
            <div className="text-sm font-bold text-gray-900">{product.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{[product.cat1, product.cat2, product.cat3].filter(Boolean).join(" › ")}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 flex-shrink-0">
          <div><div className="text-[10px] text-gray-400 uppercase">Итого</div><div className="text-base font-black">{fmt(total)}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Кол-во</div><div className="text-base font-black">{fmtQ(qty)}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Филиалов</div><div className="text-base font-black">{byBranch.length}</div></div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {byBranch.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">По филиалам</div>
              <ResponsiveContainer width="100%" height={Math.max(80, byBranch.length * 38)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 50, top: 4, bottom: 4 }}>
                  <XAxis type="number" tickFormatter={v => fmtM(Number(v))} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} width={64} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Сумма"]} />
                  <Bar dataKey="amount" radius={[0, 3, 3, 0]} maxBarSize={24}>
                    {chartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {bonuses.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-2">Бонусы в категории «{product.cat1}»</div>
              {bonuses.map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1 border-b border-amber-50">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                  <span className="text-xs text-gray-700 flex-1 truncate">{r.name}</span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5">{r.branch_name}</span>
                  <span className="text-[11px] font-mono text-gray-500 w-12 text-right">{fmtQ(r.qty)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Custom chart tooltips ─────────────────────────────────────────────────────
function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; amount: number; qty?: number; share?: string }; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-1">{d.payload.name}</div>
      <div className="text-blue-700 font-bold">{fmt(d.value)}</div>
      {d.payload.qty != null && <div className="text-gray-500">{fmtQ(d.payload.qty)}</div>}
      {d.payload.share != null && <div className="text-gray-400">{d.payload.share}% от итого</div>}
    </div>
  );
}
function PieTip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; percent: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-0.5">{payload[0].name}</div>
      <div className="text-blue-700 font-bold">{fmt(payload[0].value)}</div>
      <div className="text-gray-400">{(payload[0].percent * 100).toFixed(1)}%</div>
    </div>
  );
}

// ── TAB 1: Обзор ──────────────────────────────────────────────────────────────
function OverviewTab({ salesTree, totals, grandTotal, bonusTotal, tmzTotal, realisationTotal }: {
  salesTree: PivotNode[]; totals: SalesReportTotal[]; grandTotal: number; bonusTotal: number; tmzTotal: number; realisationTotal: number;
}) {
  const branchData = useMemo(() =>
    [...totals].sort((a, b) => b.amount - a.amount).map((t) => ({
      name: t.branch_name, amount: t.amount, qty: t.qty,
      share: grandTotal > 0 ? (t.amount / grandTotal * 100).toFixed(1) : "0",
    })),
    [totals, grandTotal]);

  const catData = useMemo(() => {
    const top = salesTree.slice(0, 8).map(n => ({
      name: n.label.length > 14 ? n.label.slice(0, 14) + "…" : n.label,
      value: n.total.amount,
    }));
    const rest = salesTree.slice(8).reduce((s, n) => s + n.total.amount, 0);
    if (rest > 0) top.push({ name: "Прочее", value: rest });
    return top;
  }, [salesTree]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Branch bar chart */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} className="text-blue-400" />
            <span className="text-sm font-bold text-gray-800">Продажи по филиалам</span>
          </div>
          {branchData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, branchData.length * 46)}>
              <BarChart data={branchData} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 4 }}>
                <XAxis type="number" tickFormatter={v => fmtM(Number(v))} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} width={76} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={30}>
                  {branchData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Нет данных</div>}
        </div>

        {/* Category donut */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={14} className="text-indigo-400" />
            <span className="text-sm font-bold text-gray-800">Доли категорий</span>
          </div>
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="42%" innerRadius={52} outerRadius={88} dataKey="value" paddingAngle={2}>
                  {catData.map((_, i) => <Cell key={i} fill={C[i % C.length]} stroke="none" />)}
                </Pie>
                <Tooltip content={<PieTip />} />
                <Legend formatter={v => <span style={{ fontSize: 10, color: "#374151" }}>{v}</span>} iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Нет данных</div>}
        </div>
      </div>

      {/* Bonus vs Sales summary bar */}
      {realisationTotal > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Соотношение продажи / бонусы</div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-700">Продажи <span className="font-bold">{fmt(realisationTotal)}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs text-gray-700">Бонусы <span className="font-bold text-amber-600">{fmt(bonusTotal)}</span>
                <span className="text-gray-400 ml-1">({(bonusTotal / (realisationTotal + bonusTotal) * 100).toFixed(1)}%)</span>
              </span>
            </div>
          </div>
          <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${realisationTotal / (realisationTotal + bonusTotal) * 100}%` }} />
            <div className="bg-amber-400 h-full transition-all flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAB 2: Филиалы ────────────────────────────────────────────────────────────
function BranchesTab({ totals, grandTotal, tree, tmzSummary, allRows, bonusRows, debtByBranch }: {
  totals: SalesReportTotal[]; grandTotal: number; tree: PivotNode[]; tmzSummary: TmzSummaryRow[];
  allRows: SalesReportRow[]; bonusRows: SalesReportRow[]; debtByBranch: OsvByBranchRow[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = useMemo(() => [...totals].sort((a, b) => b.amount - a.amount), [totals]);
  const tmzByCode = useMemo(() => Object.fromEntries(tmzSummary.map(r => [r.branch_code, r])), [tmzSummary]);
  const debtByName = useMemo(() => Object.fromEntries(debtByBranch.map(r => [r.branch_name, r])), [debtByBranch]);

  const topProductsByBranch = useMemo(() => {
    const result: Record<string, { name: string; amount: number; qty: number }[]> = {};
    const combined = [...allRows, ...bonusRows];
    for (const t of sorted) {
      const map = new Map<string, { name: string; amount: number; qty: number }>();
      for (const r of combined) {
        if (r.branch_code !== t.branch_code) continue;
        const k = r.code || r.name;
        if (!map.has(k)) map.set(k, { name: r.name, amount: 0, qty: 0 });
        const g = map.get(k)!; g.amount += r.amount; g.qty += r.qty;
      }
      result[t.branch_code] = [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
    }
    return result;
  }, [sorted, allRows, bonusRows]);

  const catChartData = useMemo(() => {
    if (!selected) return [];
    return tree
      .map(n => ({ name: n.label.length > 18 ? n.label.slice(0, 18) + "…" : n.label, amount: n.byBranch[selected]?.amount ?? 0, qty: n.byBranch[selected]?.qty ?? 0 }))
      .filter(x => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);
  }, [selected, tree]);

  const selBranch = sorted.find(t => t.branch_code === selected);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((t, i) => {
          const share = grandTotal > 0 ? t.amount / grandTotal * 100 : 0;
          const tmz = tmzByCode[t.branch_code];
          const debt = debtByName[t.branch_name];
          const topProducts = topProductsByBranch[t.branch_code] ?? [];
          const isSel = selected === t.branch_code;
          const color = C[i % C.length];
          return (
            <div key={t.branch_code}
              className={cn("rounded-xl border-2 bg-white overflow-hidden transition-all",
                isSel ? "border-blue-500 shadow-lg" : "border-gray-200 hover:border-gray-300 hover:shadow-md")}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-bold text-gray-900">{t.branch_name}</span>
                </div>
                <span className="text-[10px] font-mono text-gray-400">#{i + 1}</span>
              </div>
              {/* Sales */}
              <div className="px-4 pt-3 pb-3">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Отгрузка</div>
                <div className="text-base font-black text-gray-900 tabular-nums">{fmt(t.amount)}</div>
                <div className="text-[11px] text-gray-500 tabular-nums mb-2">{fmtQ(t.qty)}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[10px] text-gray-500 font-semibold w-9 text-right flex-shrink-0">{share.toFixed(1)}%</span>
                </div>
              </div>
              {/* Debt + TMZ */}
              <div className="grid grid-cols-2 border-t border-b border-gray-100">
                <div className="px-4 py-2.5 border-r border-gray-100">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Дебиторка</div>
                  {debt
                    ? <div className={cn("text-xs font-bold tabular-nums", debt.total_net > 0 ? "text-orange-600" : "text-gray-500")}>{fmt(debt.total_net)}</div>
                    : <div className="text-xs text-gray-300">—</div>}
                </div>
                <div className="px-4 py-2.5">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">ТМЗ остаток</div>
                  {tmz
                    ? <><div className="text-xs font-bold text-emerald-600 tabular-nums">{fmt(tmz.total_amount)}</div><div className="text-[9px] text-gray-400">{tmz.sku_count.toLocaleString("ru")} SKU</div></>
                    : <div className="text-xs text-gray-300">—</div>}
                </div>
              </div>
              {/* Top products */}
              <div className="px-4 py-3">
                <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Топ продуктов</div>
                {topProducts.length === 0
                  ? <div className="text-[10px] text-gray-300">нет данных</div>
                  : topProducts.map((p, pi) => (
                    <div key={pi} className="flex items-center gap-2 py-0.5">
                      <span className="text-[9px] text-gray-300 w-3 flex-shrink-0">{pi + 1}.</span>
                      <span className="text-[10px] text-gray-700 flex-1 truncate min-w-0">{p.name}</span>
                      <span className="text-[10px] font-semibold text-gray-800 tabular-nums flex-shrink-0">{fmt(p.amount)}</span>
                    </div>
                  ))}
              </div>
              {/* Expand */}
              <button onClick={() => setSelected(isSel ? null : t.branch_code)}
                className={cn("w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border-t border-gray-100 transition-colors",
                  isSel ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:text-blue-500 hover:bg-gray-50")}>
                {isSel ? <><ChevronDown size={11} />Скрыть категории</> : <><ChevronRight size={11} />Категории по отгрузке</>}
              </button>
            </div>
          );
        })}
      </div>

      {selected && catChartData.length > 0 && (
        <div className="bg-white border border-blue-100 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Building2 size={16} className="text-blue-500" />
            <span className="text-sm font-bold text-gray-800">{selBranch?.branch_name} — категории</span>
            <div className="text-sm font-black text-blue-700 ml-2">{selBranch ? fmt(selBranch.amount) : ""}</div>
            <button onClick={() => setSelected(null)} className="ml-auto text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(100, catChartData.length * 44)}>
            <BarChart data={catChartData} layout="vertical" margin={{ left: 0, right: 80, top: 4, bottom: 4 }}>
              <XAxis type="number" tickFormatter={v => fmtM(Number(v))} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} width={140} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {catChartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── TAB 3: Категории ──────────────────────────────────────────────────────────
function CategoriesTab({ tree, bonusTree, branches, branchTotals, allRows, bonusRows, onProductClick }: {
  tree: PivotNode[]; bonusTree: PivotNode[]; branches: { code: string; name: string }[];
  branchTotals: Record<string, Cell>; allRows: SalesReportRow[];
  bonusRows: SalesReportRow[]; onProductClick: (r: SalesReportRow) => void;
}) {
  const [open, setOpen] = useState(new Set<string>());
  const [openLeaf, setOpenLeaf] = useState(new Set<string>());
  const [openBranch, setOpenBranch] = useState(new Set<string>());
  const [bonusSectionOpen, setBonusSectionOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(new Set<string>());
  const [bonusLeaf, setBonusLeaf] = useState(new Set<string>());
  const [bonusBranch, setBonusBranch] = useState(new Set<string>());
  const [filterBranch, setFilterBranch] = useState("");
  const [filterCat1, setFilterCat1] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const tog = (s: Set<string>, id: string) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; };

  const cat1Options = useMemo(() => tree.map(n => n.label), [tree]);

  function flatten(nodes: PivotNode[], out: PivotNode[] = []) {
    for (const n of nodes) {
      if (filterCat1 && n.level === 0 && n.cat1 !== filterCat1) continue;
      if (filterBranch && (!n.byBranch[filterBranch] || n.byBranch[filterBranch].amount === 0)) continue;
      out.push(n);
      if (open.has(n.id) && n.children.length) flatten(n.children, out);
    }
    return out;
  }
  const visible = useMemo(() => flatten(tree), [tree, open, filterBranch, filterCat1]);

  // Grand total respects branch filter
  const grand: Cell = useMemo(() => {
    if (filterBranch) {
      const c = branchTotals[filterBranch];
      return c ?? { qty: 0, amount: 0 };
    }
    return { qty: tree.reduce((s, n) => s + n.total.qty, 0), amount: tree.reduce((s, n) => s + n.total.amount, 0) };
  }, [tree, branchTotals, filterBranch]);

  // Amount/qty for a row respects branch filter
  const getCell = (row: PivotNode): Cell => filterBranch
    ? (row.byBranch[filterBranch] ?? { qty: 0, amount: 0 })
    : row.total;

  // Search results: flat list of matching products
  const searchResults = useMemo(() => {
    if (!filterSearch.trim()) return [];
    const sq = filterSearch.toLowerCase();
    const map = new Map<string, SalesReportRow & { _qty: number; _amt: number }>();
    for (const r of [...allRows, ...bonusRows]) {
      if (!r.name.toLowerCase().includes(sq)) continue;
      if (filterCat1 && r.cat1 !== filterCat1) continue;
      if (filterBranch && r.branch_code !== filterBranch) continue;
      const k = r.code || r.name;
      if (!map.has(k)) map.set(k, { ...r, _qty: 0, _amt: 0 });
      const g = map.get(k)!; g._qty += r.qty; g._amt += r.amount;
    }
    return [...map.values()].map(g => ({ ...g, qty: g._qty, amount: g._amt })).sort((a, b) => b.amount - a.amount);
  }, [filterSearch, allRows, bonusRows, filterCat1, filterBranch]);

  const hasFilter = !!(filterBranch || filterCat1 || filterSearch);

  const grand0: Cell = { qty: tree.reduce((s, n) => s + n.total.qty, 0), amount: tree.reduce((s, n) => s + n.total.amount, 0) };

  function getLeafProducts(node: PivotNode) {
    const map = new Map<string, SalesReportRow & { _qty: number; _amt: number }>();
    for (const r of [...allRows, ...bonusRows]) {
      if (r.cat1 !== node.cat1) continue;
      if (node.cat2 !== null && r.cat2 !== node.cat2) continue;
      if (node.cat3 !== null && r.cat3 !== node.cat3) continue;
      const k = r.code || r.name;
      if (!map.has(k)) map.set(k, { ...r, _qty: 0, _amt: 0 });
      const g = map.get(k)!; g._qty += r.qty; g._amt += r.amount;
    }
    return [...map.values()].map(g => ({ ...g, qty: g._qty, amount: g._amt })).sort((a, b) => b.amount - a.amount);
  }

  // Stacked distribution bar for a row
  function DistBar({ byBranch, total }: { byBranch: Record<string, Cell>; total: number }) {
    return (
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 w-full">
        {branches.map((b, bi) => {
          const c = byBranch[b.code];
          const pct = total > 0 && c ? c.amount / total * 100 : 0;
          if (pct < 0.8) return null;
          return <div key={b.code} style={{ width: `${pct}%`, backgroundColor: C[bi % C.length] }} title={`${b.name}: ${fmt(c!.amount)} (${pct.toFixed(1)}%)`} />;
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Поиск по продукту..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            className="pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {filterSearch && <button onClick={() => setFilterSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
        </div>
        <select value={filterCat1} onChange={e => setFilterCat1(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Все категории</option>
          {cat1Options.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Все филиалы</option>
          {branches.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
        {hasFilter && (
          <button onClick={() => { setFilterBranch(""); setFilterCat1(""); setFilterSearch(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
            <X size={11} />Сбросить
          </button>
        )}
        {hasFilter && (
          <span className="ml-auto text-xs text-gray-400">
            {filterSearch ? `${searchResults.length} продуктов` : `${visible.length} строк`}
          </span>
        )}
      </div>

      {/* Search results (flat list) */}
      {filterSearch.trim() && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Результаты поиска: {searchResults.length} позиций
          </div>
          {searchResults.length === 0
            ? <div className="px-4 py-8 text-center text-sm text-gray-400">Ничего не найдено</div>
            : searchResults.slice(0, 200).map((p, pi) => (
              <button key={p.code || p.name + pi}
                onClick={() => onProductClick(p)}
                className={cn("w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-blue-50/40 group",
                  pi % 2 === 0 ? "bg-white" : "bg-gray-50/20")}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-200 group-hover:bg-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 group-hover:text-blue-700 truncate">{p.name}</div>
                  {p.cat1 && <div className="text-[10px] text-gray-400 truncate">{[p.cat1, p.cat2].filter(Boolean).join(" › ")}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold text-gray-800 tabular-nums">{fmt(p.amount)}</div>
                  <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(p.qty)}</div>
                </div>
              </button>
            ))}
        </div>
      )}

    {!filterSearch.trim() && (<>
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Grand total header */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-bold flex-1 min-w-0">
          {filterBranch ? branches.find(b => b.code === filterBranch)?.name : filterCat1 || "Все продажи"}
        </span>
        <div className="text-right">
          <div className="text-base font-black tabular-nums">{fmt(grand.amount)}</div>
          <div className="text-[10px] text-blue-200 tabular-nums">{fmtQ(grand.qty)}</div>
          {filterBranch && grand0.amount > 0 && (
            <div className="text-[10px] text-blue-200">{(grand.amount / grand0.amount * 100).toFixed(1)}% от итого</div>
          )}
        </div>
        {!filterBranch && (
          <div className="w-40">
            <div className="flex h-2 rounded-full overflow-hidden bg-blue-500">
              {branches.map((b, bi) => {
                const c = branchTotals[b.code];
                const pct = grand.amount > 0 && c ? c.amount / grand.amount * 100 : 0;
                if (pct < 0.8) return null;
                return <div key={b.code} style={{ width: `${pct}%`, backgroundColor: C[bi % C.length] }} title={`${b.name}: ${pct.toFixed(0)}%`} />;
              })}
            </div>
            <div className="flex flex-wrap gap-x-2 mt-1">
              {branches.slice(0, 5).map((b, bi) => {
                const c = branchTotals[b.code];
                if (!c || c.amount === 0) return null;
                const pct = grand.amount > 0 ? c.amount / grand.amount * 100 : 0;
                return <span key={b.code} className="text-[9px]" style={{ color: C[bi % C.length] }}>{b.name.slice(0, 4)} {pct.toFixed(0)}%</span>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="grid gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
        style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
        <div>Категория</div>
        <div className="text-right">{filterBranch ? branches.find(b => b.code === filterBranch)?.name : "Итого"}</div>
        <div className="text-right">Кол-во</div>
        <div className="pl-3">Распределение</div>
      </div>

      {/* Rows */}
      {visible.map(row => {
        const hasKids = row.children.length > 0;
        const isOpen = open.has(row.id);
        const isLeafOpen = openLeaf.has(row.id);
        const isBranchOpen = openBranch.has(row.id);
        const pl = row.level * 20 + 16;
        const products = (!hasKids && isLeafOpen) ? getLeafProducts(row) : [];

        return (
          <div key={row.id} className={row.level === 0 ? "border-t-2 border-gray-100" : ""}>
            {/* Main row */}
            <div className={cn("grid items-center border-b border-gray-50 hover:bg-gray-50/60 group",
              row.level === 1 ? "bg-gray-50/30" : "bg-white")}
              style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
              <button className="flex items-center gap-1.5 py-2.5 text-left min-w-0"
                style={{ paddingLeft: pl, paddingRight: 8 }}
                onClick={() => hasKids ? setOpen(s => tog(s, row.id)) : setOpenLeaf(s => tog(s, row.id))}>
                <span className="flex-shrink-0 text-gray-400">
                  {hasKids
                    ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                    : (isLeafOpen ? <ChevronDown size={12} className="text-blue-400" /> : <ChevronRight size={12} className="text-blue-200" />)}
                </span>
                <span className={cn("truncate", row.level === 0 ? "text-sm font-bold text-gray-900" : row.level === 1 ? "text-xs font-semibold text-gray-700" : "text-xs text-gray-600")}>
                  {row.label}
                </span>
              </button>
              <div className="text-right pr-4 py-2.5">
                <div className={cn("text-xs font-bold tabular-nums", row.level === 0 ? "text-gray-900" : "text-gray-700")}>{fmt(getCell(row).amount)}</div>
                {row.level === 0 && grand.amount > 0 && (
                  <div className="text-[9px] text-gray-400">{(getCell(row).amount / grand.amount * 100).toFixed(1)}%</div>
                )}
              </div>
              <div className="text-right pr-4 py-2.5">
                <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(getCell(row).qty)}</div>
              </div>
              <button className="pl-3 pr-3 py-2.5 flex items-center gap-1.5 group/bar"
                onClick={() => setOpenBranch(s => tog(s, row.id))}>
                <div className="flex-1 min-w-0">
                  <DistBar byBranch={row.byBranch} total={row.total.amount} />
                </div>
                <span className={cn("flex-shrink-0 transition-colors", isBranchOpen ? "text-blue-400" : "text-gray-200 group-hover/bar:text-gray-400")}>
                  {isBranchOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
              </button>
            </div>

            {/* Branch detail panel */}
            {isBranchOpen && (
              <div className="border-b border-blue-100 bg-blue-50/40 px-4 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {branches.map((b, bi) => {
                    const c = row.byBranch[b.code];
                    if (!c || c.amount === 0) return null;
                    const pct = row.total.amount > 0 ? c.amount / row.total.amount * 100 : 0;
                    return (
                      <div key={b.code} className="flex items-start gap-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100 shadow-sm">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: C[bi % C.length] }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-gray-500 font-medium truncate">{b.name}</div>
                          <div className="text-[11px] font-bold text-gray-900 tabular-nums">{fmt(c.amount)}</div>
                          <div className="text-[9px] text-gray-400 tabular-nums">{fmtQ(c.qty)} · {pct.toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Leaf products */}
            {!hasKids && isLeafOpen && products.map((p, pi) => {
              const perBranch: Record<string, { qty: number; amount: number }> = {};
              for (const r of [...allRows, ...bonusRows]) {
                if (r.code !== p.code) continue;
                if (!perBranch[r.branch_code]) perBranch[r.branch_code] = { qty: 0, amount: 0 };
                perBranch[r.branch_code].qty += r.qty; perBranch[r.branch_code].amount += r.amount;
              }
              return (
                <div key={`${row.id}_${p.code}_${pi}`}
                  className={cn("grid items-center border-b border-gray-50 hover:bg-blue-50/30", pi % 2 === 0 ? "bg-white" : "bg-gray-50/20")}
                  style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
                  <div style={{ paddingLeft: pl + 20, paddingRight: 8 }} className="py-1.5 min-w-0">
                    <button className="flex items-center gap-1.5 text-left group/p w-full min-w-0" onClick={() => onProductClick(p)}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-200 group-hover/p:bg-blue-500 flex-shrink-0" />
                      <span className="text-[11px] text-gray-600 group-hover/p:text-blue-700 truncate">{p.name}</span>
                      <span className="text-[9px] text-blue-400 opacity-0 group-hover/p:opacity-100 flex-shrink-0 ml-1">↗</span>
                    </button>
                  </div>
                  <div className="text-right pr-4 py-1.5">
                    <div className="text-[11px] font-semibold text-gray-700 tabular-nums">{fmt(p.amount)}</div>
                  </div>
                  <div className="text-right pr-4 py-1.5">
                    <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(p.qty)}</div>
                  </div>
                  <div className="pl-3 pr-3 py-1.5">
                    <DistBar byBranch={perBranch} total={p.amount} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>

    {/* ── БОНУСЫ section ──────────────────────────────────────────────────── */}
    {bonusTree.length > 0 && (() => {
      const bonusGrandAmt = bonusTree.reduce((s, n) => s + n.total.amount, 0);
      const bonusGrandQty = bonusTree.reduce((s, n) => s + n.total.qty, 0);
      const tog2 = (s: Set<string>, id: string) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; };

      function flattenBonus(nodes: PivotNode[], out: PivotNode[] = []) {
        for (const n of nodes) {
          out.push(n);
          if (bonusOpen.has(n.id) && n.children.length) flattenBonus(n.children, out);
        }
        return out;
      }
      const bonusVisible = bonusSectionOpen ? flattenBonus(bonusTree) : [];

      function getBonusCell(row: PivotNode): Cell {
        return filterBranch ? (row.byBranch[filterBranch] ?? { qty: 0, amount: 0 }) : row.total;
      }

      function getBonusProducts(node: PivotNode) {
        const map = new Map<string, SalesReportRow & { _qty: number; _amt: number }>();
        for (const r of bonusRows) {
          if (r.cat1 !== node.cat1) continue;
          if (node.cat2 !== null && r.cat2 !== node.cat2) continue;
          if (node.cat3 !== null && r.cat3 !== node.cat3) continue;
          const k = r.code || r.name;
          if (!map.has(k)) map.set(k, { ...r, _qty: 0, _amt: 0 });
          const g = map.get(k)!; g._qty += r.qty; g._amt += r.amount;
        }
        return [...map.values()].map(g => ({ ...g, qty: g._qty, amount: g._amt })).sort((a, b) => b.amount - a.amount);
      }

      return (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          {/* Bonus header */}
          <button
            className="w-full bg-amber-50 hover:bg-amber-100 transition-colors border-b border-amber-200 px-4 py-3 flex items-center gap-4 flex-wrap"
            onClick={() => setBonusSectionOpen(v => !v)}>
            <span className="flex-shrink-0 text-amber-500">
              {bonusSectionOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </span>
            <span className="text-sm font-bold text-amber-800 flex-1 text-left">Бонусы</span>
            <div className="text-right">
              <div className="text-base font-black text-amber-700 tabular-nums">{fmt(bonusGrandAmt)}</div>
              <div className="text-[10px] text-amber-500 tabular-nums">{fmtQ(bonusGrandQty)}</div>
            </div>
            <div className="w-40">
              <DistBar byBranch={bonusTree.reduce((acc, n) => {
                for (const [k, v] of Object.entries(n.byBranch)) {
                  if (!acc[k]) acc[k] = { qty: 0, amount: 0 };
                  acc[k].qty += v.qty; acc[k].amount += v.amount;
                }
                return acc;
              }, {} as Record<string, Cell>)} total={bonusGrandAmt} />
            </div>
          </button>

          {/* Column headers */}
          {bonusSectionOpen && (
            <div className="grid gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
              style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
              <div>Категория</div>
              <div className="text-right">{filterBranch ? branches.find(b => b.code === filterBranch)?.name : "Итого"}</div>
              <div className="text-right">Кол-во</div>
              <div className="pl-3">Распределение</div>
            </div>
          )}

          {/* Bonus rows */}
          {bonusVisible.map(row => {
            const hasKids = row.children.length > 0;
            const isOpen2 = bonusOpen.has(row.id);
            const isLeafOpen2 = bonusLeaf.has(row.id);
            const isBranchOpen2 = bonusBranch.has(row.id);
            const pl = row.level * 20 + 16;
            const products = (!hasKids && isLeafOpen2) ? getBonusProducts(row) : [];

            return (
              <div key={row.id} className={row.level === 0 ? "border-t-2 border-amber-50" : ""}>
                <div className={cn("grid items-center border-b border-gray-50 hover:bg-amber-50/40 group",
                  row.level === 1 ? "bg-gray-50/30" : "bg-white")}
                  style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
                  <button className="flex items-center gap-1.5 py-2.5 text-left min-w-0"
                    style={{ paddingLeft: pl, paddingRight: 8 }}
                    onClick={() => hasKids ? setBonusOpen(s => tog2(s, row.id)) : setBonusLeaf(s => tog2(s, row.id))}>
                    <span className="flex-shrink-0 text-amber-400">
                      {hasKids
                        ? (isOpen2 ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                        : (isLeafOpen2 ? <ChevronDown size={12} className="text-amber-400" /> : <ChevronRight size={12} className="text-amber-200" />)}
                    </span>
                    <span className={cn("truncate", row.level === 0 ? "text-sm font-bold text-gray-900" : row.level === 1 ? "text-xs font-semibold text-gray-700" : "text-xs text-gray-600")}>
                      {row.label}
                    </span>
                  </button>
                  <div className="text-right pr-4 py-2.5">
                    <div className={cn("text-xs font-bold tabular-nums", row.level === 0 ? "text-gray-900" : "text-gray-700")}>{fmt(getBonusCell(row).amount)}</div>
                    {row.level === 0 && bonusGrandAmt > 0 && (
                      <div className="text-[9px] text-gray-400">{(getBonusCell(row).amount / bonusGrandAmt * 100).toFixed(1)}%</div>
                    )}
                  </div>
                  <div className="text-right pr-4 py-2.5">
                    <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(getBonusCell(row).qty)}</div>
                  </div>
                  <button className="pl-3 pr-3 py-2.5 flex items-center gap-1.5 group/bar"
                    onClick={() => setBonusBranch(s => tog2(s, row.id))}>
                    <div className="flex-1 min-w-0">
                      <DistBar byBranch={row.byBranch} total={row.total.amount} />
                    </div>
                    <span className={cn("flex-shrink-0 transition-colors", isBranchOpen2 ? "text-amber-400" : "text-gray-200 group-hover/bar:text-gray-400")}>
                      {isBranchOpen2 ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                  </button>
                </div>

                {/* Branch detail panel */}
                {isBranchOpen2 && (
                  <div className="border-b border-amber-100 bg-amber-50/40 px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {branches.map((b, bi) => {
                        const c = row.byBranch[b.code];
                        if (!c || c.amount === 0) return null;
                        const pct = row.total.amount > 0 ? c.amount / row.total.amount * 100 : 0;
                        return (
                          <div key={b.code} className="flex items-start gap-2 bg-white rounded-lg px-2.5 py-2 border border-amber-100 shadow-sm">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: C[bi % C.length] }} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-gray-500 font-medium truncate">{b.name}</div>
                              <div className="text-[11px] font-bold text-gray-900 tabular-nums">{fmt(c.amount)}</div>
                              <div className="text-[9px] text-gray-400 tabular-nums">{fmtQ(c.qty)} · {pct.toFixed(1)}%</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Leaf products */}
                {!hasKids && isLeafOpen2 && products.map((p, pi) => {
                  const perBranch: Record<string, { qty: number; amount: number }> = {};
                  for (const r of bonusRows) {
                    if (r.code !== p.code) continue;
                    if (!perBranch[r.branch_code]) perBranch[r.branch_code] = { qty: 0, amount: 0 };
                    perBranch[r.branch_code].qty += r.qty; perBranch[r.branch_code].amount += r.amount;
                  }
                  return (
                    <div key={`bonus_${row.id}_${p.code}_${pi}`}
                      className={cn("grid items-center border-b border-gray-50 hover:bg-amber-50/30", pi % 2 === 0 ? "bg-white" : "bg-amber-50/10")}
                      style={{ gridTemplateColumns: "1fr 160px 90px 180px" }}>
                      <div style={{ paddingLeft: pl + 20, paddingRight: 8 }} className="py-1.5 min-w-0">
                        <button className="flex items-center gap-1.5 text-left group/p w-full min-w-0" onClick={() => onProductClick(p)}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-200 group-hover/p:bg-amber-500 flex-shrink-0" />
                          <span className="text-[11px] text-gray-600 group-hover/p:text-amber-700 truncate">{p.name}</span>
                          <span className="text-[9px] text-amber-400 opacity-0 group-hover/p:opacity-100 flex-shrink-0 ml-1">↗</span>
                        </button>
                      </div>
                      <div className="text-right pr-4 py-1.5">
                        <div className="text-[11px] font-semibold text-gray-700 tabular-nums">{fmt(p.amount)}</div>
                      </div>
                      <div className="text-right pr-4 py-1.5">
                        <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(p.qty)}</div>
                      </div>
                      <div className="pl-3 pr-3 py-1.5">
                        <DistBar byBranch={perBranch} total={p.amount} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    })()}
    </>)}
    </div>
  );
}

// ── TAB 4: Продукты ───────────────────────────────────────────────────────────
function ProductsTab({ allRows, bonusRows, tree, branches, onProductClick }: {
  allRows: SalesReportRow[]; bonusRows: SalesReportRow[];
  tree: PivotNode[]; branches: { code: string; name: string }[];
  onProductClick: (r: SalesReportRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [cat1, setCat1] = useState("");
  const [branch, setBranch] = useState("");

  const cat1Options = useMemo(() => tree.map(n => n.label), [tree]);

  const products = useMemo(() => {
    const sq = search.toLowerCase();
    const map = new Map<string, { row: SalesReportRow; amt: number; qty: number; branchCount: number }>();
    for (const r of [...allRows, ...bonusRows]) {
      if (cat1 && r.cat1 !== cat1) continue;
      if (branch && r.branch_code !== branch) continue;
      if (sq && !r.name.toLowerCase().includes(sq)) continue;
      const k = r.code || r.name;
      if (!map.has(k)) map.set(k, { row: r, amt: 0, qty: 0, branchCount: 0 });
      const g = map.get(k)!; g.amt += r.amount; g.qty += r.qty;
    }
    // count unique branches per product
    const branchMap = new Map<string, Set<string>>();
    for (const r of [...allRows, ...bonusRows]) {
      const k = r.code || r.name;
      if (!branchMap.has(k)) branchMap.set(k, new Set());
      branchMap.get(k)!.add(r.branch_code);
    }
    for (const [k, g] of map) g.branchCount = branchMap.get(k)?.size ?? 0;
    return [...map.values()].sort((a, b) => b.amt - a.amt);
  }, [allRows, bonusRows, search, cat1, branch]);

  const maxAmt = products[0]?.amt ?? 1;
  const hasFilter = !!(search || cat1 || branch);

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Поиск по наименованию..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
        </div>
        <select value={cat1} onChange={e => setCat1(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Все категории</option>
          {cat1Options.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={branch} onChange={e => setBranch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Все филиалы</option>
          {branches.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
        {hasFilter && (
          <button onClick={() => { setSearch(""); setCat1(""); setBranch(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <X size={11} />Сбросить
          </button>
        )}
        <div className="ml-auto text-sm text-gray-400 tabular-nums">{products.length.toLocaleString("ru")} позиций</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_130px_100px_48px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <div>Наименование</div><div className="text-right">Сумма</div><div className="text-right">Кол-во</div><div className="text-center">Фил.</div>
        </div>
        {products.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">Нет позиций</div>
        ) : (
          <>
            {products.slice(0, 300).map((g, i) => {
              const pct = maxAmt > 0 ? g.amt / maxAmt * 100 : 0;
              return (
                <button key={g.row.code || g.row.name + i}
                  onClick={() => onProductClick(g.row)}
                  className={cn("w-full text-left grid grid-cols-[1fr_130px_100px_48px] gap-3 items-center px-4 py-2.5 border-b border-gray-50 hover:bg-blue-50/40 transition-colors group",
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/20")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-200 group-hover:bg-blue-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 group-hover:text-blue-700 truncate">{g.row.name}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1 ml-3">
                      <div className="h-full bg-blue-300 group-hover:bg-blue-500 rounded-full transition-colors" style={{ width: `${pct}%` }} />
                    </div>
                    {g.row.cat1 && <div className="text-[10px] text-gray-400 ml-3 mt-0.5 truncate">{[g.row.cat1, g.row.cat2].filter(Boolean).join(" › ")}</div>}
                  </div>
                  <div className="text-right text-xs font-bold text-gray-800 tabular-nums">{fmt(g.amt)}</div>
                  <div className="text-right text-xs text-gray-500 tabular-nums">{fmtQ(g.qty)}</div>
                  <div className="text-center text-xs font-semibold text-blue-500">{g.branchCount}</div>
                </button>
              );
            })}
            {products.length > 300 && (
              <div className="px-4 py-3 text-center text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                Показаны первые 300 из {products.length.toLocaleString("ru")} позиций — уточните поиск
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Обзор", icon: BarChart2 },
  { id: "branches", label: "Филиалы", icon: Building2 },
  { id: "categories", label: "Категории", icon: Tag },
  { id: "products", label: "Продукты", icon: ShoppingBag },
];

export default function SalesPage() {
  const { data: dates = [] } = useSalesReportDates();
  const { data: branchList = [] } = useSalesReportBranches();
  const [selectedDate, setSelectedDate] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SalesReportRow | null>(null);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const p = { period_date: selectedDate || undefined };
  const { data: summary = [], isLoading } = useSalesReportSummary({ ...p, is_bonus: false });
  const { data: bonusSummary = [] } = useSalesReportSummary({ ...p, is_bonus: true });
  const { data: totals = [] } = useSalesReportTotals(p);
  const { data: allRows = [] } = useSalesReportRows({ ...p, is_bonus: false });
  const { data: bonusRows = [] } = useSalesReportRows({ ...p, is_bonus: true });
  const { data: tmzSummary = [] } = useTmzSummary(selectedDate ? selectedDate.substring(0, 7) + "-31" : undefined);
  const { data: osvDates = [] } = useOsvDates();
  const { data: debtByBranch = [] } = useOsvByBranch(osvDates[0], true);

  // Paid-only tree (for Categories tab)
  const salesTree = useMemo(() => buildPivotTree(summary), [summary]);
  // Bonus-only tree (for Бонусы section in Categories)
  const bonusTree = useMemo(() => buildPivotTree(bonusSummary), [bonusSummary]);
  // Combined tree: regular + bonus categories (for Обзор / Филиалы / Продукты)
  const tree = useMemo(() => buildPivotTree([...summary, ...bonusSummary]), [summary, bonusSummary]);

  // Combined branch totals (all 9 branches)
  const combinedTotals = useMemo(() => {
    const m = new Map<string, SalesReportTotal>();
    for (const r of [...summary, ...bonusSummary]) {
      if (!m.has(r.branch_code)) m.set(r.branch_code, { branch_code: r.branch_code, branch_name: r.branch_name, qty: 0, amount: 0 });
      const e = m.get(r.branch_code)!; e.qty += r.qty; e.amount += r.amount;
    }
    return [...m.values()];
  }, [summary, bonusSummary]);

  const branchTotals = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const t of combinedTotals) m[t.branch_code] = { qty: t.qty, amount: t.amount };
    return m;
  }, [combinedTotals]);
  const orderedBranches = useMemo(() =>
    [...branchList].sort((a, b) => (branchTotals[b.code]?.amount ?? 0) - (branchTotals[a.code]?.amount ?? 0)),
    [branchList, branchTotals]);

  const grandTotal = totals.reduce((s, t) => s + t.amount, 0);  // реализация (non-bonus)
  const grandQty = totals.reduce((s, t) => s + t.qty, 0);
  const bonusTotal = bonusSummary.reduce((s, r) => s + r.amount, 0);
  const bonusGrandQty = bonusSummary.reduce((s, r) => s + r.qty, 0);
  const combinedGrandTotal = combinedTotals.reduce((s, t) => s + t.amount, 0);
  const tmzTotal = tmzSummary.reduce((s, r) => s + r.total_amount, 0);
  const isEmpty = !isLoading && summary.length === 0 && bonusSummary.length === 0;

  return (
    <div className="space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Продажи</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => setShowUpload(v => !v)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700")}>
            <Upload size={14} />Загрузить
          </button>
        </div>
      </div>

      {showUpload && <UploadBlock onDone={() => setShowUpload(false)} selectedDate={selectedDate} />}

      {/* KPI strip */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-600 text-white rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-200">Реализация</div>
            <div className="text-xl font-black">{fmt(grandTotal)}</div>
            <div className="text-[11px] text-blue-200">{fmtQ(grandQty)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Бонусы</div>
            <div className="text-xl font-black text-amber-600">{fmt(bonusTotal)}</div>
            <div className="text-[11px] text-gray-400">{fmtQ(bonusGrandQty)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Категорий</div>
            <div className="text-xl font-black text-gray-900">{salesTree.length}</div>
            <div className="text-[11px] text-gray-400">{orderedBranches.length} филиалов</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">ТМЗ остатки</div>
            <div className="text-xl font-black text-emerald-600">{fmt(tmzTotal)}</div>
            <div className="text-[11px] text-gray-400">{tmzSummary.reduce((s, r) => s + r.sku_count, 0).toLocaleString("ru")} SKU</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!isEmpty && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                  activeTab === tab.id ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                <Icon size={14} />{tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : isEmpty ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <TrendingUp size={36} className="text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm font-medium">
            {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить»." : "Нет данных по выбранному периоду."}
          </div>
        </div>
      ) : activeTab === "overview" ? (
        <OverviewTab salesTree={salesTree} totals={combinedTotals} grandTotal={combinedGrandTotal} bonusTotal={bonusTotal} tmzTotal={tmzTotal} realisationTotal={grandTotal} />
      ) : activeTab === "branches" ? (
        <BranchesTab totals={combinedTotals} grandTotal={combinedGrandTotal} tree={salesTree} tmzSummary={tmzSummary} allRows={allRows} bonusRows={bonusRows} debtByBranch={debtByBranch} />
      ) : activeTab === "categories" ? (
        <CategoriesTab tree={salesTree} bonusTree={bonusTree} branches={orderedBranches} branchTotals={branchTotals}
          allRows={allRows} bonusRows={bonusRows} onProductClick={setSelectedProduct} />
      ) : (
        <ProductsTab allRows={allRows} bonusRows={bonusRows} tree={tree} branches={orderedBranches} onProductClick={setSelectedProduct} />
      )}

      {selectedProduct && (
        <ProductModal product={selectedProduct} allRows={allRows} bonusRows={bonusRows} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
