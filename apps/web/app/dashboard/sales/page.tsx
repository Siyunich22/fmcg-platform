"use client";
import { useState } from "react";
import { useSalesByBranch, useSalesByCategory } from "@/hooks/useApi";
import { formatMoney } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";

const COLORS = [
  "#1e3a8a", "#1e40af", "#1d4ed8", "#2563eb", "#3b82f6",
  "#60a5fa", "#93c5fd", "#bfdbfe",
];

export default function SalesPage() {
  const { data: byBranch = [], isLoading: branchLoading } = useSalesByBranch();
  const { data: byCat = [], isLoading: catLoading } = useSalesByCategory();

  const totalRevenue = byBranch.reduce((s, r) => s + r.amount, 0);
  const topBranch = byBranch[0];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Общая выручка</div>
          <div className="text-2xl font-black text-gray-900">{formatMoney(totalRevenue)}</div>
          <div className="text-xs text-gray-400 mt-1">все филиалы</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Лидер продаж</div>
          <div className="text-lg font-black text-gray-900 truncate">{topBranch?.branch_name ?? "—"}</div>
          <div className="text-xs text-gray-400 mt-1">{topBranch ? formatMoney(topBranch.amount) : ""}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Категорий</div>
          <div className="text-2xl font-black text-gray-900">{byCat.length}</div>
          <div className="text-xs text-gray-400 mt-1">активных</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By branch */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-sm font-bold text-gray-900 mb-1">Продажи по филиалам</div>
          <div className="text-xs text-gray-400 mb-4">млн тг</div>
          {branchLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Загрузка...</div>
          ) : byBranch.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={byBranch.map((b) => ({ ...b, amount_m: b.amount / 1_000_000 }))}
                layout="vertical"
                margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
                <YAxis type="category" dataKey="branch_name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)} млн ₸`, "Выручка"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="amount_m" radius={[0, 4, 4, 0]}>
                  {byBranch.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By category */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-sm font-bold text-gray-900 mb-1">Выручка по категориям</div>
          <div className="text-xs text-gray-400 mb-4">доля в продажах</div>
          {catLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Загрузка...</div>
          ) : byCat.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={byCat}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  label={({ category, percent }) =>
                    `${category} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {byCat.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [formatMoney(v), "Выручка"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Branch table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-900">Детализация по филиалам</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Филиал</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Выручка</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Доля</th>
            </tr>
          </thead>
          <tbody>
            {byBranch.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">
                  Загрузите данные продаж через раздел «Загрузка»
                </td>
              </tr>
            ) : (
              byBranch.map((row, i) => (
                <tr key={row.branch_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-5 py-3 text-xs font-mono text-gray-300">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.branch_name}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{ width: `${totalRevenue > 0 ? (row.amount / totalRevenue) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-500 w-10 text-right">
                        {totalRevenue > 0 ? ((row.amount / totalRevenue) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-64 flex flex-col items-center justify-center text-gray-300 gap-2">
      <TrendingUp size={32} />
      <div className="text-sm">Нет данных</div>
    </div>
  );
}
