"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useDashboardKpis, useAlerts, useSalesByBranch, useSalesByCategory,
  useTopSlowStock, useBranchesOverview, useTopNomenclature,
} from "@/hooks/useApi";
import { formatMoney, stockFlagBg, debtStatusBg } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  AlertTriangle, TrendingUp, Package, CreditCard, RefreshCw,
  Search, ChevronRight, ArrowUpRight, RotateCcw, TrendingDown,
  LayoutGrid, Building2, ShoppingCart,
} from "lucide-react";
import type { DebtStatus } from "@/types";

// ─── Colors ────────────────────────────────────────────────────────────────
const PALETTE = ["#1e40af","#2563eb","#3b82f6","#60a5fa","#93c5fd","#bfdbfe","#1d4ed8","#1e3a8a","#dbeafe","#eff6ff","#f0f9ff"];
const CAT_COLORS: Record<string, string> = {
  ЧАЙ: "#10b981", ВАРЕНЬЕ: "#8b5cf6", МАСЛО: "#f59e0b",
  СОУСЫ: "#ef4444", ЛАПША: "#f97316", НАРЫН: "#06b6d4",
  САЛФЕТКИ: "#84cc16", СЛАДОСТИ: "#ec4899", ПРОЧЕЕ: "#94a3b8",
};
const CATEGORIES = ["Все", "ЧАЙ", "ВАРЕНЬЕ", "МАСЛО", "СОУСЫ", "ЛАПША", "НАРЫН", "САЛФЕТКИ", "СЛАДОСТИ", "ПРОЧЕЕ"];
const DEBT_STATUS_LABELS: Record<string, string> = {
  ok: "Норма", warning: "Внимание", risk: "Риск", critical: "Критично",
};

// ─── Sub-components ─────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color = "default", icon: Icon, href, onClick,
}: {
  label: string; value: string; sub?: string;
  color?: "default" | "green" | "red" | "amber" | "blue";
  icon: React.ElementType; href?: string; onClick?: () => void;
}) {
  const valueColor = {
    default: "text-gray-900", green: "text-green-700",
    red: "text-red-600", amber: "text-amber-600", blue: "text-blue-700",
  }[color];
  const borderHover = href || onClick ? "hover:border-blue-300 cursor-pointer hover:shadow-md" : "";

  const inner = (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 transition-all ${borderHover}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-gray-300" />
      </div>
      <div className={`text-2xl font-black tracking-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">{sub}</div>}
      {(href || onClick) && (
        <div className="mt-3 text-xs text-blue-600 font-semibold flex items-center gap-1">
          Подробнее <ChevronRight size={11} />
        </div>
      )}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className="text-left w-full">{inner}</button>;
  return inner;
}

function AlertStrip({ alerts }: { alerts: { id: string; level: string; message: string; branch_name?: string | null }[] }) {
  if (!alerts.length) return null;
  const colors = {
    critical: "bg-red-50 border-red-200 border-l-red-500",
    warning: "bg-amber-50 border-amber-200 border-l-amber-500",
    info: "bg-blue-50 border-blue-200 border-l-blue-500",
  };
  return (
    <div className="flex flex-col gap-2 mb-6">
      {alerts.slice(0, 4).map((a) => (
        <div
          key={a.id}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border border-l-4 text-sm ${colors[a.level as keyof typeof colors] ?? colors.info}`}
        >
          <AlertTriangle size={13} className="flex-shrink-0 opacity-70" />
          <span className="text-gray-700">{a.message}</span>
          {a.branch_name && (
            <span className="ml-auto text-xs font-mono text-gray-400 shrink-0">{a.branch_name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "branches" | "nomenclature">("overview");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("Все");
  const [search, setSearch] = useState("");

  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis();
  const { data: alerts = [] } = useAlerts();
  const { data: salesByBranch = [] } = useSalesByBranch();
  const { data: salesByCat = [] } = useSalesByCategory();
  const { data: slowStock = [] } = useTopSlowStock(8);
  const { data: branchesOverview = [], isLoading: branchesLoading } = useBranchesOverview();
  const { data: topNom = [], isLoading: nomLoading } = useTopNomenclature({
    branch_id: branchFilter || undefined,
    category: categoryFilter !== "Все" ? categoryFilter : undefined,
    limit: 50,
  });

  const activeAlerts = alerts.filter((a) => !(a as any).resolved);

  // Branch filter options from overview
  const branchOptions = useMemo(
    () => branchesOverview.map((b) => ({ id: b.branch_id, name: b.branch_name })),
    [branchesOverview]
  );

  // Filtered nomenclature by search
  const filteredNom = useMemo(() => {
    if (!search) return topNom;
    const q = search.toLowerCase();
    return topNom.filter((n) => n.name.toLowerCase().includes(q) || n.category.toLowerCase().includes(q));
  }, [topNom, search]);

  // Pie data for categories
  const pieData = salesByCat.map((c) => ({
    name: c.category,
    value: c.amount,
    fill: CAT_COLORS[c.category] ?? "#94a3b8",
  }));

  const totalSales = salesByCat.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-5">
      <AlertStrip alerts={activeAlerts} />

      {/* ── Tab switcher ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: "overview", label: "Обзор", Icon: LayoutGrid },
          { id: "branches", label: "По филиалам", Icon: Building2 },
          { id: "nomenclature", label: "По номенклатуре", Icon: ShoppingCart },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === id
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}

        {/* Global filters */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 bg-white text-gray-700"
          >
            <option value="">Все филиалы</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {(tab === "nomenclature" || tab === "overview") && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 bg-white text-gray-700"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ══ TAB: ОБЗОР ═════════════════════════════════════════════ */}
      {tab === "overview" && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label={`Выручка · ${kpis?.revenue_period_label ?? ""}`}
              value={kpisLoading ? "..." : formatMoney(kpis?.revenue_period ?? 0)}
              sub="Все продажи за период"
              icon={TrendingUp}
              href="/dashboard/sales"
            />
            <KpiCard
              label="Сток (остатки)"
              value={kpisLoading ? "..." : formatMoney(kpis?.stock_total ?? 0)}
              sub={
                kpis && kpis.revenue_period > 0
                  ? `${((kpis.stock_total / kpis.revenue_period) * 100).toFixed(0)}% от выручки`
                  : "—"
              }
              color="amber"
              icon={Package}
              href="/dashboard/stock"
            />
            <KpiCard
              label="Дебиторка"
              value={kpisLoading ? "..." : formatMoney(kpis?.total_debt ?? 0)}
              sub={
                kpis && kpis.total_debt > 0
                  ? `${((kpis.total_payment / kpis.total_debt) * 100).toFixed(0)}% оплачено`
                  : "—"
              }
              color="red"
              icon={CreditCard}
              href="/dashboard/debts"
            />
            <KpiCard
              label="Критич. просрочка"
              value={kpisLoading ? "..." : formatMoney(kpis?.critical_debt ?? 0)}
              sub="Статус «Критично»"
              color={kpis && kpis.critical_debt > 0 ? "red" : "green"}
              icon={AlertTriangle}
              onClick={() => { setTab("branches"); }}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Sales by branch */}
            <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">Продажи по филиалам</div>
                  <div className="text-xs text-gray-400 mt-0.5">млн тг</div>
                </div>
                <button
                  onClick={() => setTab("branches")}
                  className="text-xs text-blue-700 hover:underline flex items-center gap-1"
                >
                  Таблица <ChevronRight size={11} />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={salesByBranch.map((b) => ({ ...b, v: b.amount / 1_000_000 }))}
                  layout="vertical"
                  margin={{ left: 4, right: 32, top: 0, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
                  <YAxis type="category" dataKey="branch_name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)} млн`, "Продажи"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                    {salesByBranch.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sales by category pie */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">По категориям</div>
                  <div className="text-xs text-gray-400 mt-0.5">Структура продаж</div>
                </div>
              </div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [formatMoney(v), "Продажи"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
                  Нет данных
                </div>
              )}
            </div>
          </div>

          {/* Mini debt summary */}
          {(kpis?.total_debt ?? 0) > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Общий долг", value: kpis?.total_debt ?? 0, icon: CreditCard, color: "text-red-700", bg: "bg-red-50 border-red-200" },
                { label: "Оплачено", value: kpis?.total_payment ?? 0, icon: TrendingDown, color: "text-green-700", bg: "bg-green-50 border-green-200" },
                { label: "Чистая дебиторка", value: (kpis?.total_debt ?? 0) - (kpis?.total_payment ?? 0), icon: ArrowUpRight, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
                { label: "Критичная просрочка", value: kpis?.critical_debt ?? 0, icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50 border-red-200" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <Link key={label} href="/dashboard/debts" className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg} hover:opacity-80 transition-opacity`}>
                  <Icon size={16} className={color} />
                  <div>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className={`text-sm font-bold ${color}`}>{formatMoney(value)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Slow stock */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-gray-900">Риск залежалости — ТОП-8</div>
                <div className="text-xs text-gray-400 mt-0.5">Товары с наибольшим запасом в днях</div>
              </div>
              <Link href="/dashboard/stock" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
                Все остатки <ChevronRight size={11} />
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Товар</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Категория</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Остаток</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Дней запаса</th>
                  <th className="px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Статус</th>
                </tr>
              </thead>
              <tbody>
                {slowStock.map((row, i) => (
                  <tr key={row.nomenclature_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-5 py-2.5 font-medium text-gray-900 max-w-[220px] truncate">{row.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{row.category}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">{row.stock_qty.toLocaleString("ru")}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">
                      <span className={row.flag === "critical" ? "text-red-600" : "text-amber-600"}>
                        {row.days_supply >= 9999 ? "∞" : row.days_supply}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded border ${stockFlagBg(row.flag as any)}`}>
                        {row.flag === "critical" ? "⚠ Стоп" : "Избыток"}
                      </span>
                    </td>
                  </tr>
                ))}
                {slowStock.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">Нет данных — загрузите остатки</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ TAB: ПО ФИЛИАЛАМ ═══════════════════════════════════════ */}
      {tab === "branches" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-gray-900">Сводка по всем филиалам</div>
              <div className="text-xs text-gray-400 mt-0.5">Продажи · Дебиторка · Остатки</div>
            </div>
            <Link href="/dashboard/debts" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
              Детали дебиторки <ChevronRight size={11} />
            </Link>
          </div>
          {branchesLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Загрузка...</div>
          ) : branchesOverview.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Загрузите данные через раздел «Загрузка»</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide">Продажи</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-red-400 uppercase tracking-wide">Долг</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-green-500 uppercase tracking-wide">Оплаты</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-blue-400 uppercase tracking-wide">В головной</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-purple-500 uppercase tracking-wide">Возвраты</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Остатки</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Просрочка</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Статус долга</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {branchesOverview
                    .filter((b) => !branchFilter || b.branch_id === branchFilter)
                    .map((b, i) => (
                    <tr key={b.branch_id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30 transition-colors`}>
                      <td className="px-5 py-3 font-semibold text-gray-900">{b.branch_name}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-700 font-bold">
                        {b.sales_total > 0 ? formatMoney(b.sales_total) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-700">
                        {b.debt_amount > 0 ? formatMoney(b.debt_amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">
                        {b.payment_amount > 0 ? formatMoney(b.payment_amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-600">
                        {b.payment_to_head > 0 ? formatMoney(b.payment_to_head) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-purple-700">
                        {b.returns_amount > 0 ? formatMoney(b.returns_amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600 text-xs">
                        {b.stock_amount > 0 ? formatMoney(b.stock_amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                        {b.overdue_days > 0 ? `${b.overdue_days} дн.` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {b.debt_amount > 0 ? (
                          <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-lg ${debtStatusBg(b.debt_status as DebtStatus)}`}>
                            {DEBT_STATUS_LABELS[b.debt_status] ?? b.debt_status}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setBranchFilter(b.branch_id);
                            setTab("nomenclature");
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5 whitespace-nowrap"
                        >
                          Номенкл. <ChevronRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Итого</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-700">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.sales_total, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-700">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.debt_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.payment_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-600">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.payment_to_head, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-purple-700">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.returns_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 text-xs">
                      {formatMoney(branchesOverview.reduce((s, b) => s + b.stock_amount, 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: ПО НОМЕНКЛАТУРЕ ══════════════════════════════════ */}
      {tab === "nomenclature" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900">
                Топ номенклатуры по продажам
                {branchFilter && (
                  <span className="ml-2 text-xs font-normal text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    {branchesOverview.find((b) => b.branch_id === branchFilter)?.branch_name ?? "Филиал"}
                    <button onClick={() => setBranchFilter("")} className="ml-1 text-blue-400 hover:text-blue-700">×</button>
                  </span>
                )}
                {categoryFilter !== "Все" && (
                  <span className="ml-2 text-xs font-normal text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                    {categoryFilter}
                    <button onClick={() => setCategoryFilter("Все")} className="ml-1 text-indigo-400 hover:text-indigo-700">×</button>
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Продажи + остатки + дней запаса</div>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 w-48"
              />
            </div>
          </div>

          {nomLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Загрузка...</div>
          ) : filteredNom.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Нет данных — загрузите продажи</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Номенклатура</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Категория</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide">Продажи</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Доля</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Остаток кол.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Остаток сум.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Дней запаса</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNom.map((row, i) => {
                    const share = totalSales > 0 ? (row.sales_total / totalSales) * 100 : 0;
                    return (
                      <tr key={row.nomenclature_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                        <td className="px-5 py-2.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[260px]">
                          <div className="truncate" title={row.name}>{row.name}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-md"
                            style={{ backgroundColor: `${CAT_COLORS[row.category] ?? "#94a3b8"}20`, color: CAT_COLORS[row.category] ?? "#94a3b8" }}
                          >
                            {row.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700">
                          {formatMoney(row.sales_total)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div
                                className="bg-blue-400 h-1.5 rounded-full"
                                style={{ width: `${Math.min(share * 5, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 font-mono w-10 text-right">
                              {share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-600">
                          {row.stock_qty > 0 ? row.stock_qty.toLocaleString("ru") : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-600">
                          {row.stock_amount > 0 ? formatMoney(row.stock_amount) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.days_supply > 0 ? (
                            <span className={
                              row.stock_flag === "critical" ? "text-red-600 font-bold" :
                              row.stock_flag === "warning" ? "text-amber-600 font-semibold" : "text-green-600"
                            }>
                              {row.days_supply >= 9999 ? "∞" : `${row.days_supply} дн.`}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-2.5">
                          {row.stock_flag !== "ok" ? (
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded border ${stockFlagBg(row.stock_flag as any)}`}>
                              {row.stock_flag === "critical" ? "⚠ Стоп" : "Избыток"}
                            </span>
                          ) : <span className="text-xs text-green-600">Норма</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">
                      Итого ({filteredNom.length} позиций)
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-700">
                      {formatMoney(filteredNom.reduce((s, r) => s + r.sales_total, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">100%</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
