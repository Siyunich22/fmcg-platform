"use client";
import { useState } from "react";
import { useOrders, useUpdateOrderStatus } from "@/hooks/useApi";
import { formatMoney, orderStatusLabel } from "@/lib/api";
import { Plus, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { OrderStatus, OrderFilters } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  shipped:   "bg-purple-50 text-purple-700 border-purple-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   "confirmed",
  confirmed: "shipped",
  shipped:   "delivered",
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  pending:   "Подтвердить",
  confirmed: "Отгружена",
  shipped:   "Доставлена",
};

export default function OrdersPage() {
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, page_size: 20 });
  const { data, isLoading } = useOrders(filters);
  const updateStatus = useUpdateOrderStatus();

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const confirmedCount = orders.filter((o) => o.status === "confirmed").length;

  return (
    <div>
      {/* Stats + Add button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <div className="text-xs text-amber-600 font-semibold">Ожидают</div>
            <div className="text-xl font-black text-amber-700">{pendingCount}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <div className="text-xs text-blue-600 font-semibold">Подтверждены</div>
            <div className="text-xl font-black text-blue-700">{confirmedCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
            <div className="text-xs text-gray-500 font-semibold">Всего</div>
            <div className="text-xl font-black text-gray-700">{total}</div>
          </div>
        </div>
        <Link
          href="/dashboard/orders/new"
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          <Plus size={15} />
          Новая заявка
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { label: "Все", value: undefined },
          { label: "Ожидают", value: "pending" },
          { label: "Подтверждены", value: "confirmed" },
          { label: "Отгружены", value: "shipped" },
          { label: "Доставлены", value: "delivered" },
        ].map((f) => (
          <button
            key={f.label}
            onClick={() => setFilters((prev) => ({ ...prev, status: f.value as OrderStatus | undefined, page: 1 }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filters.status === f.value
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-gray-400 text-sm">
            Заявок нет. <Link href="/dashboard/orders/new" className="text-blue-700 hover:underline">Создать первую →</Link>
          </div>
        ) : (
          orders.map((order) => {
            const next = NEXT_STATUS[order.status];
            return (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="text-xs font-mono text-gray-400 w-20 flex-shrink-0">
                  {order.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{order.branch_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {order.items.map((i) => i.nomenclature_name).join(" · ")}
                  </div>
                </div>
                <div className="font-mono font-bold text-sm text-gray-800 flex-shrink-0">
                  {formatMoney(order.total_amount)}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex-shrink-0 ${STATUS_COLORS[order.status]}`}>
                  {orderStatusLabel(order.status)}
                </span>
                {next && (
                  <button
                    onClick={() => updateStatus.mutate({ id: order.id, status: next })}
                    disabled={updateStatus.isPending}
                    className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {NEXT_LABEL[order.status]}
                  </button>
                )}
                {order.status === "pending" && (
                  <button
                    onClick={() => updateStatus.mutate({ id: order.id, status: "cancelled" })}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    Отмена
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* WhatsApp future hint */}
      <div className="mt-6 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-lg px-5 py-4">
        <div className="text-sm font-semibold text-amber-800 mb-1">
          🤖 Следующий шаг: WhatsApp Bot
        </div>
        <div className="text-xs text-amber-700 leading-relaxed">
          Сейчас заявки создаются вручную. После подключения <strong>Green API</strong> (~$30/мес) +{" "}
          <strong>Claude API</strong> (~$5/мес) бот будет принимать сообщения от филиалов и создавать
          заявки автоматически. Менеджер только подтверждает.
        </div>
      </div>
    </div>
  );
}
