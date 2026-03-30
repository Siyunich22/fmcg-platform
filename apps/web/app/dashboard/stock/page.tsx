"use client";
import { useState, useMemo } from "react";
import { useStock, useStockCategories, useBranches } from "@/hooks/useApi";
import { formatMoney } from "@/lib/api";
import { Package, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight, Search } from "lucide-react";
import type { StockRow } from "@/types";

const FLAG_TABS = [
  { label: "Все", value: undefined },
  { label: "Норма", value: "ok" },
  { label: "Избыток", value: "warning" },
  { label: "Стоп", value: "critical" },
] as const;

type FlagFilter = "ok" | "warning" | "critical" | undefined;

const FLAG_BADGE: Record<string, string> = {
  ok: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-600 border-red-200",
};
const FLAG_LABEL: Record<string, string> = { ok: "Норма", warning: "Избыток", critical: "⚠ Стоп" };

export default function StockPage() {
  const [flag, setFlag] = useState<FlagFilter>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filters = {
    limit: 2000,
    ...(selectedBranch && { branch_id: selectedBranch }),
    ...(selectedCategory && { category: selectedCategory }),
    ...(selectedSubcategory && { subcategory: selectedSubcategory }),
    ...(flag && { flag }),
    ...(search && { search }),
  };

  const { data: rows = [], isLoading } = useStock(filters);
  const { data: catTree = [] } = useStockCategories();
  const { data: branches = [] } = useBranches();

  // Get subcategories for selected category
  const subcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return catTree.find((c) => c.category === selectedCategory)?.subcategories ?? [];
  }, [catTree, selectedCategory]);

  // Group rows by category → subcategory
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, StockRow[]>>();
    for (const row of rows) {
      const cat = row.category;
      const sub = row.subcategory;
      if (!map.has(cat)) map.set(cat, new Map());
      const subMap = map.get(cat)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(row);
    }
    return map;
  }, [rows]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const countOk = rows.filter((r) => r.flag === "ok").length;
  const countWarn = rows.filter((r) => r.flag === "warning").length;
  const countCrit = rows.filter((r) => r.flag === "critical").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
          <div>
            <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Норма</div>
            <div className="text-2xl font-black text-green-700">{countOk}</div>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
          <div>
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Избыток</div>
            <div className="text-2xl font-black text-amber-700">{countWarn}</div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Стоп</div>
            <div className="text-2xl font-black text-red-700">{countCrit}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по товару..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Branch */}
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все филиалы</option>
          {branches.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* Category */}
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubcategory(""); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все категории</option>
          {catTree.map((c) => (
            <option key={c.category} value={c.category}>{c.category}</option>
          ))}
        </select>

        {/* Subcategory */}
        {subcategories.length > 0 && (
          <select
            value={selectedSubcategory}
            onChange={(e) => setSelectedSubcategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Все подкатегории</option>
            {subcategories.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Flag tabs */}
        <div className="flex gap-1.5 ml-auto">
          {FLAG_TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setFlag(t.value as FlagFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                flag === t.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-900">Остатки по товарам</span>
          <span className="text-xs text-gray-400 font-mono">({rows.length} поз.)</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            Нет данных — загрузите сток-файл
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-8"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Товар</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Кол-во</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Остаток, тг</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Продажи, тг</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Дней</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Статус</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([cat, subMap]) => (
                  <>
                    {/* Category header row */}
                    <tr
                      key={`cat-${cat}`}
                      className="bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-150"
                      onClick={() => toggleCollapse(`cat-${cat}`)}
                    >
                      <td className="px-4 py-2 text-gray-500">
                        {collapsed.has(`cat-${cat}`) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td colSpan={7} className="px-4 py-2 font-bold text-gray-700 text-xs uppercase tracking-wide">
                        {cat}
                        <span className="ml-2 font-normal text-gray-400">
                          {Array.from(subMap.values()).flat().length} позиций
                        </span>
                      </td>
                    </tr>

                    {!collapsed.has(`cat-${cat}`) && Array.from(subMap.entries()).map(([sub, subRows]) => (
                      <>
                        {/* Subcategory header */}
                        <tr
                          key={`sub-${cat}-${sub}`}
                          className="bg-blue-50/40 border-b border-blue-100/50 cursor-pointer hover:bg-blue-50"
                          onClick={() => toggleCollapse(`sub-${cat}-${sub}`)}
                        >
                          <td className="pl-8 py-2 text-blue-400">
                            {collapsed.has(`sub-${cat}-${sub}`) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </td>
                          <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-blue-700">
                            {sub}
                            <span className="ml-2 font-normal text-blue-400">{subRows.length} поз.</span>
                          </td>
                        </tr>

                        {/* Product rows */}
                        {!collapsed.has(`sub-${cat}-${sub}`) && subRows.map((row, i) => (
                          <tr
                            key={row.id}
                            className={i % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-gray-50/30 hover:bg-gray-50"}
                          >
                            <td></td>
                            <td className="px-4 py-2.5 text-gray-900 max-w-[280px]">
                              <div className="truncate text-sm">{row.name}</div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{row.branch_name}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-700 text-sm">
                              {row.qty.toLocaleString("ru")}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-600 text-xs">
                              {formatMoney(row.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-blue-600 text-xs">
                              {row.sales_sum > 0 ? formatMoney(row.sales_sum) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`font-mono font-bold text-sm ${
                                row.flag === "critical" ? "text-red-600"
                                : row.flag === "warning" ? "text-amber-600"
                                : "text-green-600"
                              }`}>
                                {row.days_supply >= 9999 ? "∞" : row.days_supply}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded border ${FLAG_BADGE[row.flag]}`}>
                                {FLAG_LABEL[row.flag]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
