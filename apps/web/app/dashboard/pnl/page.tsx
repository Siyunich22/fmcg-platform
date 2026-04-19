"use client";
import { useState, useEffect, useRef } from "react";
import {
  usePnlDates, usePnlSummary, useUpsertPnlExpense,
  useUpsertPnlTarget, useDeletePnlExpenseCategory,
  type PnlBranchData,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Plus, Trash2, Target, Loader2, ChevronDown, ChevronRight,
  BarChart2, RefreshCw,
} from "lucide-react";

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
  value, onSave, placeholder = "—", prefix = "", suffix = " ₸", className = "",
}: {
  value: number | null; onSave: (v: number | null) => void;
  placeholder?: string; prefix?: string; suffix?: string; className?: string;
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
        ? <span>{prefix}{fmt(value)}</span>
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

// ── P&L Row types ──────────────────────────────────────────────────────────────
type RowType = "section" | "auto" | "expense" | "computed" | "kpi";
interface PnlRow {
  id: string;
  label: string;
  type: RowType;
  category?: string;
  getValue: (b: PnlBranchData) => number | null;
  getPlan?: (b: PnlBranchData) => number | null;
  isNegative?: boolean; // shown in red
  isBold?: boolean;
  isHighlight?: boolean;
  deletable?: boolean;
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PnlPage() {
  const { data: dates = [] } = usePnlDates();
  const [selectedDate, setSelectedDate] = useState("");
  const [excludeReturns, setExcludeReturns] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState<Set<string>>(new Set(["revenue", "cogs", "expenses", "kpi"]));

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const { data: summary, isLoading } = usePnlSummary({
    period_date: selectedDate || undefined,
    exclude_returns: excludeReturns || undefined,
  });

  const upsertExpense = useUpsertPnlExpense();
  const upsertTarget = useUpsertPnlTarget();
  const deleteCategory = useDeletePnlExpenseCategory();

  const branches = summary?.branch_data ?? [];
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
    // Create entry for ALL branches (placeholder)
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

  // Build rows config
  const expenseRows: PnlRow[] = categories.map(cat => ({
    id: `exp_${cat}`,
    label: cat,
    type: "expense" as RowType,
    category: cat,
    isNegative: true,
    deletable: !["ФОТ", "Аренда", "Логистика", "Маркетинг", "Командировки", "Прочие расходы"].includes(cat),
    getValue: (b) => b.branch_code === "TOTAL"
      ? Object.values(b.expenses[cat] ? { v: b.expenses[cat]! } : {}).reduce((s, e) => s + e.actual, 0)
      : (b.expenses[cat]?.actual ?? 0),
    getPlan: (b) => b.branch_code === "TOTAL" ? null : (b.expenses[cat]?.plan ?? null),
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />Загрузка P&L...
      </div>
    );
  }

  if (!summary || branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <BarChart2 size={32} className="text-gray-300" />
        <div className="text-sm">Нет данных. Загрузите отчёт продаж в разделе Продажи.</div>
      </div>
    );
  }

  const totalCol = branches[0]; // "TOTAL" is always first
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
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={() => setExcludeReturns(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
              excludeReturns ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", excludeReturns ? "bg-orange-400" : "bg-gray-300")} />
            {excludeReturns ? "Без возвратов" : "С возвратами"}
          </button>
          <button
            onClick={() => setShowPlan(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
              showPlan ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            <Target size={14} />
            {showPlan ? "Скрыть план" : "Показать план"}
          </button>
        </div>
      </div>

      {/* P&L Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: Math.max(700, 220 + branchCols.length * 160) }}>

            {/* Column headers */}
            <thead>
              <tr className="bg-gray-950 text-white">
                <th className="text-left px-4 py-3 text-xs font-semibold w-52 sticky left-0 bg-gray-950 z-10">Показатель</th>
                <th className="text-right px-4 py-3 text-xs font-semibold w-40 bg-indigo-900">
                  <div>Итого</div>
                </th>
                {branchCols.map(b => (
                  <th key={b.branch_code} className="text-right px-4 py-3 text-xs font-semibold w-40">
                    {b.branch_name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ── ДОХОДЫ ─────────────────────────────────────────────────── */}
              <SectionHeader
                label="ДОХОДЫ"
                id="revenue"
                open={sectionsOpen.has("revenue")}
                onToggle={() => toggleSection("revenue")}
              />
              {sectionsOpen.has("revenue") && (
                <>
                  {/* Реализация */}
                  <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-800 sticky left-0 bg-white">
                      Реализация (факт)
                    </td>
                    <AmountCell value={totalCol.revenue_actual} bold />
                    {branchCols.map(b => (
                      <AmountCell key={b.branch_code} value={b.revenue_actual} share={totalCol.revenue_actual} />
                    ))}
                  </tr>

                  {/* Возвраты */}
                  {!excludeReturns && (
                    <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className="px-4 py-2 text-xs text-gray-500 sticky left-0 bg-white pl-8">в т.ч. возвраты</td>
                      {[totalCol, ...branchCols].map(b => (
                        <td key={b.branch_code} className="text-right px-4 py-2">
                          {b.returns < 0 && (
                            <span className="text-xs text-red-400 tabular-nums">{fmt(b.returns)}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )}

                  {/* Plan row */}
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
                          <ProgressBar actual={b.revenue_actual} plan={b.revenue_plan} />
                        </td>
                      ))}
                    </tr>
                  )}
                </>
              )}

              {/* ── СЕБЕСТОИМОСТЬ ──────────────────────────────────────────── */}
              <SectionHeader
                label="СЕБЕСТОИМОСТЬ"
                id="cogs"
                open={sectionsOpen.has("cogs")}
                onToggle={() => toggleSection("cogs")}
              />
              {sectionsOpen.has("cogs") && (
                <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 text-xs text-gray-600 sticky left-0 bg-white pl-8">Себестоим. товаров (COGS)</td>
                  <AmountCell value={-totalCol.cogs} negative />
                  {branchCols.map(b => (
                    <AmountCell key={b.branch_code} value={-b.cogs} share={-totalCol.cogs} negative />
                  ))}
                </tr>
              )}

              {/* ── ВАЛОВАЯ ПРИБЫЛЬ ─────────────────────────────────────────── */}
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

              {/* ── ОПЕРАЦИОННЫЕ РАСХОДЫ ────────────────────────────────────── */}
              <SectionHeader
                label="ОПЕРАЦИОННЫЕ РАСХОДЫ"
                id="expenses"
                open={sectionsOpen.has("expenses")}
                onToggle={() => toggleSection("expenses")}
              />
              {sectionsOpen.has("expenses") && (
                <>
                  {expenseRows.map(row => (
                    <ExpenseRow
                      key={row.id}
                      label={row.label}
                      category={row.category!}
                      totalCol={totalCol}
                      branchCols={branchCols}
                      showPlan={showPlan}
                      deletable={row.deletable}
                      periodDate={periodDate!}
                      onSaveActual={(bc, v) => saveExpense(bc, row.category!, "actual", v)}
                      onSavePlan={(bc, v) => saveExpense(bc, row.category!, "plan", v)}
                      onDelete={() => deleteCategory.mutate({ period_date: periodDate!, category: row.category! })}
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
                            onKeyDown={e => { if (e.key === "Enter") addCustomCategory(); if (e.key === "Escape") setAddingCat(false); }}
                            placeholder="Название статьи расходов..."
                            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          <button onClick={addCustomCategory} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Добавить</button>
                          <button onClick={() => setAddingCat(false)} className="text-xs text-gray-400 hover:text-gray-600">Отмена</button>
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

              {/* ── ОПЕРАЦИОННАЯ ПРИБЫЛЬ (EBIT) ──────────────────────────────── */}
              <tr className="border-b-2 border-t-2 border-gray-300 bg-indigo-50">
                <td className="px-4 py-3 text-sm font-black text-gray-900 sticky left-0 bg-indigo-50">
                  ОПЕРАЦ. ПРИБЫЛЬ (EBIT)
                </td>
                <td className="text-right px-4 py-3">
                  <div className={cn("text-sm font-black tabular-nums", totalCol.ebit >= 0 ? "text-indigo-700" : "text-red-600")}>
                    {fmtFull(totalCol.ebit)}
                  </div>
                  <div className={cn("text-[10px] font-semibold", totalCol.ebit >= 0 ? "text-indigo-500" : "text-red-400")}>
                    {fmtPct(totalCol.ebit_margin)}
                  </div>
                </td>
                {branchCols.map(b => (
                  <td key={b.branch_code} className="text-right px-4 py-3">
                    <div className={cn("text-xs font-bold tabular-nums", b.ebit >= 0 ? "text-indigo-700" : "text-red-600")}>
                      {fmt(b.ebit)}
                    </div>
                    <div className={cn("text-[9px] font-semibold", b.ebit >= 0 ? "text-indigo-500" : "text-red-400")}>
                      {fmtPct(b.ebit_margin)}
                    </div>
                  </td>
                ))}
              </tr>

              {/* ── KPI РАЗДЕЛ ─────────────────────────────────────────────── */}
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
                      <div className="text-xs font-bold text-gray-800 tabular-nums">{fmt(totalCol.basket_actual)}</div>
                    </td>
                    {branchCols.map(b => (
                      <td key={b.branch_code} className="text-right px-4 py-2">
                        <div className="text-xs font-semibold text-gray-700 tabular-nums">{fmt(b.basket_actual)}</div>
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

                  {/* % выполнения плана */}
                  <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-xs text-gray-600 font-medium sticky left-0 bg-white pl-8">
                      % выполнения плана (выручка)
                    </td>
                    <td className="text-right px-4 py-2">
                      {totalCol.revenue_plan
                        ? <PctBadge pct={(totalCol.revenue_actual / totalCol.revenue_plan) * 100} />
                        : <span className="text-xs text-gray-300">Нет плана</span>}
                    </td>
                    {branchCols.map(b => (
                      <td key={b.branch_code} className="text-right px-4 py-2">
                        {b.revenue_plan
                          ? <PctBadge pct={(b.revenue_actual / b.revenue_plan) * 100} />
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>

                  {/* Кол-во SKU */}
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
                        <span className="text-xs text-gray-700 tabular-nums">{b.revenue_qty.toLocaleString("ru")} шт</span>
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
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-100 border border-indigo-300" />Кликните ячейку плана для редактирования</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-100 border border-green-300" />Выполнено ≥ 100%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-100 border border-amber-300" />80–99%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-100 border border-red-300" />&lt; 80%</span>
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
  const totalActual = Object.values(totalCol.expenses[category] ? { v: totalCol.expenses[category]! } : {})
    .reduce((s, e) => s + e.actual, 0);
  // Actually for TOTAL, we get the pre-summed value from backend
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

function PctBadge({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-green-100 text-green-700" : pct >= 80 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
  return (
    <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums", color)}>
      {pct.toFixed(0)}%
    </span>
  );
}
