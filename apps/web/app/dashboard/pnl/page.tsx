"use client";
import { useState, useEffect, useRef } from "react";
import {
  usePnlDates, usePnlSummary, usePnlMonths, useUpsertPnlExpense,
  useUpsertPnlTarget, useDeletePnlExpenseCategory,
  type PnlBranchData, type PnlMonthRow,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Plus, Trash2, Target, Loader2, ChevronDown, ChevronRight,
  BarChart2, CalendarDays, GitCompare,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M ₸";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "K ₸";
  return n.toFixed(0) + " ₸";
}
function fmtFull(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
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

// ── Main Page ──────────────────────────────────────────────────────────────────
type ViewMode = "branches" | "months";

export default function PnlPage() {
  const { data: dates = [] } = usePnlDates();
  const [selectedDate, setSelectedDate] = useState("");
  const [excludeReturns, setExcludeReturns] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("branches");
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState<Set<string>>(
    new Set(["revenue", "cogs", "expenses", "kpi"])
  );

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const { data: summary, isLoading } = usePnlSummary({
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

  if (viewMode === "branches" && (!summary || branches.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <BarChart2 size={32} className="text-gray-300" />
        <div className="text-sm">Нет данных. Загрузите отчёт продаж в разделе Продажи.</div>
      </div>
    );
  }

  const totalCol = branches[0];
  const branchCols = branches.slice(1);

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
            <button
              onClick={() => setViewMode("branches")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "branches" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <BarChart2 size={13} />По филиалам
            </button>
            <button
              onClick={() => setViewMode("months")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "months" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <CalendarDays size={13} />По месяцам
            </button>
          </div>

          {viewMode === "branches" && (
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
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

      {/* ── BRANCHES VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "branches" && totalCol && (
        <>
          {/* Revenue by category cards */}
          {categories.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                Выручка по категориям (Итого)
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const amt = totalCol.revenue_by_cat?.[cat] ?? 0;
                  const share = totalCol.revenue_total > 0 ? (amt / totalCol.revenue_total) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">{cat}</div>
                        <div className="text-[10px] text-gray-400">{fmt(amt)} · {share.toFixed(1)}%</div>
                      </div>
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden ml-1">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                    <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-xs text-gray-600 sticky left-0 bg-white pl-8">
                        Себестоим. товаров (COGS)
                      </td>
                      <AmountCell value={-totalCol.cogs} negative />
                      {branchCols.map(b => (
                        <AmountCell key={b.branch_code} value={-b.cogs} share={-totalCol.cogs} negative />
                      ))}
                    </tr>
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
                          deletable={!["ФОТ", "Аренда", "Маркетинг", "Логистика", "Адм. расходы", "Прочие расходы"].includes(cat)}
                          periodDate={periodDate!}
                          onSaveActual={(bc, v) => saveExpense(bc, cat, "actual", v)}
                          onSavePlan={(bc, v) => saveExpense(bc, cat, "plan", v)}
                          onDelete={() => deleteCategory.mutate({ period_date: periodDate!, category: cat })}
                        />
                      ))}

                      {/* Потери на бонусах/акциях */}
                      <tr className="border-b border-gray-100 bg-amber-50/30 hover:bg-amber-50/50">
                        <td className="px-4 py-2 text-xs text-amber-700 font-medium sticky left-0 bg-amber-50/30 pl-8">
                          Потери (бонусы и акции)
                        </td>
                        <AmountCell value={-totalCol.bonus_losses} negative />
                        {branchCols.map(b => (
                          <AmountCell key={b.branch_code} value={-b.bonus_losses} share={-totalCol.bonus_losses} negative />
                        ))}
                      </tr>

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
                      {/* Корзина продаж */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          <div>Корзина продаж (факт)</div>
                          <div className="text-[9px] text-gray-400">реализация / кол-во шт</div>
                        </td>
                        <td className="text-right px-4 py-2">
                          <div className="text-xs font-bold text-gray-800 tabular-nums">
                            {fmt(totalCol.basket_actual)}
                          </div>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <div className="text-xs font-semibold text-gray-700 tabular-nums">
                              {fmt(b.basket_actual)}
                            </div>
                          </td>
                        ))}
                      </tr>

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
                          {branchCols.map(b => (
                            <td key={b.branch_code} className="text-right px-4 py-2">
                              <EditCell
                                value={b.basket_plan}
                                onSave={v => saveBasketPlan(b.branch_code, v)}
                                placeholder="Задать план"
                                className="text-indigo-600"
                              />
                              <ProgressBar actual={b.basket_actual} plan={b.basket_plan} />
                            </td>
                          ))}
                        </tr>
                      )}

                      {/* % плана */}
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

                      {/* Объём продаж */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                          Объём продаж (кол-во шт)
                        </td>
                        <td className="text-right px-4 py-2">
                          <span className="text-xs font-bold text-gray-800 tabular-nums">
                            {totalCol.revenue_qty.toLocaleString("ru")} шт
                          </span>
                        </td>
                        {branchCols.map(b => (
                          <td key={b.branch_code} className="text-right px-4 py-2">
                            <span className="text-xs text-gray-700 tabular-nums">
                              {b.revenue_qty.toLocaleString("ru")} шт
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
