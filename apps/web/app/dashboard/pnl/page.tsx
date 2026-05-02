"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  usePnlDates, usePnlSummary, usePnlMonths, useUpsertPnlExpense,
  useUpsertPnlTarget, useDeletePnlExpenseCategory,
  type PnlBranchData, type PnlMonthRow, type PnlProduct,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Plus, Trash2, Target, Loader2, ChevronDown, ChevronRight,
  BarChart2, CalendarDays, Filter, TrendingDown, Package,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}
function fmtFull(n: number) {
  return fmt(n);
}
function fmtPct(n: number) { return n.toFixed(1) + "%"; }

// ── Inline editable cell ───────────────────────────────────────────────────────
function EditCell({
  value, onSave, placeholder = "—", className = "",
}: {
  value: number | null; onSave: (v: number | null) => void;
  placeholder?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const n = parseFloat(draft.replace(/\s/g, ""));
    onSave(isNaN(n) ? null : n);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-full text-right bg-blue-50 border border-blue-300 rounded px-1 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="0"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Нажмите для редактирования"
      className={cn(
        "w-full text-right px-1 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors group text-xs tabular-nums",
        className
      )}
    >
      {value != null && value !== 0
        ? <span>{fmt(value)}</span>
        : <span className="text-gray-300 group-hover:text-blue-400">{placeholder}</span>
      }
    </button>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ actual, plan }: { actual: number; plan: number | null }) {
  if (!plan || plan === 0) return null;
  const pct = Math.min((actual / plan) * 100, 130);
  const color = pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn("text-[9px] tabular-nums font-semibold", pct >= 100 ? "text-green-600" : pct >= 80 ? "text-amber-600" : "text-red-500")}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function PctBadge({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-green-100 text-green-700" : pct >= 80 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
  return (
    <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums", color)}>
      {pct.toFixed(0)}%
    </span>
  );
}

// ── Branch multi-select dropdown ───────────────────────────────────────────────
function BranchFilter({
  branches, selected, onChange,
}: {
  branches: { code: string; name: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle(code: string) {
    const next = new Set(selected);
    next.has(code) ? next.delete(code) : next.add(code);
    onChange(next);
  }

  const label = selected.size === 0
    ? "Все филиалы"
    : selected.size === 1
    ? branches.find(b => selected.has(b.code))?.name ?? "1 филиал"
    : `${selected.size} филиала`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
          selected.size > 0
            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        )}
      >
        <Filter size={13} />{label}<ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
          <button
            onClick={() => onChange(new Set())}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            Все филиалы
          </button>
          <div className="border-t border-gray-100 my-1" />
          {branches.map(b => (
            <label key={b.code} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(b.code)}
                onChange={() => toggle(b.code)}
                className="accent-indigo-600"
              />
              <span className="text-xs text-gray-700">{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type ViewMode = "branches" | "months" | "forecast";

export default function PnlPage() {
  const { data: dates = [] } = usePnlDates();
  const [selectedDate, setSelectedDate] = useState("");
  const [excludeReturns, setExcludeReturns] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("branches");
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [selectedBranchCodes, setSelectedBranchCodes] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [sectionsOpen, setSectionsOpen] = useState<Set<string>>(
    new Set(["revenue", "cogs", "expenses", "kpi"])
  );

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const { data: summary, isLoading, isError, error } = usePnlSummary({
    period_date: selectedDate || undefined,
    exclude_returns: excludeReturns || undefined,
  });
  const { data: months = [], isLoading: monthsLoading } = usePnlMonths(excludeReturns || undefined);

  const upsertExpense = useUpsertPnlExpense();
  const upsertTarget = useUpsertPnlTarget();
  const deleteCategory = useDeletePnlExpenseCategory();

  const branches = summary?.branch_data ?? [];
  const expenseCats = summary?.expense_categories ?? [];
  const categories = summary?.categories ?? [];
  const periodDate = summary?.period_date ?? selectedDate;

  // Must be before early returns to satisfy Rules of Hooks
  const products = summary?.products ?? [];
  const productIndex = useMemo(() => {
    const idx = new Map<string, Map<string, PnlProduct[]>>();
    for (const p of products) {
      if (!idx.has(p.cat)) idx.set(p.cat, new Map());
      const byBranch = idx.get(p.cat)!;
      if (!byBranch.has(p.branch_code)) byBranch.set(p.branch_code, []);
      byBranch.get(p.branch_code)!.push(p);
    }
    return idx;
  }, [products]);

  function toggleSection(id: string) {
    setSectionsOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function saveExpense(branchCode: string, category: string, field: "actual" | "plan", value: number | null) {
    const branch = branches.find(b => b.branch_code === branchCode);
    if (!branch || branchCode === "TOTAL") return;
    const cur = branch.expenses[category] ?? { actual: 0, plan: null };
    upsertExpense.mutate({
      period_date: periodDate!,
      branch_code: branchCode,
      category,
      amount_actual: field === "actual" ? (value ?? 0) : cur.actual,
      amount_plan: field === "plan" ? value : cur.plan,
    });
  }

  function saveRevenuePlan(branchCode: string, value: number | null) {
    if (branchCode === "TOTAL") return;
    upsertTarget.mutate({ period_date: periodDate!, branch_code: branchCode, revenue_plan: value });
  }

  function saveBasketPlan(branchCode: string, value: number | null) {
    if (branchCode === "TOTAL") return;
    upsertTarget.mutate({ period_date: periodDate!, branch_code: branchCode, basket_plan: value });
  }

  function addCustomCategory() {
    const name = newCatName.trim();
    if (!name || !periodDate) return;
    upsertExpense.mutate({
      period_date: periodDate,
      branch_code: "ALL",
      category: name,
      amount_actual: 0,
      sort_order: 200,
    });
    setNewCatName("");
    setAddingCat(false);
  }

  const loading = isLoading || (viewMode === "months" && monthsLoading);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />Загрузка P&L...
      </div>
    );
  }

  if (viewMode === "branches" && isError) {
    const msg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      ?? (error instanceof Error ? error.message : "Неизвестная ошибка");
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
        <BarChart2 size={32} className="text-red-300" />
        <div className="text-sm font-semibold">Ошибка загрузки P&L</div>
        <div className="text-xs text-red-300 font-mono max-w-lg text-center">{msg}</div>
      </div>
    );
  }

  if (viewMode === "branches" && (!summary || branches.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <BarChart2 size={32} className="text-gray-300" />
        <div className="text-sm">Нет данных. Загрузите отчёт продаж в разделе Продажи.</div>
      </div>
    );
  }

  const totalCol = branches[0];
  const allBranchCols = branches.slice(1);
  const branchCols = selectedBranchCodes.size === 0
    ? allBranchCols
    : allBranchCols.filter(b => selectedBranchCodes.has(b.branch_code));

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  // Forecast: use revenue_plan as target revenue, extrapolate COGS from actual margin
  const forecastTotalRev = branchCols.reduce((s, b) => s + (b.revenue_plan ?? b.revenue_total), 0);
  const forecastBranchCols = branchCols.map(b => {
    const fRev = b.revenue_plan ?? b.revenue_total;
    const cogsRate = b.revenue_total > 0 ? b.cogs / b.revenue_total : 0;
    const fCogs = fRev * cogsRate;
    const fGross = fRev - fCogs;
    const fOpex = b.total_opex;
    const fEbitda = fGross - fOpex;
    return { ...b, fRev, fCogs, fGross, fOpex, fEbitda };
  });

  return (
    <div className="space-y-4 max-w-[1800px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">P&L — Управленческий отчёт</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* View mode tabs */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setViewMode("branches")} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors", viewMode === "branches" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <BarChart2 size={13} />По филиалам
            </button>
            <button onClick={() => setViewMode("months")} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors", viewMode === "months" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <CalendarDays size={13} />По месяцам
            </button>
            <button onClick={() => setViewMode("forecast")} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors", viewMode === "forecast" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              <TrendingDown size={13} />Прогноз
            </button>
          </div>

          {(viewMode === "branches" || viewMode === "forecast") && (
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {(viewMode === "branches" || viewMode === "forecast") && summary && (
            <BranchFilter
              branches={allBranchCols.map(b => ({ code: b.branch_code, name: b.branch_name }))}
              selected={selectedBranchCodes}
              onChange={setSelectedBranchCodes}
            />
          )}

          <button
            onClick={() => setExcludeReturns(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
              excludeReturns
                ? "bg-orange-50 border-orange-300 text-orange-700"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", excludeReturns ? "bg-orange-400" : "bg-gray-300")} />
            {excludeReturns ? "Без возвратов" : "С возвратами"}
          </button>

          {viewMode === "branches" && (
            <button
              onClick={() => setShowPlan(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                showPlan
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              <Target size={14} />
              {showPlan ? "Скрыть план" : "Показать план"}
            </button>
          )}
        </div>
      </div>

      {/* ── MONTHS VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "months" && (
        <MonthsView months={months} />
      )}

      {/* ── FORECAST VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "forecast" && totalCol && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <TrendingDown size={15} className="text-indigo-500" />
            <span className="text-sm font-bold text-gray-800">Прогнозный P&L</span>
            <span className="text-xs text-gray-400 ml-2">Факт → прогноз на основе плана выручки. Установите план выручки в таблице «По филиалам».</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: Math.max(700, 300 + branchCols.length * 200) }}>
              <thead>
                <tr className="bg-gray-950 text-white">
                  <th className="text-left px-4 py-3 text-xs font-semibold w-52 sticky left-0 bg-gray-950 z-10">Показатель</th>
                  {forecastBranchCols.map(b => (
                    <th key={b.branch_code} className="text-center px-2 py-3 text-xs font-semibold" colSpan={2}>
                      {b.branch_name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-gray-900 text-white">
                  <th className="sticky left-0 bg-gray-900 px-4 py-2 text-[10px] text-gray-400">—</th>
                  {forecastBranchCols.map(b => (
                    <>
                      <th key={`${b.branch_code}-fact`} className="px-3 py-2 text-[10px] text-gray-400 text-right">Факт</th>
                      <th key={`${b.branch_code}-plan`} className="px-3 py-2 text-[10px] text-indigo-300 text-right">Прогноз</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Выручка", fact: (b: typeof forecastBranchCols[0]) => b.revenue_total, forecast: (b: typeof forecastBranchCols[0]) => b.fRev, color: "text-gray-800", bold: true },
                  { label: "Себестоимость", fact: (b: typeof forecastBranchCols[0]) => -b.cogs, forecast: (b: typeof forecastBranchCols[0]) => -b.fCogs, color: "text-red-500" },
                  { label: "Валовая прибыль", fact: (b: typeof forecastBranchCols[0]) => b.gross_profit, forecast: (b: typeof forecastBranchCols[0]) => b.fGross, color: "text-green-600", bold: true },
                  { label: "Опер. расходы", fact: (b: typeof forecastBranchCols[0]) => -b.total_opex, forecast: (b: typeof forecastBranchCols[0]) => -b.fOpex, color: "text-red-400" },
                  { label: "EBITDA", fact: (b: typeof forecastBranchCols[0]) => b.ebitda, forecast: (b: typeof forecastBranchCols[0]) => b.fEbitda, color: "text-indigo-600", bold: true },
                ].map(row => (
                  <tr key={row.label} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className={cn("px-4 py-2.5 text-xs sticky left-0 bg-white", row.bold ? "font-bold text-gray-800" : "text-gray-600")}>{row.label}</td>
                    {forecastBranchCols.map(b => {
                      const fv = row.fact(b);
                      const pv = row.forecast(b);
                      const diff = pv - fv;
                      return (
                        <>
                          <td key={`${b.branch_code}-f`} className={cn("px-3 py-2.5 text-right text-xs tabular-nums", row.color)}>{fmt(fv)}</td>
                          <td key={`${b.branch_code}-p`} className={cn("px-3 py-2.5 text-right text-xs tabular-nums font-semibold bg-indigo-50/40", row.color)}>
                            {fmt(pv)}
                            {diff !== 0 && <div className={cn("text-[9px]", diff > 0 ? "text-green-500" : "text-red-400")}>{diff > 0 ? "+" : ""}{fmt(diff)}</div>}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BRANCHES VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "branches" && totalCol && (
        <>
          {/* P&L Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-collapse"
                style={{ minWidth: Math.max(700, 220 + branchCols.length * 160) }}
              >
                <thead>
                  <tr className="bg-gray-950 text-white">
                    <th className="text-left px-4 py-3 text-xs font-semibold w-52 sticky left-0 bg-gray-950 z-10">
                      Показатель
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold w-40 bg-indigo-900">
                      Итого
                    </th>
                    {branchCols.map(b => (
                      <th key={b.branch_code} className="text-right px-4 py-3 text-xs font-semibold w-40">
                        {b.branch_name}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* ── ДОХОДЫ ──────────────────────────────────────────────── */}
                  <SectionHeader
                    label="ДОХОДЫ"
                    id="revenue"
                    open={sectionsOpen.has("revenue")}
                    onToggle={() => toggleSection("revenue")}
                  />
                  {sectionsOpen.has("revenue") && (
                    <>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-800 sticky left-0 bg-white">
                          Реализация (факт)
                        </td>
                        <AmountCell value={totalCol.revenue_total} bold />
                        {branchCols.map(b => (
                          <AmountCell key={b.branch_code} value={b.revenue_total} share={totalCol.revenue_total} />
                        ))}
                      </tr>

                      {/* Revenue by category — expandable to product SKUs */}
                      {categories.map(cat => (
                        <CatDrillRow
                          key={cat}
                          cat={cat}
                          mode="revenue"
                          totalCol={totalCol}
                          branchCols={branchCols}
                          isExpanded={expandedCats.has(cat)}
                          onToggle={() => toggleCat(cat)}
                          productIndex={productIndex}
                        />
                      ))}

                      {showPlan && (
                        <tr className="border-b border-dashed border-gray-100 bg-indigo-50/30 hover:bg-indigo-50/50">
                          <td className="px-4 py-2 text-xs text-indigo-600 font-medium sticky left-0 bg-indigo-50/30 pl-8">
                            <div className="flex items-center gap-1"><Target size={10} />План выручки</div>
                          </td>
                          <td className="text-right px-4 py-2">
                            {totalCol.revenue_plan
                              ? <span className="text-xs text-indigo-600 tabular-nums">{fmt(totalCol.revenue_plan)}</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          {branchCols.map(b => (
                            <td key={b.branch_code} className="text-right px-4 py-2">
                              <EditCell
                                value={b.revenue_plan}
                                onSave={v => saveRevenuePlan(b.branch_code, v)}
                                placeholder="Задать план"
                                className="text-indigo-600"
                              />
                              <ProgressBar actual={b.revenue_total} plan={b.revenue_plan} />
                            </td>
                          ))}
                        </tr>
                      )}
                    </>
                  )}

                  {/* ── СЕБЕСТОИМОСТЬ ──────────────────────────────────────── */}
                  <SectionHeader
                    label="СЕБЕСТОИМОСТЬ"
                    id="cogs"
                    open={sectionsOpen.has("cogs")}
                    onToggle={() => toggleSection("cogs")}
                  />
                  {sectionsOpen.has("cogs") && (
                    <>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-xs text-gray-600 sticky left-0 bg-white pl-8">
                          Себестоим. товаров (COGS)
                        </td>
                        <AmountCell value={-totalCol.cogs} negative />
                        {branchCols.map(b => (
                          <AmountCell key={b.branch_code} value={-b.cogs} share={-totalCol.cogs} negative />
                        ))}
                      </tr>
                      {/* COGS by category — expandable to product SKUs */}
                      {categories.map(cat => (
                        <CatDrillRow
                          key={cat}
                          cat={cat}
                          mode="cogs"
                          totalCol={totalCol}
                          branchCols={branchCols}
                          isExpanded={expandedCats.has(cat)}
                          onToggle={() => toggleCat(cat)}
                          productIndex={productIndex}
                        />
                      ))}
                      {/* Справочно: из них потери на бонусах */}
                      {totalCol.bonus_losses > 0 && (
                        <tr className="border-b border-gray-50 bg-amber-50/20">
                          <td className="px-4 py-1.5 text-[10px] text-amber-600 sticky left-0 bg-amber-50/20 pl-10">
                            в т.ч. потери (бонусы и акции)
                          </td>
                          {[totalCol, ...branchCols].map(b => (
                            <td key={b.branch_code} className="text-right px-4 py-1.5">
                              {b.bonus_losses > 0 ? (
                                <span className="text-[10px] text-amber-600 tabular-nums">
                                  -{fmt(b.bonus_losses)}
                                </span>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      )}
                    </>
                  )}

                  {/* ── ВАЛОВАЯ ПРИБЫЛЬ ────────────────────────────────────── */}
                  <tr className="border-b-2 border-t-2 border-gray-200 bg-green-50/50">
                    <td className="px-4 py-3 text-sm font-black text-gray-900 sticky left-0 bg-green-50/50">
                      ВАЛОВАЯ ПРИБЫЛЬ
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className={cn("text-sm font-black tabular-nums", totalCol.gross_profit >= 0 ? "text-green-700" : "text-red-600")}>
                        {fmtFull(totalCol.gross_profit)}
                      </div>
                      <div className="text-[10px] text-green-500 font-semibold">{fmtPct(totalCol.gross_margin)}</div>
                    </td>
                    {branchCols.map(b => (
                      <td key={b.branch_code} className="text-right px-4 py-3">
                        <div className={cn("text-xs font-bold tabular-nums", b.gross_profit >= 0 ? "text-green-700" : "text-red-600")}>
                          {fmt(b.gross_profit)}
                        </div>
                        <div className="text-[9px] text-green-500">{fmtPct(b.gross_margin)}</div>
                      </td>
                    ))}
                  </tr>

                  {/* Gross profit by category — expandable to product SKUs */}
                  {categories.map(cat => (
                    <CatDrillRow
                      key={cat}
                      cat={cat}
                      mode="gross"
                      totalCol={totalCol}
                      branchCols={branchCols}
                      isExpanded={expandedCats.has(cat)}
                      onToggle={() => toggleCat(cat)}
                      productIndex={productIndex}
                    />
                  ))}

                  {/* ── ОПЕРАЦИОННЫЕ РАСХОДЫ ──────────────────────────────── */}
                  <SectionHeader
                    label="ОПЕРАЦИОННЫЕ РАСХОДЫ"
                    id="expenses"
                    open={sectionsOpen.has("expenses")}
                    onToggle={() => toggleSection("expenses")}
                  />
                  {sectionsOpen.has("expenses") && (
                    <>
                      {expenseCats.map(cat => (
                        <ExpenseRow
                          key={cat}
                          label={cat}
                          category={cat}
                          totalCol={totalCol}
                          branchCols={branchCols}
                          showPlan={showPlan}
                          deletable={!["ФОТ", "Аренда", "Маркетинг", "Логистика", "Адм. расходы", "Кредит (проценты)", "Кредит (осн. долг)", "Прочие расходы"].includes(cat)}
                          periodDate={periodDate!}
                          onSaveActual={(bc, v) => saveExpense(bc, cat, "actual", v)}
                          onSavePlan={(bc, v) => saveExpense(bc, cat, "plan", v)}
                          onDelete={() => deleteCategory.mutate({ period_date: periodDate!, category: cat })}
                        />
                      ))}

                      {/* Add custom category */}
                      <tr className="border-b border-gray-50">
                        <td colSpan={2 + branchCols.length} className="px-4 py-2">
                          {addingCat ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={newCatName}
                                onChange={e => setNewCatName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") addCustomCategory();
                                  if (e.key === "Escape") setAddingCat(false);
                                }}
                                placeholder="Название статьи расходов..."
                                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                              <button
                                onClick={addCustomCategory}
                                className="text-xs text-indigo-600 font-semibold hover:text-indigo-800"
                              >
                                Добавить
                              </button>
                              <button
                                onClick={() => setAddingCat(false)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingCat(true)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              <Plus size={12} />Добавить статью расходов
                            </button>
                          )}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* ── EBITDA ────────────────────────────────────────────── */}
                  <tr className="border-b-2 border-t-2 border-gray-300 bg-indigo-50">
                    <td className="px-4 py-3 text-sm font-black text-gray-900 sticky left-0 bg-indigo-50">
                      EBITDA
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className={cn("text-sm font-black tabular-nums", totalCol.ebitda >= 0 ? "text-indigo-700" : "text-red-600")}>
                        {fmtFull(totalCol.ebitda)}
                      </div>
                      <div className={cn("text-[10px] font-semibold", totalCol.ebitda >= 0 ? "text-indigo-500" : "text-red-400")}>
                        {fmtPct(totalCol.ebitda_margin)}
                      </div>
                    </td>
                    {branchCols.map(b => (
                      <td key={b.branch_code} className="text-right px-4 py-3">
                        <div className={cn("text-xs font-bold tabular-nums", b.ebitda >= 0 ? "text-indigo-700" : "text-red-600")}>
                          {fmt(b.ebitda)}
                        </div>
                        <div className={cn("text-[9px] font-semibold", b.ebitda >= 0 ? "text-indigo-500" : "text-red-400")}>
                          {fmtPct(b.ebitda_margin)}
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* ── KPI ───────────────────────────────────────────────── */}
                  <SectionHeader
                    label="KPI"
                    id="kpi"
                    open={sectionsOpen.has("kpi")}
                    onToggle={() => toggleSection("kpi")}
                  />
                  {sectionsOpen.has("kpi") && (
                    <>
                      {/* Объём продаж */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          Объём продаж (кол-во шт)
                        </td>
                        <td className="text-right px-4 py-2">
                          <span className="text-xs font-bold text-gray-800 tabular-nums">
                            {Math.round(totalCol.revenue_qty).toLocaleString("ru")} шт
                          </span>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <span className="text-xs text-gray-700 tabular-nums">
                              {Math.round(b.revenue_qty).toLocaleString("ru")} шт
                            </span>
                          </td>
                        ))}
                      </tr>

                      {/* Корзина продаж — вычисляется из выручки / кол-во, чтобы числа сходились */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          <div>Корзина продаж (факт)</div>
                          <div className="text-[9px] text-gray-400">выручка ÷ кол-во шт</div>
                        </td>
                        <td className="text-right px-4 py-2">
                          <div className="text-xs font-bold text-gray-800 tabular-nums">
                            {totalCol.revenue_qty > 0 ? fmt(totalCol.revenue_total / totalCol.revenue_qty) : "—"}
                          </div>
                          <div className="text-[9px] text-gray-400 tabular-nums">
                            {fmt(totalCol.revenue_total)} ÷ {Math.round(totalCol.revenue_qty).toLocaleString("ru")}
                          </div>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <div className="text-xs font-semibold text-gray-700 tabular-nums">
                              {b.revenue_qty > 0 ? fmt(b.revenue_total / b.revenue_qty) : "—"}
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* Корзина план */}
                      {showPlan && (
                        <tr className="border-b border-dashed border-gray-100 bg-indigo-50/20 hover:bg-indigo-50/40">
                          <td className="px-4 py-2 text-xs text-indigo-500 sticky left-0 bg-indigo-50/20 pl-8">
                            <div className="flex items-center gap-1"><Target size={10} />Корзина (план)</div>
                          </td>
                          <td className="text-right px-4 py-2">
                            {totalCol.basket_plan
                              ? <span className="text-xs text-indigo-600 tabular-nums">{fmt(totalCol.basket_plan)}</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          {branchCols.map(b => {
                            const basketActual = b.revenue_qty > 0 ? b.revenue_total / b.revenue_qty : 0;
                            return (
                              <td key={b.branch_code} className="text-right px-4 py-2">
                                <EditCell
                                  value={b.basket_plan}
                                  onSave={v => saveBasketPlan(b.branch_code, v)}
                                  placeholder="Задать план"
                                  className="text-indigo-600"
                                />
                                <ProgressBar actual={basketActual} plan={b.basket_plan} />
                              </td>
                            );
                          })}
                        </tr>
                      )}

                      {/* % выполнения плана выручки */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          % выполнения плана (выручка)
                        </td>
                        <td className="text-right px-4 py-2">
                          {totalCol.revenue_plan
                            ? <PctBadge pct={(totalCol.revenue_total / totalCol.revenue_plan) * 100} />
                            : <span className="text-xs text-gray-300">Нет плана</span>}
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            {b.revenue_plan
                              ? <PctBadge pct={(b.revenue_total / b.revenue_plan) * 100} />
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>

                      {/* Себестоимость на единицу */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          <div>Себест. на единицу</div>
                          <div className="text-[9px] text-gray-400">COGS ÷ кол-во шт</div>
                        </td>
                        <td className="text-right px-4 py-2">
                          <span className="text-xs font-semibold text-gray-700 tabular-nums">
                            {totalCol.revenue_qty > 0 ? fmt(totalCol.cogs / totalCol.revenue_qty) : "—"}
                          </span>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <span className="text-xs text-gray-600 tabular-nums">
                              {b.revenue_qty > 0 ? fmt(b.cogs / b.revenue_qty) : "—"}
                            </span>
                          </td>
                        ))}
                      </tr>

                      {/* Валовая прибыль на единицу */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          <div>Вал. прибыль на единицу</div>
                          <div className="text-[9px] text-gray-400">вал. прибыль ÷ кол-во шт</div>
                        </td>
                        <td className="text-right px-4 py-2">
                          <span className={cn("text-xs font-semibold tabular-nums", totalCol.gross_profit >= 0 ? "text-green-700" : "text-red-600")}>
                            {totalCol.revenue_qty > 0 ? fmt(totalCol.gross_profit / totalCol.revenue_qty) : "—"}
                          </span>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <span className={cn("text-xs tabular-nums", b.gross_profit >= 0 ? "text-green-600" : "text-red-500")}>
                              {b.revenue_qty > 0 ? fmt(b.gross_profit / b.revenue_qty) : "—"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-gray-400 px-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-indigo-100 border border-indigo-300" />
              Кликните ячейку плана для редактирования
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-green-100 border border-green-300" />≥ 100%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-100 border border-amber-300" />80–99%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-100 border border-red-300" />&lt; 80%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Months view ────────────────────────────────────────────────────────────────
function MonthsView({ months }: { months: PnlMonthRow[] }) {
  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <CalendarDays size={32} className="text-gray-300" />
        <div className="text-sm">Нет данных по периодам.</div>
      </div>
    );
  }

  const chartData = months.map(m => ({
    name: m.label,
    revenue: Math.round(m.revenue),
    gross_profit: Math.round(m.gross_profit),
    ebitda: Math.round(m.ebitda),
  }));

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Динамика по месяцам
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} width={70} />
            <Tooltip
              formatter={(v: number, name: string) => [
                fmt(v),
                name === "revenue" ? "Выручка" : name === "gross_profit" ? "Вал. прибыль" : "EBITDA",
              ]}
            />
            <Legend formatter={(v) => v === "revenue" ? "Выручка" : v === "gross_profit" ? "Вал. прибыль" : "EBITDA"} />
            <Bar dataKey="revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="gross_profit" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="ebitda" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr className="bg-gray-950 text-white">
                <th className="text-left px-4 py-3 text-xs font-semibold">Период</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Выручка</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">COGS</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Вал. прибыль</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Рент. ВП</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Потери (бонусы)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">EBITDA</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Рент. EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const prev = months[i - 1];
                const revGrowth = prev && prev.revenue > 0
                  ? ((m.revenue - prev.revenue) / prev.revenue) * 100
                  : null;
                return (
                  <tr key={m.period_date} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-800">
                      {m.label}
                      {revGrowth != null && (
                        <span className={cn("ml-2 text-[10px] font-normal", revGrowth >= 0 ? "text-green-500" : "text-red-400")}>
                          {revGrowth >= 0 ? "+" : ""}{revGrowth.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="text-right px-4 py-3 text-xs tabular-nums font-semibold text-gray-800">
                      {fmt(m.revenue)}
                    </td>
                    <td className="text-right px-4 py-3 text-xs tabular-nums text-red-500">
                      -{fmt(m.cogs)}
                    </td>
                    <td className="text-right px-4 py-3 text-xs tabular-nums text-green-700 font-semibold">
                      {fmt(m.gross_profit)}
                    </td>
                    <td className="text-right px-4 py-3 text-[10px] text-green-500">
                      {fmtPct(m.gross_margin)}
                    </td>
                    <td className="text-right px-4 py-3 text-xs tabular-nums text-amber-600">
                      -{fmt(m.bonus_losses)}
                    </td>
                    <td className={cn("text-right px-4 py-3 text-xs tabular-nums font-bold", m.ebitda >= 0 ? "text-indigo-700" : "text-red-600")}>
                      {fmt(m.ebitda)}
                    </td>
                    <td className={cn("text-right px-4 py-3 text-[10px] font-semibold", m.ebitda_margin >= 0 ? "text-indigo-500" : "text-red-400")}>
                      {fmtPct(m.ebitda_margin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionHeader({ label, id, open, onToggle }: { label: string; id: string; open: boolean; onToggle: () => void }) {
  return (
    <tr className="bg-gray-100 border-b border-gray-200 cursor-pointer" onClick={onToggle}>
      <td colSpan={100} className="px-4 py-2 sticky left-0">
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        </div>
      </td>
    </tr>
  );
}

function AmountCell({
  value, share, negative = false, bold = false,
}: {
  value: number; share?: number; negative?: boolean; bold?: boolean;
}) {
  const colorClass = negative
    ? value < 0 ? "text-red-600" : "text-gray-400"
    : value >= 0 ? (bold ? "text-gray-900" : "text-gray-700") : "text-red-600";
  return (
    <td className="text-right px-4 py-2.5">
      <div className={cn("tabular-nums", bold ? "text-sm font-black" : "text-xs font-semibold", colorClass)}>
        {fmt(value)}
      </div>
      {share != null && share !== 0 && (
        <div className="text-[9px] text-gray-400">{((value / share) * 100).toFixed(1)}%</div>
      )}
    </td>
  );
}

function CatDrillRow({
  cat, mode, totalCol, branchCols, isExpanded, onToggle, productIndex,
}: {
  cat: string;
  mode: "revenue" | "cogs" | "gross";
  totalCol: PnlBranchData;
  branchCols: PnlBranchData[];
  isExpanded: boolean;
  onToggle: () => void;
  productIndex: Map<string, Map<string, PnlProduct[]>>;
}) {
  const catProducts = productIndex.get(cat);

  // Collect unique products by code, sorted by total value desc
  const prodMap = new Map<string, { code: string; name: string }>();
  catProducts?.forEach(prods => {
    prods.forEach(p => { if (!prodMap.has(p.code)) prodMap.set(p.code, { code: p.code, name: p.name }); });
  });

  function getVal(b: PnlBranchData) {
    if (mode === "revenue") return b.revenue_by_cat?.[cat] ?? 0;
    if (mode === "cogs") return b.cogs_by_cat?.[cat] ?? 0;
    return (b.revenue_by_cat?.[cat] ?? 0) - (b.cogs_by_cat?.[cat] ?? 0);
  }
  function getTotalVal() {
    if (mode === "revenue") return totalCol.revenue_by_cat?.[cat] ?? 0;
    if (mode === "cogs") return totalCol.cogs_by_cat?.[cat] ?? 0;
    return (totalCol.revenue_by_cat?.[cat] ?? 0) - (totalCol.cogs_by_cat?.[cat] ?? 0);
  }
  function getProdVal(p: PnlProduct) {
    if (mode === "revenue") return p.revenue;
    if (mode === "cogs") return p.cogs;
    return p.revenue - p.cogs;
  }

  const totalAmt = getTotalVal();
  const sign = mode === "cogs" ? -1 : 1;
  const rowBg = mode === "gross" ? "bg-green-50/20" : "bg-gray-50/20";
  const textColor = mode === "revenue" ? "text-gray-700" : mode === "cogs" ? "text-red-500" : (totalAmt >= 0 ? "text-green-700" : "text-red-500");
  const subColor = mode === "revenue" ? "text-gray-600" : mode === "cogs" ? "text-red-400" : "text-green-600";
  const baseTotal = mode === "cogs" ? totalCol.cogs : totalCol.revenue_total;

  const productList = Array.from(prodMap.values()).sort((a, b) => {
    const aSum = branchCols.reduce((s, br) => s + (catProducts?.get(br.branch_code)?.find(p => p.code === a.code) ? getProdVal(catProducts.get(br.branch_code)!.find(p => p.code === a.code)!) : 0), 0);
    const bSum = branchCols.reduce((s, br) => s + (catProducts?.get(br.branch_code)?.find(p => p.code === b.code) ? getProdVal(catProducts.get(br.branch_code)!.find(p => p.code === b.code)!) : 0), 0);
    return Math.abs(bSum) - Math.abs(aSum);
  });

  return (
    <>
      <tr className={cn("border-b border-gray-50 hover:bg-indigo-50/20 cursor-pointer", rowBg)} onClick={onToggle}>
        <td className={cn("px-4 py-1.5 text-xs text-gray-500 sticky left-0 pl-8", rowBg)}>
          <div className="flex items-center gap-1">
            {isExpanded ? <ChevronDown size={10} className="text-indigo-400" /> : <ChevronRight size={10} className="text-gray-400" />}
            <Package size={9} className="text-gray-300 flex-shrink-0" />
            <span>{cat}</span>
          </div>
        </td>
        <td className="text-right px-4 py-1.5">
          <span className={cn("text-xs tabular-nums font-medium", textColor)}>
            {totalAmt ? fmt(sign * totalAmt) : "—"}
          </span>
          {baseTotal > 0 && totalAmt > 0 && (
            <div className="text-[9px] text-gray-400">{(totalAmt / baseTotal * 100).toFixed(1)}%</div>
          )}
        </td>
        {branchCols.map(b => {
          const amt = getVal(b);
          const base = mode === "cogs" ? b.cogs : b.revenue_total;
          return (
            <td key={b.branch_code} className="text-right px-4 py-1.5">
              <span className={cn("text-xs tabular-nums", amt ? subColor : "text-gray-300")}>
                {amt ? fmt(sign * amt) : "—"}
              </span>
              {base > 0 && amt > 0 && (
                <div className="text-[9px] text-gray-400">{(amt / base * 100).toFixed(1)}%</div>
              )}
            </td>
          );
        })}
      </tr>

      {isExpanded && productList.map(prod => {
        const totalProdAmt = branchCols.reduce((s, b) => {
          const p = catProducts?.get(b.branch_code)?.find(pr => pr.code === prod.code);
          return s + (p ? getProdVal(p) : 0);
        }, 0);
        return (
          <tr key={prod.code} className="border-b border-gray-50/30 bg-indigo-50/5 hover:bg-indigo-50/15">
            <td className="px-4 py-1 text-[10px] text-gray-400 sticky left-0 bg-indigo-50/5 pl-14">
              <span className="text-gray-300 mr-1 font-mono">{prod.code}</span>
              <span className="truncate">{prod.name}</span>
            </td>
            <td className="text-right px-4 py-1">
              <span className={cn("text-[10px] tabular-nums font-medium", totalProdAmt ? textColor : "text-gray-300")}>
                {totalProdAmt ? fmt(sign * totalProdAmt) : "—"}
              </span>
            </td>
            {branchCols.map(b => {
              const p = catProducts?.get(b.branch_code)?.find(pr => pr.code === prod.code);
              const amt = p ? getProdVal(p) : 0;
              return (
                <td key={b.branch_code} className="text-right px-4 py-1">
                  <span className={cn("text-[10px] tabular-nums", amt ? subColor : "text-gray-200")}>
                    {amt ? fmt(sign * amt) : "—"}
                  </span>
                  {mode === "revenue" && amt > 0 && p?.qty != null && (
                    <div className="text-[9px] text-gray-300">{Math.round(p.qty).toLocaleString("ru")} шт</div>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function ExpenseRow({
  label, category, totalCol, branchCols, showPlan, deletable, periodDate,
  onSaveActual, onSavePlan, onDelete,
}: {
  label: string; category: string;
  totalCol: PnlBranchData; branchCols: PnlBranchData[];
  showPlan: boolean; deletable?: boolean; periodDate: string;
  onSaveActual: (bc: string, v: number | null) => void;
  onSavePlan: (bc: string, v: number | null) => void;
  onDelete: () => void;
}) {
  const totalAmt = totalCol.expenses[category]?.actual ?? 0;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50/60 group">
        <td className="px-4 py-2 text-xs text-gray-600 sticky left-0 bg-white pl-8">
          <div className="flex items-center gap-2">
            <span className="flex-1">{label}</span>
            {deletable && (
              <button
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </td>
        <td className="text-right px-4 py-2">
          <span className={cn("text-xs font-semibold tabular-nums", totalAmt > 0 ? "text-red-600" : "text-gray-400")}>
            {totalAmt > 0 ? `-${fmt(totalAmt)}` : "—"}
          </span>
        </td>
        {branchCols.map(b => {
          const actual = b.expenses[category]?.actual ?? 0;
          return (
            <td key={b.branch_code} className="text-right px-4 py-2">
              <EditCell
                value={actual || null}
                onSave={v => onSaveActual(b.branch_code, v)}
                placeholder="Ввести"
                className={actual > 0 ? "text-red-600" : "text-gray-400"}
              />
            </td>
          );
        })}
      </tr>
      {showPlan && (
        <tr className="border-b border-dashed border-gray-50 bg-indigo-50/10 hover:bg-indigo-50/30">
          <td className="px-4 py-1.5 text-[10px] text-indigo-400 sticky left-0 bg-indigo-50/10 pl-12">
            <div className="flex items-center gap-1"><Target size={9} />план</div>
          </td>
          <td className="px-4 py-1.5" />
          {branchCols.map(b => {
            const plan = b.expenses[category]?.plan ?? null;
            const actual = b.expenses[category]?.actual ?? 0;
            return (
              <td key={b.branch_code} className="text-right px-4 py-1.5">
                <EditCell
                  value={plan}
                  onSave={v => onSavePlan(b.branch_code, v)}
                  placeholder="Задать план"
                  className="text-indigo-500"
                />
                {plan != null && <ProgressBar actual={actual} plan={plan} />}
              </td>
            );
          })}
        </tr>
      )}
    </>
  );
}
