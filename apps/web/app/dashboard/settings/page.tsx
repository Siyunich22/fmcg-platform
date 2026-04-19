"use client";
import { useState } from "react";
import { Building2, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import {
  useRentSettings, useUpsertRentSetting, useDeleteRentSetting,
  useFotSetting, useUpsertFotSetting,
} from "@/hooks/useApi";

const BRANCH_NAMES: Record<string, string> = {
  BEREКЕ: "Береке", AKTAU: "Актау", AKTOBE: "Актобе",
  ALMATY: "Алматы", ASTANA: "Астана", ATYRAU: "Атырау",
  KARAGANDA: "Караганда", KOKSHETAU: "Кокшетау",
  SEMEY: "Семей", SHYMKENT: "Шымкент",
};

const ALL_BRANCHES = Object.keys(BRANCH_NAMES);

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { maximumFractionDigits: 0 }) + " ₸";
}

type EditState = {
  branch_code: string;
  area_sqm: string;
  price_per_sqm: string;
  notes: string;
};

export default function SettingsPage() {
  const { data: rentList = [], isLoading: rentLoading } = useRentSettings();
  const { data: fotData } = useFotSetting();
  const upsertRent = useUpsertRentSetting();
  const deleteRent = useDeleteRentSetting();
  const upsertFot = useUpsertFotSetting();

  const [editing, setEditing] = useState<EditState | null>(null);
  const [adding, setAdding] = useState(false);
  const [newEntry, setNewEntry] = useState<EditState>({ branch_code: "", area_sqm: "", price_per_sqm: "", notes: "" });
  const [fotEdit, setFotEdit] = useState<string | null>(null);

  const rentMap = Object.fromEntries(rentList.map((r) => [r.branch_code, r]));

  async function saveRent(entry: EditState) {
    await upsertRent.mutateAsync({
      branch_code: entry.branch_code,
      area_sqm: parseFloat(entry.area_sqm) || 0,
      price_per_sqm: parseFloat(entry.price_per_sqm) || 0,
      notes: entry.notes || undefined,
    });
    setEditing(null);
    setAdding(false);
    setNewEntry({ branch_code: "", area_sqm: "", price_per_sqm: "", notes: "" });
  }

  async function saveFot() {
    if (fotEdit === null) return;
    await upsertFot.mutateAsync(parseFloat(fotEdit) || 25);
    setFotEdit(null);
  }

  const availableBranches = ALL_BRANCHES.filter((bc) => !rentMap[bc]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* ФОТ Section */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">ФОТ (фонд оплаты труда)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Процент от выручки, применяется автоматически по всем филиалам</p>
          </div>
        </div>
        <div className="px-6 py-4 flex items-center gap-4">
          {fotEdit !== null ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={fotEdit}
                  onChange={(e) => setFotEdit(e.target.value)}
                  className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={0}
                  max={100}
                  step={0.5}
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <button
                onClick={saveFot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
              >
                <Check size={13} /> Сохранить
              </button>
              <button onClick={() => setFotEdit(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-gray-900">{fotData?.pct ?? 25}%</span>
              <button
                onClick={() => setFotEdit(String(fotData?.pct ?? 25))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <Pencil size={12} /> Изменить
              </button>
            </>
          )}
        </div>
      </section>

      {/* Аренда Section */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={16} className="text-gray-400" />
              Аренда по филиалам
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Ежемесячная аренда = площадь × цена/м². Заполняется автоматически в P&L.
            </p>
          </div>
          {!adding && availableBranches.length > 0 && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
            >
              <Plus size={13} /> Добавить филиал
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Филиал</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Площадь, м²</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Цена/м², ₸</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Аренда/мес</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Примечание</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rentLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">Загрузка...</td>
                </tr>
              )}

              {rentList.map((row) =>
                editing?.branch_code === row.branch_code ? (
                  <tr key={row.branch_code} className="bg-blue-50">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {BRANCH_NAMES[row.branch_code] ?? row.branch_code}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={editing.area_sqm}
                        onChange={(e) => setEditing({ ...editing, area_sqm: e.target.value })}
                        className="w-24 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={editing.price_per_sqm}
                        onChange={(e) => setEditing({ ...editing, price_per_sqm: e.target.value })}
                        className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmt((parseFloat(editing.area_sqm) || 0) * (parseFloat(editing.price_per_sqm) || 0))}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editing.notes}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                        placeholder="Примечание"
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => saveRent(editing)} className="p-1 text-blue-600 hover:text-blue-800">
                          <Check size={15} />
                        </button>
                        <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-600">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.branch_code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {BRANCH_NAMES[row.branch_code] ?? row.branch_code}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.area_sqm.toLocaleString("ru-KZ")}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.price_per_sqm.toLocaleString("ru-KZ")}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(row.monthly_rent)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setEditing({
                              branch_code: row.branch_code,
                              area_sqm: String(row.area_sqm),
                              price_per_sqm: String(row.price_per_sqm),
                              notes: row.notes ?? "",
                            })
                          }
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteRent.mutate(row.branch_code)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {/* Add new row */}
              {adding && (
                <tr className="bg-green-50">
                  <td className="px-6 py-3">
                    <select
                      value={newEntry.branch_code}
                      onChange={(e) => setNewEntry({ ...newEntry, branch_code: e.target.value })}
                      className="px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Выберите филиал</option>
                      {availableBranches.map((bc) => (
                        <option key={bc} value={bc}>{BRANCH_NAMES[bc]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newEntry.area_sqm}
                      onChange={(e) => setNewEntry({ ...newEntry, area_sqm: e.target.value })}
                      placeholder="м²"
                      className="w-24 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={newEntry.price_per_sqm}
                      onChange={(e) => setNewEntry({ ...newEntry, price_per_sqm: e.target.value })}
                      placeholder="₸/м²"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {fmt((parseFloat(newEntry.area_sqm) || 0) * (parseFloat(newEntry.price_per_sqm) || 0))}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={newEntry.notes}
                      onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                      placeholder="Примечание"
                      className="w-full px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => newEntry.branch_code && saveRent(newEntry)}
                        disabled={!newEntry.branch_code}
                        className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => { setAdding(false); setNewEntry({ branch_code: "", area_sqm: "", price_per_sqm: "", notes: "" }); }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!rentLoading && rentList.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                    Нет данных об аренде. Нажмите «Добавить филиал».
                  </td>
                </tr>
              )}
            </tbody>

            {rentList.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-6 py-3 text-xs font-bold text-gray-700 uppercase">Итого</td>
                  <td />
                  <td />
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {fmt(rentList.reduce((s, r) => s + r.monthly_rent, 0))}
                  </td>
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
