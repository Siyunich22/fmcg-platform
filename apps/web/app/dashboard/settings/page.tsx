"use client";
import { useState, useEffect, useRef } from "react";
import {
  Building2, Pencil, Trash2, Check, X, Plus, CalendarDays,
  Copy, TrendingUp, Users, Loader2, ChevronRight,
} from "lucide-react";
import {
  usePnlDates, usePnlBudget, useSaveBudgetPlan, useCopyBudgetPeriod,
  useUpsertPnlTarget,
  useRentSettings, useCreateRentItem, useUpdateRentItem, useDeleteRentItem,
  useFotSetting, useUpsertFotSetting,
  useHqFotItems, useCreateHqFotItem, useUpdateHqFotItem, useDeleteHqFotItem,
  type RentItem, type HqFotItem,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const BRANCH_CODES = [
  "BEREКЕ", "AKTAU", "AKTOBE", "ALMATY", "ASTANA", "ATYRAU",
  "KARAGANDA", "KOKSHETAU", "SEMEY", "SHYMKENT", "MAIN",
];
const BRANCH_LABELS: Record<string, string> = {
  BEREКЕ: "Береке", AKTAU: "Актау", AKTOBE: "Актобе",
  ALMATY: "Алматы", ASTANA: "Астана", ATYRAU: "Атырау",
  KARAGANDA: "Кар-да", KOKSHETAU: "Кокш-у",
  SEMEY: "Семей", SHYMKENT: "Шымкент", MAIN: "ГО",
};
const BRANCH_FULL: Record<string, string> = {
  BEREКЕ: "Береке", AKTAU: "Актау", AKTOBE: "Актобе",
  ALMATY: "Алматы", ASTANA: "Астана", ATYRAU: "Атырау",
  KARAGANDA: "Кар-да", KOKSHETAU: "Кокшетау",
  SEMEY: "Семей", SHYMKENT: "Шымкент", MAIN: "Головной офис",
};

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { maximumFractionDigits: 0 }) + " ₸";
}

type TabId = "budget" | "rent" | "fot";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("budget");
  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "budget", label: "Бюджет по месяцам", icon: <CalendarDays size={15} /> },
    { id: "rent",   label: "Аренда",             icon: <Building2 size={15} /> },
    { id: "fot",    label: "ФОТ",                icon: <Users size={15} /> },
  ];

  return (
    <div className="max-w-[1600px] space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
              tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "budget" && <BudgetTab />}
      {tab === "rent"   && <RentTab />}
      {tab === "fot"    && <FotTab />}
    </div>
  );
}

// ── Editable budget cell ──────────────────────────────────────────────────────
function EditBudgetCell({
  value, onSave, colorClass = "text-gray-700",
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  colorClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    setEditing(false);
    const n = parseFloat(raw.replace(/[\s,]/g, ""));
    onSave(isNaN(n) ? null : n);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full text-right bg-blue-50 border border-blue-300 rounded px-1 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      title="Нажмите для редактирования"
      className={cn(
        "w-full text-right px-1 py-0.5 rounded text-xs tabular-nums hover:bg-blue-50 transition-colors",
        value != null && value !== 0 ? colorClass : "text-gray-300"
      )}
    >
      {value != null && value !== 0 ? fmt(value) : "—"}
    </button>
  );
}

// ── Budget tab ────────────────────────────────────────────────────────────────
function BudgetTab() {
  const { data: dates = [] } = usePnlDates();
  const [useCustom, setUseCustom] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState("");
  const [customMonth, setCustomMonth] = useState("");

  const savePlan   = useSaveBudgetPlan();
  const copyBudget = useCopyBudgetPeriod();
  const upsertTgt  = useUpsertPnlTarget();

  useEffect(() => {
    if (dates.length > 0 && !selectedExisting) setSelectedExisting(dates[0]);
  }, [dates, selectedExisting]);

  const activePeriod = useCustom
    ? (customMonth ? customMonth + "-01" : "")
    : selectedExisting;

  const { data: budget, isLoading } = usePnlBudget(activePeriod || undefined);

  const categories: string[] = budget?.categories ?? [
    "ФОТ", "Аренда", "Маркетинг", "Логистика", "Адм. расходы",
    "Кредит (проценты)", "Кредит (осн. долг)", "Прочие расходы",
  ];

  // dates[] is descending → previous = higher index
  const prevPeriod = useCustom
    ? (dates[0] ?? null)
    : dates.indexOf(selectedExisting) < dates.length - 1
      ? dates[dates.indexOf(selectedExisting) + 1]
      : null;

  function getPlan(bc: string, cat: string): number | null {
    return budget?.budget?.[bc]?.[cat]?.plan ?? null;
  }
  function getActual(bc: string, cat: string): number {
    return budget?.budget?.[bc]?.[cat]?.actual ?? 0;
  }
  function getRevPlan(bc: string): number | null {
    return budget?.revenue_targets?.[bc]?.plan ?? null;
  }
  function colExpenses(bc: string) {
    return categories.reduce((s, cat) => s + (getPlan(bc, cat) ?? 0), 0);
  }
  function rowTotal(cat: string) {
    return BRANCH_CODES.reduce((s, bc) => s + (getPlan(bc, cat) ?? 0), 0);
  }
  function rowRevTotal() {
    return BRANCH_CODES.reduce((s, bc) => s + (getRevPlan(bc) ?? 0), 0);
  }
  function colEbitda(bc: string) {
    return (getRevPlan(bc) ?? 0) - colExpenses(bc);
  }
  function totalExpAll() {
    return BRANCH_CODES.reduce((s, bc) => s + colExpenses(bc), 0);
  }
  function totalEbitdaAll() {
    return rowRevTotal() - totalExpAll();
  }

  function handleSaveExpense(bc: string, cat: string, val: number | null) {
    if (!activePeriod) return;
    savePlan.mutate({ period_date: activePeriod, branch_code: bc, category: cat, amount_plan: val });
  }
  function handleSaveRevenue(bc: string, val: number | null) {
    if (!activePeriod) return;
    upsertTgt.mutate({ period_date: activePeriod, branch_code: bc, revenue_plan: val });
  }

  const isCopyPending = copyBudget.isPending;

  return (
    <div className="space-y-4">
      {/* Period control bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
        <CalendarDays size={15} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-700">Период:</span>

        {useCustom ? (
          <>
            <input
              type="month"
              value={customMonth}
              onChange={e => setCustomMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"
            />
            <button
              onClick={() => { setUseCustom(false); setCustomMonth(""); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <select
              value={selectedExisting}
              onChange={e => setSelectedExisting(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button
              onClick={() => setUseCustom(true)}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Plus size={13} />Новый период
            </button>
          </>
        )}

        {prevPeriod && activePeriod && (
          <button
            onClick={() => copyBudget.mutate({ source_period: prevPeriod, target_period: activePeriod })}
            disabled={isCopyPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {isCopyPending ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
            Копировать из {prevPeriod}
          </button>
        )}
      </div>

      {!activePeriod && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          Выберите или введите период для редактирования бюджета
        </div>
      )}

      {/* Budget table */}
      {activePeriod && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
              <Loader2 size={16} className="animate-spin" />Загрузка...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-collapse"
                style={{ minWidth: Math.max(700, 180 + BRANCH_CODES.length * 120) }}
              >
                <thead>
                  <tr className="bg-gray-950 text-white">
                    <th className="text-left px-4 py-3 text-xs font-semibold sticky left-0 bg-gray-950 z-10 w-48">
                      Статья
                    </th>
                    <th className="text-right px-3 py-3 text-xs font-semibold bg-indigo-900 w-32">Итого</th>
                    {BRANCH_CODES.map(bc => (
                      <th key={bc} className="text-right px-3 py-3 text-xs font-semibold w-28">
                        {BRANCH_LABELS[bc]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue plan */}
                  <tr className="border-b border-indigo-100 bg-indigo-50/40">
                    <td className="px-4 py-2 sticky left-0 bg-indigo-50/40">
                      <div className="flex items-center gap-1 text-xs font-semibold text-indigo-700">
                        <TrendingUp size={11} />Выручка (план)
                      </div>
                    </td>
                    <td className="text-right px-3 py-2">
                      <span className="text-xs font-bold text-indigo-700 tabular-nums">
                        {rowRevTotal() ? fmt(rowRevTotal()) : "—"}
                      </span>
                    </td>
                    {BRANCH_CODES.map(bc => (
                      <td key={bc} className="px-2 py-1.5">
                        <EditBudgetCell
                          value={getRevPlan(bc)}
                          onSave={v => handleSaveRevenue(bc, v)}
                          colorClass="text-indigo-700"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Expense categories */}
                  {categories.map(cat => {
                    const total = rowTotal(cat);
                    const isCredit = cat.startsWith("Кредит");
                    const rowBg = isCredit ? "bg-amber-50/30" : "bg-white";
                    return (
                      <tr key={cat} className={cn("border-b border-gray-100 hover:bg-gray-50/50", isCredit && "bg-amber-50/20")}>
                        <td className={cn("px-4 py-2 text-xs text-gray-700 sticky left-0", rowBg, isCredit && "font-medium text-amber-800")}>
                          {cat}
                        </td>
                        <td className="text-right px-3 py-2">
                          <span className={cn("text-xs font-semibold tabular-nums", total > 0 ? "text-red-600" : "text-gray-300")}>
                            {total > 0 ? `-${fmt(total)}` : "—"}
                          </span>
                        </td>
                        {BRANCH_CODES.map(bc => {
                          const plan   = getPlan(bc, cat);
                          const actual = getActual(bc, cat);
                          return (
                            <td key={bc} className="px-2 py-1.5">
                              <EditBudgetCell
                                value={plan}
                                onSave={v => handleSaveExpense(bc, cat, v)}
                                colorClass="text-red-600"
                              />
                              {actual > 0 && (
                                <div className="text-[9px] text-gray-400 tabular-nums text-right pr-1">
                                  ф: {fmt(actual)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Total expenses */}
                  <tr className="border-b border-t border-gray-200 bg-red-50/20">
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-800 sticky left-0 bg-red-50/20">
                      Итого расходы
                    </td>
                    <td className="text-right px-3 py-2.5">
                      <span className={cn("text-xs font-bold tabular-nums", totalExpAll() > 0 ? "text-red-600" : "text-gray-300")}>
                        {totalExpAll() > 0 ? `-${fmt(totalExpAll())}` : "—"}
                      </span>
                    </td>
                    {BRANCH_CODES.map(bc => {
                      const exp = colExpenses(bc);
                      return (
                        <td key={bc} className="text-right px-3 py-2.5">
                          <span className={cn("text-xs font-semibold tabular-nums", exp > 0 ? "text-red-600" : "text-gray-300")}>
                            {exp > 0 ? `-${fmt(exp)}` : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* EBITDA */}
                  <tr className="bg-indigo-50/50">
                    <td className="px-4 py-3 text-xs font-black text-gray-900 sticky left-0 bg-indigo-50/50">
                      EBITDA (прогноз)
                    </td>
                    <td className="text-right px-3 py-3">
                      {rowRevTotal() > 0 && (
                        <span className={cn("text-sm font-black tabular-nums", totalEbitdaAll() >= 0 ? "text-indigo-700" : "text-red-600")}>
                          {fmt(totalEbitdaAll())}
                        </span>
                      )}
                    </td>
                    {BRANCH_CODES.map(bc => {
                      const rev = getRevPlan(bc) ?? 0;
                      const exp = colExpenses(bc);
                      const e   = colEbitda(bc);
                      return (
                        <td key={bc} className="text-right px-3 py-3">
                          {(rev > 0 || exp > 0) && (
                            <>
                              <div className={cn("text-xs font-bold tabular-nums", e >= 0 ? "text-indigo-700" : "text-red-600")}>
                                {fmt(e)}
                              </div>
                              {rev > 0 && (
                                <div className="text-[9px] text-gray-400">
                                  {(e / rev * 100).toFixed(1)}%
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 px-1">
        Серым отображаются фактические значения из P&L. Кликните ячейку для ввода планового значения.
      </p>
    </div>
  );
}

// ── Rent tab ──────────────────────────────────────────────────────────────────
type RentEditState = Omit<RentItem, "monthly_rent" | "area_sqm" | "price_per_sqm"> & { area_sqm: string; price_per_sqm: string };
type RentNewState  = { branch_code: string; label: string; area_sqm: string; price_per_sqm: string; notes: string };

const ALL_BRANCHES = Object.keys(BRANCH_FULL);

function RentTab() {
  const { data: rentList = [], isLoading } = useRentSettings();
  const createRent = useCreateRentItem();
  const updateRent = useUpdateRentItem();
  const deleteRent = useDeleteRentItem();

  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [editState,  setEditState]  = useState<RentEditState | null>(null);
  const [newRows,    setNewRows]    = useState<RentNewState[]>([]);

  const grouped: Record<string, RentItem[]> = {};
  for (const r of rentList) {
    if (!grouped[r.branch_code]) grouped[r.branch_code] = [];
    grouped[r.branch_code].push(r);
  }

  function startEdit(r: RentItem) {
    setEditingId(r.id);
    setEditState({ ...r, area_sqm: String(r.area_sqm), price_per_sqm: String(r.price_per_sqm) });
  }
  async function saveEdit() {
    if (!editState) return;
    await updateRent.mutateAsync({
      id: editState.id, branch_code: editState.branch_code, label: editState.label,
      area_sqm: parseFloat(editState.area_sqm) || 0,
      price_per_sqm: parseFloat(editState.price_per_sqm) || 0,
      notes: editState.notes || undefined,
    });
    setEditingId(null); setEditState(null);
  }
  async function saveNew(n: RentNewState) {
    if (!n.branch_code || !n.label) return;
    await createRent.mutateAsync({
      branch_code: n.branch_code, label: n.label,
      area_sqm: parseFloat(n.area_sqm) || 0,
      price_per_sqm: parseFloat(n.price_per_sqm) || 0,
      notes: n.notes || undefined,
    });
    setNewRows(p => p.filter(x => x !== n));
  }

  const totalRent = rentList.reduce((s, r) => s + r.monthly_rent, 0);

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-w-4xl">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={16} className="text-gray-400" />Аренда по филиалам
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Несколько строк на филиал (офис, склад и др.) — суммируется в P&amp;L автоматически.
          </p>
        </div>
        <button
          onClick={() => setNewRows(p => [...p, { branch_code: "", label: "Офис", area_sqm: "", price_per_sqm: "", notes: "" }])}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
        >
          <Plus size={13} />Добавить строку
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Филиал</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Тип</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">м²</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">₸/м²</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Аренда/мес</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Примечание</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-400">Загрузка...</td></tr>}

            {Object.entries(grouped).map(([bc, items]) => {
              const branchTotal = items.reduce((s, r) => s + r.monthly_rent, 0);
              return (
                <RentBranchRows
                  key={bc}
                  bc={bc}
                  items={items}
                  branchTotal={branchTotal}
                  editingId={editingId}
                  editState={editState}
                  onStartEdit={startEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditState(null); }}
                  onEditChange={s => setEditState(s)}
                  onDelete={id => deleteRent.mutate(id)}
                />
              );
            })}

            {newRows.map((n, idx) => (
              <tr key={`new-${idx}`} className="bg-green-50">
                <td className="px-6 py-2">
                  <select
                    value={n.branch_code}
                    onChange={e => setNewRows(p => p.map((x, i) => i === idx ? { ...x, branch_code: e.target.value } : x))}
                    className="px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Филиал...</option>
                    {ALL_BRANCHES.map(b => <option key={b} value={b}>{BRANCH_FULL[b]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input value={n.label}
                    onChange={e => setNewRows(p => p.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                    placeholder="Офис / Склад"
                    className="w-28 px-2 py-1 border border-green-300 rounded text-sm focus:outline-none" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={n.area_sqm}
                    onChange={e => setNewRows(p => p.map((x, i) => i === idx ? { ...x, area_sqm: e.target.value } : x))}
                    placeholder="м²"
                    className="w-20 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={n.price_per_sqm}
                    onChange={e => setNewRows(p => p.map((x, i) => i === idx ? { ...x, price_per_sqm: e.target.value } : x))}
                    placeholder="₸/м²"
                    className="w-28 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none" />
                </td>
                <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">
                  {fmt((parseFloat(n.area_sqm) || 0) * (parseFloat(n.price_per_sqm) || 0))}
                </td>
                <td className="px-4 py-2">
                  <input value={n.notes}
                    onChange={e => setNewRows(p => p.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                    placeholder="Примечание"
                    className="w-full px-2 py-1 border border-green-300 rounded text-sm focus:outline-none" />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => saveNew(n)} disabled={!n.branch_code || !n.label} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"><Check size={15} /></button>
                    <button onClick={() => setNewRows(p => p.filter((_, i) => i !== idx))} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}

            {!isLoading && rentList.length === 0 && newRows.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">Нет данных. Нажмите «Добавить строку».</td></tr>
            )}
          </tbody>
          {rentList.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-6 py-3 text-xs font-bold text-gray-700 uppercase">Итого</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(totalRent)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function RentBranchRows({
  bc, items, branchTotal, editingId, editState,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onDelete,
}: {
  bc: string; items: RentItem[]; branchTotal: number;
  editingId: number | null; editState: RentEditState | null;
  onStartEdit: (r: RentItem) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (s: RentEditState) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {items.map(row =>
        editingId === row.id && editState ? (
          <tr key={row.id} className="bg-blue-50">
            <td className="px-6 py-2">
              <select value={editState.branch_code}
                onChange={e => onEditChange({ ...editState, branch_code: e.target.value })}
                className="px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none">
                {ALL_BRANCHES.map(b => <option key={b} value={b}>{BRANCH_FULL[b]}</option>)}
              </select>
            </td>
            <td className="px-4 py-2">
              <input value={editState.label}
                onChange={e => onEditChange({ ...editState, label: e.target.value })}
                className="w-28 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none" />
            </td>
            <td className="px-4 py-2">
              <input type="number" value={editState.area_sqm}
                onChange={e => onEditChange({ ...editState, area_sqm: e.target.value })}
                className="w-20 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none" />
            </td>
            <td className="px-4 py-2">
              <input type="number" value={editState.price_per_sqm}
                onChange={e => onEditChange({ ...editState, price_per_sqm: e.target.value })}
                className="w-28 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none" />
            </td>
            <td className="px-4 py-2 text-right font-medium">
              {fmt((parseFloat(editState.area_sqm) || 0) * (parseFloat(editState.price_per_sqm) || 0))}
            </td>
            <td className="px-4 py-2">
              <input value={editState.notes ?? ""}
                onChange={e => onEditChange({ ...editState, notes: e.target.value })}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none" />
            </td>
            <td className="px-4 py-2">
              <div className="flex gap-1">
                <button onClick={onSaveEdit} className="p-1 text-blue-600 hover:text-blue-800"><Check size={15} /></button>
                <button onClick={onCancelEdit} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
              </div>
            </td>
          </tr>
        ) : (
          <tr key={row.id} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-2.5 font-medium text-gray-900">{BRANCH_FULL[row.branch_code] ?? row.branch_code}</td>
            <td className="px-4 py-2.5 text-gray-600">{row.label}</td>
            <td className="px-4 py-2.5 text-right text-gray-700">{row.area_sqm.toLocaleString("ru-KZ")}</td>
            <td className="px-4 py-2.5 text-right text-gray-700">{row.price_per_sqm.toLocaleString("ru-KZ")}</td>
            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(row.monthly_rent)}</td>
            <td className="px-4 py-2.5 text-gray-400 text-xs">{row.notes ?? "—"}</td>
            <td className="px-4 py-2.5">
              <div className="flex gap-1">
                <button onClick={() => onStartEdit(row)} className="p-1 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button onClick={() => onDelete(row.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </td>
          </tr>
        )
      )}
      {items.length > 1 && (
        <tr className="bg-gray-50 border-t border-gray-100">
          <td className="px-6 py-1.5 text-xs text-gray-500 italic">{BRANCH_FULL[bc] ?? bc} — итого</td>
          <td colSpan={3} />
          <td className="px-4 py-1.5 text-right text-xs font-bold text-gray-700">{fmt(branchTotal)}</td>
          <td colSpan={2} />
        </tr>
      )}
    </>
  );
}

// ── FOT tab ───────────────────────────────────────────────────────────────────
type HqEditState = Omit<HqFotItem, "total" | "fixed_amount" | "motivation_amount"> & { fixed_amount: string; motivation_amount: string };
type HqNewState  = { name: string; fixed_amount: string; motivation_amount: string; notes: string };

function FotTab() {
  const { data: fotData } = useFotSetting();
  const { data: hqFotList = [] } = useHqFotItems();
  const upsertFot    = useUpsertFotSetting();
  const createHqFot  = useCreateHqFotItem();
  const updateHqFot  = useUpdateHqFotItem();
  const deleteHqFot  = useDeleteHqFotItem();

  const [fotEdit,      setFotEdit]      = useState<string | null>(null);
  const [hqEditingId,  setHqEditingId]  = useState<number | null>(null);
  const [hqEditState,  setHqEditState]  = useState<HqEditState | null>(null);
  const [hqNewRows,    setHqNewRows]    = useState<HqNewState[]>([]);

  async function saveFot() {
    if (fotEdit === null) return;
    await upsertFot.mutateAsync(parseFloat(fotEdit) || 25);
    setFotEdit(null);
  }
  async function saveHqEdit() {
    if (!hqEditState) return;
    await updateHqFot.mutateAsync({
      id: hqEditState.id, name: hqEditState.name,
      fixed_amount: parseFloat(hqEditState.fixed_amount) || 0,
      motivation_amount: parseFloat(hqEditState.motivation_amount) || 0,
      notes: hqEditState.notes || undefined,
    });
    setHqEditingId(null); setHqEditState(null);
  }
  async function saveHqNew(n: HqNewState) {
    if (!n.name) return;
    await createHqFot.mutateAsync({
      name: n.name,
      fixed_amount: parseFloat(n.fixed_amount) || 0,
      motivation_amount: parseFloat(n.motivation_amount) || 0,
      notes: n.notes || undefined,
    });
    setHqNewRows(p => p.filter(x => x !== n));
  }

  const hqTotal      = hqFotList.reduce((s, r) => s + r.total, 0);
  const hqFixedTotal = hqFotList.reduce((s, r) => s + r.fixed_amount, 0);
  const hqMotivTotal = hqFotList.reduce((s, r) => s + r.motivation_amount, 0);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* ФОТ % */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">ФОТ — % от выручки</h2>
          <p className="text-xs text-gray-500 mt-0.5">Применяется ко всем филиалам кроме Головного офиса</p>
        </div>
        <div className="px-6 py-4 flex items-center gap-4">
          {fotEdit !== null ? (
            <>
              <input type="number" value={fotEdit}
                onChange={e => setFotEdit(e.target.value)}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={0} max={100} step={0.5} />
              <span className="text-sm text-gray-500">%</span>
              <button onClick={saveFot} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                <Check size={13} />Сохранить
              </button>
              <button onClick={() => setFotEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-gray-900">{fotData?.pct ?? 25}%</span>
              <button onClick={() => setFotEdit(String(fotData?.pct ?? 25))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50">
                <Pencil size={12} />Изменить
              </button>
            </>
          )}
        </div>
      </section>

      {/* HQ ФОТ */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">ФОТ Головного офиса</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Фикс + мотивация по каждому сотруднику. Итог автоматически попадает в P&amp;L → ГО → ФОТ.
            </p>
          </div>
          <button
            onClick={() => setHqNewRows(p => [...p, { name: "", fixed_amount: "", motivation_amount: "", notes: "" }])}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} />Добавить сотрудника
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Сотрудник / должность</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Фикс, ₸</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Мотивация, ₸</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Итого</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Примечание</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {hqFotList.map(row =>
                hqEditingId === row.id && hqEditState ? (
                  <tr key={row.id} className="bg-blue-50">
                    <td className="px-6 py-2">
                      <input value={hqEditState.name}
                        onChange={e => setHqEditState({ ...hqEditState, name: e.target.value })}
                        className="w-48 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" value={hqEditState.fixed_amount}
                        onChange={e => setHqEditState({ ...hqEditState, fixed_amount: e.target.value })}
                        className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" value={hqEditState.motivation_amount}
                        onChange={e => setHqEditState({ ...hqEditState, motivation_amount: e.target.value })}
                        className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none" />
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmt((parseFloat(hqEditState.fixed_amount) || 0) + (parseFloat(hqEditState.motivation_amount) || 0))}
                    </td>
                    <td className="px-4 py-2">
                      <input value={hqEditState.notes ?? ""}
                        onChange={e => setHqEditState({ ...hqEditState, notes: e.target.value })}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none" />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={saveHqEdit} className="p-1 text-blue-600 hover:text-blue-800"><Check size={15} /></button>
                        <button onClick={() => { setHqEditingId(null); setHqEditState(null); }} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-2.5 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(row.fixed_amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={row.motivation_amount > 0 ? "text-blue-600 font-medium" : "text-gray-400"}>
                        {row.motivation_amount > 0 ? fmt(row.motivation_amount) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(row.total)}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{row.notes ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setHqEditingId(row.id); setHqEditState({ ...row, fixed_amount: String(row.fixed_amount), motivation_amount: String(row.motivation_amount) }); }}
                          className="p-1 text-gray-400 hover:text-blue-600"
                        ><Pencil size={14} /></button>
                        <button onClick={() => deleteHqFot.mutate(row.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {hqNewRows.map((n, idx) => (
                <tr key={`hq-new-${idx}`} className="bg-green-50">
                  <td className="px-6 py-2">
                    <input value={n.name}
                      onChange={e => setHqNewRows(p => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      placeholder="Имя / должность"
                      className="w-48 px-2 py-1 border border-green-300 rounded text-sm focus:outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={n.fixed_amount}
                      onChange={e => setHqNewRows(p => p.map((x, i) => i === idx ? { ...x, fixed_amount: e.target.value } : x))}
                      placeholder="0"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={n.motivation_amount}
                      onChange={e => setHqNewRows(p => p.map((x, i) => i === idx ? { ...x, motivation_amount: e.target.value } : x))}
                      placeholder="0"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none" />
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                    {fmt((parseFloat(n.fixed_amount) || 0) + (parseFloat(n.motivation_amount) || 0))}
                  </td>
                  <td className="px-4 py-2">
                    <input value={n.notes}
                      onChange={e => setHqNewRows(p => p.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                      placeholder="Примечание"
                      className="w-full px-2 py-1 border border-green-300 rounded text-sm focus:outline-none" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => saveHqNew(n)} disabled={!n.name} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"><Check size={15} /></button>
                      <button onClick={() => setHqNewRows(p => p.filter((_, i) => i !== idx))} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {hqFotList.length === 0 && hqNewRows.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Нет данных. Нажмите «Добавить сотрудника».</td></tr>
              )}
            </tbody>
            {hqFotList.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-6 py-3 text-xs font-bold text-gray-700 uppercase">Итого ФОТ ГО</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{fmt(hqFixedTotal)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-blue-600">{fmt(hqMotivTotal)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(hqTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
