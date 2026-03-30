"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateOrder } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Branch, Nomenclature, CreateOrderPayload } from "@/types";

interface OrderLine {
  id: string;
  nomenclature_id: string;
  nomenclature_name: string;
  qty: string;
  price: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const createOrder = useCreateOrder();

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => api.get("/api/branches").then((r) => r.data),
  });

  const { data: nomenclature = [] } = useQuery<Nomenclature[]>({
    queryKey: ["nomenclature"],
    queryFn: () => api.get("/api/nomenclature").then((r) => r.data),
  });

  const [branchId, setBranchId] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([
    { id: crypto.randomUUID(), nomenclature_id: "", nomenclature_name: "", qty: "", price: "" },
  ]);
  const [error, setError] = useState("");

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), nomenclature_id: "", nomenclature_name: "", qty: "", price: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLine(id: string, field: keyof OrderLine, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === "nomenclature_id") {
          const nom = nomenclature.find((n) => n.id === value);
          return { ...l, nomenclature_id: value, nomenclature_name: nom?.name ?? "" };
        }
        return { ...l, [field]: value };
      })
    );
  }

  const total = lines.reduce((sum, l) => {
    const qty = parseFloat(l.qty) || 0;
    const price = parseFloat(l.price) || 0;
    return sum + qty * price;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!branchId) return setError("Выберите филиал");
    if (lines.some((l) => !l.nomenclature_id || !l.qty || !l.price)) {
      return setError("Заполните все позиции заявки");
    }

    const payload: CreateOrderPayload = {
      branch_id: branchId,
      comment: comment || undefined,
      items: lines.map((l) => ({
        nomenclature_id: l.nomenclature_id,
        qty: parseFloat(l.qty),
        price: parseFloat(l.price),
      })),
    };

    try {
      await createOrder.mutateAsync(payload);
      router.push("/dashboard/orders");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка создания заявки");
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/orders"
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} /> Назад к заявкам
      </Link>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Branch & comment */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Филиал *
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800 bg-white"
            >
              <option value="">Выберите филиал...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Комментарий
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Срочная заявка, доставить до пятницы..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800 resize-none"
            />
          </div>
        </div>

        {/* Order lines */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Позиции заявки</span>
            <span className="text-xs text-gray-400">{lines.length} поз.</span>
          </div>

          <div className="divide-y divide-gray-100">
            {lines.map((line, i) => (
              <div key={line.id} className="px-5 py-4 flex gap-3 items-start">
                <span className="text-xs font-mono text-gray-300 pt-3 w-5 flex-shrink-0">{i + 1}</span>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <select
                      value={line.nomenclature_id}
                      onChange={(e) => updateLine(line.id, "nomenclature_id", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                    >
                      <option value="">Товар...</option>
                      {nomenclature.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={line.qty}
                      onChange={(e) => updateLine(line.id, "qty", e.target.value)}
                      placeholder="Кол-во"
                      min="0"
                      step="1"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      value={line.price}
                      onChange={(e) => updateLine(line.id, "price", e.target.value)}
                      placeholder="Цена, тг"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                </div>

                {/* Line total */}
                <div className="text-xs font-mono font-bold text-gray-600 pt-2.5 w-20 text-right flex-shrink-0">
                  {(parseFloat(line.qty || "0") * parseFloat(line.price || "0")).toLocaleString("ru")} ₸
                </div>

                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length === 1}
                  className="text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors pt-2 flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-800 font-semibold"
            >
              <Plus size={14} /> Добавить позицию
            </button>
            <div className="text-sm font-black text-gray-900">
              Итого: {total.toLocaleString("ru", { maximumFractionDigits: 0 })} ₸
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createOrder.isPending}
            className="flex-1 bg-gray-900 text-white py-3 rounded-lg text-sm font-bold hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {createOrder.isPending ? "Создаём..." : "Создать заявку"}
          </button>
          <Link
            href="/dashboard/orders"
            className="px-6 py-3 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
