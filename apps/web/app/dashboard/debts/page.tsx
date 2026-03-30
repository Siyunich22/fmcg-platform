"use client";
import { useState } from "react";
import {
  useOsvAnalysis,
  useOsvDates,
  useOsvBranches,
  useOsvByDate,
  useOsvByBranch,
  type OsvAnalysisRow,
  type OsvByDateRow,
  type OsvByBranchRow,
} from "@/hooks/useApi";
import { Search, Filter, TrendingUp, TrendingDown, Download, LayoutDashboard } from "lucide-react";
import * as XLSX from "xlsx";

function fmt(value: number): string {
  return value.toLocaleString("ru-KZ", { maximumFractionDigits: 0 });
}

const COLS = [{ wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
const HEADER = ["Контрагент", "Итого (нетто)", "Дебиторка (1210)", "Кредиторка (3310)", "Авансы (1710)"];

function makeSheet(branchRows: OsvAnalysisRow[]): XLSX.WorkSheet {
  const net = branchRows.reduce((s, r) => s + r.net, 0);
  const a1210 = branchRows.reduce((s, r) => s + r.a1210, 0);
  const a3310 = branchRows.reduce((s, r) => s + r.a3310, 0);
  const a1710 = branchRows.reduce((s, r) => s + r.a1710, 0);
  const data = [
    HEADER,
    ...branchRows.map((r) => [r.counterparty, r.net, r.a1210, r.a3310, r.a1710]),
    [],
    ["ИТОГО", net, a1210, a3310, a1710],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = COLS;
  return ws;
}

function exportToExcel(
  rows: OsvAnalysisRow[],
  excludedRows: OsvAnalysisRow[],
  totals: { total_1210: number; total_3310: number; total_1710: number; total_net: number; count: number } | undefined,
  periodDate: string | undefined,
) {
  const wb = XLSX.utils.book_new();

  // Сгруппировать по филиалам
  const byBranch = new Map<string, OsvAnalysisRow[]>();
  for (const r of rows) {
    if (!byBranch.has(r.branch_name)) byBranch.set(r.branch_name, []);
    byBranch.get(r.branch_name)!.push(r);
  }
  const branchNames = Array.from(byBranch.keys()).sort();

  // Лист 1 — Все филиалы (сводный)
  const summaryData: (string | number)[][] = [
    ["Филиал", "Итого (нетто)", "Дебиторка (1210)", "Кредиторка (3310)", "Авансы (1710)", "Контрагентов"],
    ...branchNames.map((b) => {
      const bRows = byBranch.get(b)!;
      return [
        b,
        bRows.reduce((s, r) => s + r.net, 0),
        bRows.reduce((s, r) => s + r.a1210, 0),
        bRows.reduce((s, r) => s + r.a3310, 0),
        bRows.reduce((s, r) => s + r.a1710, 0),
        bRows.length,
      ];
    }),
    [],
    [
      "ИТОГО",
      totals?.total_net ?? 0,
      totals?.total_1210 ?? 0,
      totals?.total_3310 ?? 0,
      totals?.total_1710 ?? 0,
      totals?.count ?? 0,
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Все филиалы");

  // Листы по каждому филиалу
  for (const b of branchNames) {
    const bRows = byBranch.get(b)!.sort((a, z) => Math.abs(z.net) - Math.abs(a.net));
    // Имя листа макс 31 символ (ограничение Excel)
    const sheetName = b.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, makeSheet(bRows), sheetName);
  }

  // Лист — Производство Астана (отдельно)
  if (excludedRows.length > 0) {
    const ws = makeSheet(excludedRows);
    XLSX.utils.book_append_sheet(wb, ws, "Производство Астана");
  }

  const date = periodDate ?? new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Дебиторка_${date}.xlsx`);
}

function netColor(net: number) {
  if (net > 100_000) return "text-red-700";
  if (net > 0) return "text-orange-600";
  if (net < -100_000) return "text-green-700";
  if (net < 0) return "text-green-600";
  return "text-gray-400";
}

function netBg(net: number) {
  if (net > 500_000) return "bg-red-50";
  if (net > 0) return "";
  if (net < 0) return "bg-green-50/40";
  return "";
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-gray-300 text-xs">—</span>;
  const isUp = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? "text-red-500" : "text-green-600"}`}>
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {fmt(Math.abs(delta))}
    </span>
  );
}

export default function DebtsPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "osv" | "dynamics">("dashboard");

  // OSV filters
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [search, setSearch] = useState("");
  const [onlyPositive, setOnlyPositive] = useState(false);

  // Dashboard
  const [dashOnlyPositive, setDashOnlyPositive] = useState(false);
  const [selectedDashDate, setSelectedDashDate] = useState<string>("");
  const { data: byDateRows = [], isLoading: byDateLoading } = useOsvByDate(dashOnlyPositive);
  const effectiveDashDate = selectedDashDate || byDateRows[0]?.period_date;
  const { data: byBranchRows = [], isLoading: byBranchLoading } = useOsvByBranch(effectiveDashDate, dashOnlyPositive);

  // Dynamics — compare two dates
  const [dateA, setDateA] = useState<string>("");
  const [dateB, setDateB] = useState<string>("");
  const [dynBranch, setDynBranch] = useState<string>("");

  const { data: dates = [] } = useOsvDates();
  const periodDate = selectedDate || dates[0];
  const { data: branches = [] } = useOsvBranches(periodDate);

  const { data: osvResult, isLoading: osvLoading } = useOsvAnalysis({
    period_date: periodDate,
    branch_name: selectedBranch || undefined,
    search: search || undefined,
    only_positive: onlyPositive,
  });

  // Dynamics: load both periods (limit 5000 to get all)
  const effectiveDateA = dateA || dates[0];
  const effectiveDateB = dateB || dates[1];

  const { data: resultA } = useOsvAnalysis({
    period_date: effectiveDateA,
    branch_name: dynBranch || undefined,
    limit: 5000,
  } as Parameters<typeof useOsvAnalysis>[0]);

  const { data: resultB } = useOsvAnalysis({
    period_date: effectiveDateB,
    branch_name: dynBranch || undefined,
    limit: 5000,
  } as Parameters<typeof useOsvAnalysis>[0]);

  const rows: OsvAnalysisRow[] = osvResult?.rows ?? [];
  const totals = osvResult?.totals;
  const excludedRows: OsvAnalysisRow[] = osvResult?.excluded ?? [];

  // Build dynamics comparison
  const dynRows = (() => {
    if (!resultA || !resultB) return [];
    const mapA = new Map<string, OsvAnalysisRow>();
    for (const r of resultA.rows) mapA.set(r.branch_name + "||" + r.counterparty, r);
    const mapB = new Map<string, OsvAnalysisRow>();
    for (const r of resultB.rows) mapB.set(r.branch_name + "||" + r.counterparty, r);

    const keys = new Set([...Array.from(mapA.keys()), ...Array.from(mapB.keys())]);
    const result = [];
    for (const key of keys) {
      const a = mapA.get(key);
      const b = mapB.get(key);
      const netA = a?.net ?? 0;
      const netB = b?.net ?? 0;
      const delta = netA - netB; // positive = debt grew, negative = debt shrank
      const [branch, counterparty] = key.split("||");
      result.push({ branch, counterparty, netA, netB, delta });
    }
    result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return result;
  })();

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "dashboard" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Дашборд
        </button>
        <button
          onClick={() => setActiveTab("osv")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "osv" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Анализ дебиторки
        </button>
        <button
          onClick={() => setActiveTab("dynamics")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "dynamics" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Динамика
        </button>
      </div>

      {/* ── Dashboard Tab ───────────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="space-y-5">
          {/* Toggle + label */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
              <div
                onClick={() => setDashOnlyPositive(!dashOnlyPositive)}
                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${dashOnlyPositive ? "bg-gray-900" : "bg-gray-200"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow ${dashOnlyPositive ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
              Только с долгом
            </label>
            <span className="text-xs text-gray-400">{dashOnlyPositive ? "net > 0 — нам должны" : "все контрагенты"}</span>
          </div>

          {/* По датам */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">По датам</span>
              <span className="text-xs text-gray-400 ml-2">нажми чтобы выбрать</span>
            </div>
            {byDateLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Загрузка...</div>
            ) : byDateRows.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Нет данных — загрузите ОСВ-файлы</div>
            ) : (
              <div className="p-4 flex flex-wrap gap-3">
                {byDateRows.map((row) => {
                  const isSelected = row.period_date === effectiveDashDate;
                  const isPos = row.total_net > 0;
                  return (
                    <button
                      key={row.period_date}
                      onClick={() => setSelectedDashDate(row.period_date)}
                      className={`flex flex-col items-start px-4 py-3 rounded-xl border-2 transition-all min-w-40 text-left ${
                        isSelected
                          ? "border-gray-900 bg-gray-900 text-white shadow-md"
                          : "border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white"
                      }`}
                    >
                      <span className={`text-xs font-semibold mb-1 ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                        {row.period_date}
                      </span>
                      <span className={`text-lg font-black tabular-nums leading-tight ${
                        isSelected ? "text-white" : isPos ? "text-red-600" : "text-green-600"
                      }`}>
                        {fmt(row.total_net)}
                      </span>
                      <span className={`text-xs mt-1 ${isSelected ? "text-gray-400" : "text-gray-400"}`}>
                        {row.count} контрагентов
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* По филиалам */}
          {effectiveDashDate && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">По филиалам — {effectiveDashDate}</span>
                <span className="text-xs text-gray-400">{byBranchRows.length} филиалов</span>
              </div>
              {byBranchLoading ? (
                <div className="py-10 text-center text-gray-400 text-sm">Загрузка...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-800 uppercase tracking-wide">Итого</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-red-400 uppercase tracking-wide">Дебиторка</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-amber-500 uppercase tracking-wide">Кредиторка</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-blue-400 uppercase tracking-wide">Авансы</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byBranchRows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-800">{row.branch_name}</td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${netColor(row.total_net)}`}>
                            {fmt(row.total_net)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-600">
                            {row.total_1210 !== 0 ? fmt(row.total_1210) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-amber-600">
                            {row.total_3310 !== 0 ? fmt(row.total_3310) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">
                            {row.total_1710 !== 0 ? fmt(row.total_1710) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${row.total_net > 0 ? "bg-red-400" : "bg-green-400"}`}
                                  style={{ width: `${Math.min(row.share, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-10 text-right">{row.share}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                        <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Итого</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${netColor(byBranchRows.reduce((s, r) => s + r.total_net, 0))}`}>
                          {fmt(byBranchRows.reduce((s, r) => s + r.total_net, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-red-700">
                          {fmt(byBranchRows.reduce((s, r) => s + r.total_1210, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-amber-700">
                          {fmt(byBranchRows.reduce((s, r) => s + r.total_3310, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-blue-700">
                          {fmt(byBranchRows.reduce((s, r) => s + r.total_1710, 0))}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── OSV Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "osv" && (
        <div className="space-y-4">
          {/* Summary cards */}
          {totals && totals.count > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
                  1210 Дебиторка
                </div>
                <div className="text-xl font-black text-red-700">{fmt(totals.total_1210)}</div>
                <div className="text-xs text-red-400 mt-0.5">что нам должны</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
                  3310 Кредиторка
                </div>
                <div className="text-xl font-black text-amber-700">{fmt(totals.total_3310)}</div>
                <div className="text-xs text-amber-500 mt-0.5">что мы должны</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                  1710 Авансы
                </div>
                <div className="text-xl font-black text-blue-700">{fmt(totals.total_1710)}</div>
                <div className="text-xs text-blue-400 mt-0.5">выданные авансы</div>
              </div>
              <div className={`border rounded-xl p-4 ${totals.total_net > 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${totals.total_net > 0 ? "text-orange-600" : "text-green-600"}`}>
                  Чистая дебиторка
                </div>
                <div className={`text-xl font-black ${totals.total_net > 0 ? "text-orange-700" : "text-green-700"}`}>
                  {fmt(Math.abs(totals.total_net))}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {totals.total_net > 0 ? "1210 − 3310 − 1710" : "перекрыта ✓"}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <Filter size={13} className="text-gray-400 shrink-0" />
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
              >
                {dates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
              >
                <option value="">Все филиалы</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <div className="relative flex-1 min-w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по контрагенту..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyPositive}
                  onChange={(e) => setOnlyPositive(e.target.checked)}
                  className="rounded"
                />
                Только с долгом
              </label>
              {totals && (
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-gray-400">{totals.count} контрагентов</span>
                  <button
                    onClick={() => exportToExcel(rows, excludedRows, totals, osvResult?.period_date ?? periodDate)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Download size={12} />
                    Excel
                  </button>
                </div>
              )}
            </div>

            {osvLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Загрузка...</div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                {dates.length === 0
                  ? "Загрузите ОСВ-файлы через раздел «Загрузка»"
                  : "Нет данных по выбранным фильтрам"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Филиал</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Контрагент</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-800 uppercase tracking-wide">Итого</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-red-400 uppercase tracking-wide">Дебиторка</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-amber-500 uppercase tracking-wide">Кредиторка</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-blue-400 uppercase tracking-wide">Авансы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${netBg(row.net)}`}>
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{row.branch_name}</td>
                        <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate" title={row.counterparty}>
                          {row.counterparty}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm font-bold ${netColor(row.net)}`}>
                          {fmt(row.net)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a1210 !== 0 ? <span className="text-red-600">{fmt(row.a1210)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a3310 !== 0 ? <span className="text-amber-600">{fmt(row.a3310)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a1710 !== 0 ? <span className="text-blue-600">{fmt(row.a1710)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                        <td className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>
                          Итого ({totals.count})
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${netColor(totals.total_net)}`}>
                          {fmt(totals.total_net)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-red-700">{fmt(totals.total_1210)}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-amber-700">{fmt(totals.total_3310)}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-blue-700">{fmt(totals.total_1710)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Excluded: Производство Астана */}
          {excludedRows.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Производство Астана</span>
                <span className="text-xs text-gray-400">(учитывается отдельно)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Филиал</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Контрагент</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Итого</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-red-400 uppercase tracking-wide">Дебиторка</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-amber-500 uppercase tracking-wide">Кредиторка</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-blue-400 uppercase tracking-wide">Авансы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excludedRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{row.branch_name}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.counterparty}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm font-bold ${netColor(row.net)}`}>{fmt(row.net)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a1210 !== 0 ? <span className="text-red-600">{fmt(row.a1210)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a3310 !== 0 ? <span className="text-amber-600">{fmt(row.a3310)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {row.a1710 !== 0 ? <span className="text-blue-600">{fmt(row.a1710)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dynamics Tab ────────────────────────────────────────────────── */}
      {activeTab === "dynamics" && (
        <div className="space-y-4">
          {dates.length < 2 ? (
            <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
              Загрузите ОСВ за второй период чтобы увидеть динамику.
              <div className="text-xs text-gray-300 mt-2">Сейчас доступен только {dates[0] ?? "—"}</div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Controls */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 font-semibold uppercase">Сравнить</span>
                <select
                  value={dateA}
                  onChange={(e) => setDateA(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                >
                  {dates.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <span className="text-xs text-gray-400">→</span>
                <select
                  value={dateB}
                  onChange={(e) => setDateB(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                >
                  {dates.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={dynBranch}
                  onChange={(e) => setDynBranch(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                >
                  <option value="">Все филиалы</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <span className="text-xs text-gray-400 ml-auto">{dynRows.length} контрагентов</span>
              </div>

              {dynRows.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">Нет данных</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">Филиал</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Контрагент</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{effectiveDateA}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{effectiveDateB}</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-800 uppercase tracking-wide">Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dynRows.map((row, i) => (
                        <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${row.delta > 500_000 ? "bg-red-50" : row.delta < -500_000 ? "bg-green-50/40" : ""}`}>
                          <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{row.branch}</td>
                          <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate" title={row.counterparty}>
                            {row.counterparty}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono text-xs ${netColor(row.netA)}`}>
                            {fmt(row.netA)}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono text-xs ${netColor(row.netB)}`}>
                            {row.netB !== 0 ? fmt(row.netB) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <DeltaBadge delta={row.delta} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
