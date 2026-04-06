"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  useSalesReportDates, useSalesReportTotals, useSalesReportSummary,
  useOsvDates, useOsvByBranch, useTmzSummary, useTmzDates,
  useCashFlowSummary,
} from "@/hooks/useApi";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  TrendingUp, Package, CreditCard, AlertTriangle,
  ChevronRight, LayoutGrid, Building2,
} from "lucide-react";

// ── Colors ─────────────────────────────────────────────────────────────────
const C = [
  "#3b82f6","#6366f1","#8b5cf6","#ec4899","#f97316",
  "#eab308","#22c55e","#06b6d4","#f43f5e","#a855f7",
];

// ── Formatters ─────────────────────────────────────────────────────────────
const ru = (n: number) =>
  n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt = (n: number) => ru(n) + " ₸";
const fmtM = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
};

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color = "default", icon: Icon, href,
}: {
  label: string; value: string; sub?: string;
  color?: "default" | "green" | "red" | "amber" | "blue" | "emerald";
  icon: React.ElementType; href?: string;
}) {
  const valueColor = {
    default: "text-gray-900", green: "text-green-700",
    red: "text-red-600", amber: "text-amber-600",
    blue: "text-blue-700", emerald: "text-emerald-600",
  }[color];

  const inner = (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 transition-all ${href ? "hover:border-blue-300 hover:shadow-md cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-gray-300" />
      </div>
      <div className={`text-2xl font-black tracking-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1.5">{sub}</div>}
      {href && (
        <div className="mt-3 text-xs text-blue-600 font-semibold flex items-center gap-1">
          Подробнее <ChevronRight size={11} />
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Chart tooltip ──────────────────────────────────────────────────────────
function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; amount: number }; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-1">{payload[0].payload.name}</div>
      <div className="text-blue-700 font-bold">{fmt(payload[0].payload.amount)}</div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tab, setTab] = useState<"overview" | "branches">("overview");

  // ── Dates ──────────────────────────────────────────────────────────────
  const { data: salesDates = [] } = useSalesReportDates();
  const { data: osvDates = [] } = useOsvDates();
  const { data: tmzDates = [] } = useTmzDates();

  const salesDate = salesDates[0];
  const osvDate = osvDates[0];
  const tmzDate = tmzDates[0];

  // ── Sales data ─────────────────────────────────────────────────────────
  const p = { period_date: salesDate || undefined };
  const { data: totals = [] } = useSalesReportTotals(p);
  const { data: summary = [] } = useSalesReportSummary({ ...p, is_bonus: false });
  const { data: bonusSummary = [] } = useSalesReportSummary({ ...p, is_bonus: true });

  // ── Debt data ──────────────────────────────────────────────────────────
  const { data: debtByBranch = [] } = useOsvByBranch(osvDate, true);

  // ── TMZ data ───────────────────────────────────────────────────────────
  const { data: tmzSummary = [] } = useTmzSummary(tmzDate);

  // ── Cash flow data ─────────────────────────────────────────────────────────
  const { data: cashFlow = [] } = useCashFlowSummary();

  // ── Computed KPIs ──────────────────────────────────────────────────────
  const salesTotal = totals.reduce((s, t) => s + t.amount, 0);
  const salesQty = totals.reduce((s, t) => s + t.qty, 0);
  const bonusTotal = bonusSummary.reduce((s, r) => s + r.amount, 0);
  const bonusQty = bonusSummary.reduce((s, r) => s + r.qty, 0);
  const combinedTotal = salesTotal + bonusTotal;
  const debtTotal = debtByBranch.reduce((s, r) => s + r.total_net, 0);
  const tmzTotal = tmzSummary.reduce((s, r) => s + r.total_amount, 0);

  // ── Branch chart data ──────────────────────────────────────────────────
  const branchChartData = useMemo(() => {
    const cashByCode = Object.fromEntries(cashFlow.map(r => [r.branch_code, r.total_amount]));
    const map = new Map<string, { name: string; amount: number; cashflow: number }>();
    for (const r of [...summary, ...bonusSummary]) {
      if (!map.has(r.branch_code))
        map.set(r.branch_code, { name: r.branch_name, amount: 0, cashflow: cashByCode[r.branch_code] ?? 0 });
      map.get(r.branch_code)!.amount += r.amount;
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [summary, bonusSummary, cashFlow]);

  // ── Category pie data ──────────────────────────────────────────────────
  const catData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of [...summary, ...bonusSummary]) {
      const k = r.cat1 ?? "Прочее";
      map.set(k, (map.get(k) ?? 0) + r.amount);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name: name.length > 14 ? name.slice(0, 14) + "…" : name, value }));
  }, [summary, bonusSummary]);

  // ── Per-branch aggregated table ────────────────────────────────────────
  const branchTable = useMemo(() => {
    const map = new Map<string, {
      code: string; name: string;
      salesAmt: number; salesQty: number;
      debt: number; tmzAmt: number;
    }>();

    for (const r of [...summary, ...bonusSummary]) {
      if (!map.has(r.branch_code))
        map.set(r.branch_code, { code: r.branch_code, name: r.branch_name, salesAmt: 0, salesQty: 0, debt: 0, tmzAmt: 0 });
      const e = map.get(r.branch_code)!;
      e.salesAmt += r.amount; e.salesQty += r.qty;
    }
    for (const d of debtByBranch) {
      for (const [, e] of map) {
        if (e.name.toLowerCase().includes(d.branch_name.toLowerCase().slice(0, 5)) ||
            d.branch_name.toLowerCase().includes(e.name.toLowerCase().slice(0, 5))) {
          e.debt += d.total_net;
        }
      }
    }
    for (const t of tmzSummary) {
      if (!t.sub_branch) {
        for (const [, e] of map) {
          if (e.name.toLowerCase().includes(t.branch_name.toLowerCase().slice(0, 5)) ||
              t.branch_name.toLowerCase().includes(e.name.toLowerCase().slice(0, 5))) {
            e.tmzAmt += t.total_amount;
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => b.salesAmt - a.salesAmt);
  }, [summary, bonusSummary, debtByBranch, tmzSummary]);

  const hasData = totals.length > 0 || tmzSummary.length > 0 || debtByBranch.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Tab switcher ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {([
          { id: "overview", label: "Обзор", Icon: LayoutGrid },
          { id: "branches", label: "По филиалам", Icon: Building2 },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === id
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
        {salesDate && (
          <span className="ml-auto text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded">
            {salesDate}
          </span>
        )}
      </div>

      {!hasData && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Данные не загружены. Перейдите в разделы Продажи, ТМЗ, Дебиторка и загрузите файлы.
        </div>
      )}

      {/* ══ ОБЗОР ════════════════════════════════════════════════════ */}
      {tab === "overview" && hasData && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Реализация"
              value={fmt(combinedTotal)}
              sub={`${ru(salesQty + bonusQty)} шт · ${salesDate ?? ""}`}
              color="blue"
              icon={TrendingUp}
              href="/dashboard/sales"
            />
            <KpiCard
              label="Бонусы"
              value={`${ru(bonusQty)} шт`}
              sub={fmt(bonusTotal)}
              color="amber"
              icon={Package}
              href="/dashboard/sales"
            />
            <KpiCard
              label="Дебиторка"
              value={debtTotal > 0 ? fmt(debtTotal) : "—"}
              sub={`${debtByBranch.length} филиалов · ${osvDate ?? ""}`}
              color={debtTotal > 0 ? "red" : "default"}
              icon={CreditCard}
              href="/dashboard/debts"
            />
            <KpiCard
              label="ТМЗ остатки"
              value={tmzTotal > 0 ? fmt(tmzTotal) : "—"}
              sub={`${tmzSummary.reduce((s, r) => s + r.sku_count, 0).toLocaleString("ru")} SKU · ${tmzDate ?? ""}`}
              color="emerald"
              icon={Package}
              href="/dashboard/tmz"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Branch bar */}
            <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">Продажи по филиалам</div>
                  <div className="text-xs text-gray-400 mt-0.5">включая бонусы</div>
                </div>
                <Link href="/dashboard/sales" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
                  Подробнее <ChevronRight size={11} />
                </Link>
              </div>
              {branchChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(260, branchChartData.length * 52)}>
                  <BarChart
                    data={branchChartData}
                    layout="vertical"
                    margin={{ left: 0, right: 60, top: 4, bottom: 4 }}
                  >
                    <XAxis type="number" tickFormatter={v => fmtM(Number(v))} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} width={84} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmt(v), name === "amount" ? "Продажи" : "Поступления"]}
                    />
                    <Bar dataKey="amount" name="amount" radius={[0, 2, 2, 0]} maxBarSize={18}>
                      {branchChartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                    </Bar>
                    <Bar dataKey="cashflow" name="cashflow" radius={[0, 2, 2, 0]} maxBarSize={18} fill="#10b981" opacity={0.75} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Нет данных</div>
              )}
            </div>

            {/* Category pie */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">По категориям</div>
                  <div className="text-xs text-gray-400 mt-0.5">Структура продаж</div>
                </div>
              </div>
              {catData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={catData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={85}
                      innerRadius={40}
                      label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                      labelLine={false}
                      fontSize={10}
                    >
                      {catData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), "Сумма"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Нет данных</div>
              )}
            </div>
          </div>

          {/* Debt summary strip */}
          {debtByBranch.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900">Дебиторка по филиалам</div>
                  <div className="text-xs text-gray-400 mt-0.5">Чистая дебиторская задолженность</div>
                </div>
                <Link href="/dashboard/debts" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
                  Подробнее <ChevronRight size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                {[...debtByBranch].sort((a, b) => b.total_net - a.total_net).map((d, i) => (
                  <div key={d.branch_name} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    <div className="text-[10px] font-semibold text-gray-500 truncate">{d.branch_name}</div>
                    <div className="text-sm font-black text-red-700 tabular-nums mt-0.5">{fmt(d.total_net)}</div>
                    <div className="text-[10px] text-gray-400">{d.count} контрагентов</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ ПО ФИЛИАЛАМ ══════════════════════════════════════════════ */}
      {tab === "branches" && hasData && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-sm font-bold text-gray-900">Сводка по филиалам</div>
            <div className="text-xs text-gray-400 mt-0.5">Продажи · Дебиторка · ТМЗ</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide">Продажи</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Кол-во</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-red-400 uppercase tracking-wide">Дебиторка</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-500 uppercase tracking-wide">ТМЗ остаток</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Доля продаж</th>
                </tr>
              </thead>
              <tbody>
                {branchTable.map((b, i) => {
                  const share = combinedTotal > 0 ? b.salesAmt / combinedTotal * 100 : 0;
                  return (
                    <tr key={b.code} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"} hover:bg-blue-50/30 transition-colors`}>
                      <td className="px-5 py-3 font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: C[i % C.length] }} />
                        {b.name}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-700 font-bold">
                        {b.salesAmt > 0 ? fmt(b.salesAmt) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">
                        {b.salesQty > 0 ? ru(b.salesQty) + " шт" : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">
                        {b.debt > 0 ? fmt(b.debt) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">
                        {b.tmzAmt > 0 ? fmt(b.tmzAmt) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, backgroundColor: C[i % C.length] }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-500 w-9 text-right tabular-nums">{share.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-5 py-3 text-xs font-bold text-gray-600 uppercase">Итого</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">{fmt(combinedTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">{ru(salesQty + bonusQty)} шт</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{debtTotal > 0 ? fmt(debtTotal) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{tmzTotal > 0 ? fmt(tmzTotal) : "—"}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
