"use client";
import { useState } from "react";
import { Building2, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import {
  useRentSettings, useCreateRentItem, useUpdateRentItem, useDeleteRentItem,
  useFotSetting, useUpsertFotSetting,
  useHqFotItems, useCreateHqFotItem, useUpdateHqFotItem, useDeleteHqFotItem,
  type RentItem, type HqFotItem,
} from "@/hooks/useApi";

const BRANCH_NAMES: Record<string, string> = {
  BEREКЕ: "Береке", AKTAU: "Актау", AKTOBE: "Актобе",
  ALMATY: "Алматы", ASTANA: "Астана", ATYRAU: "Атырау",
  KARAGANDA: "Караганда", KOKSHETAU: "Кокшетау",
  SEMEY: "Семей", SHYMKENT: "Шымкент",
  MAIN: "Головной офис",
};

const ALL_BRANCHES = Object.keys(BRANCH_NAMES);

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { maximumFractionDigits: 0 }) + " ₸";
}

type EditState = Omit<RentItem, "monthly_rent" | "area_sqm" | "price_per_sqm"> & { area_sqm: string; price_per_sqm: string };
type NewState = { branch_code: string; label: string; area_sqm: string; price_per_sqm: string; notes: string };
type HqEditState = Omit<HqFotItem, "total" | "fixed_amount" | "motivation_amount"> & { fixed_amount: string; motivation_amount: string };
type HqNewState = { name: string; fixed_amount: string; motivation_amount: string; notes: string };

const emptyNew = (): NewState => ({ branch_code: "", label: "Офис", area_sqm: "", price_per_sqm: "", notes: "" });
const emptyHqNew = (): HqNewState => ({ name: "", fixed_amount: "", motivation_amount: "", notes: "" });

export default function SettingsPage() {
  const { data: rentList = [], isLoading } = useRentSettings();
  const { data: fotData } = useFotSetting();
  const { data: hqFotList = [] } = useHqFotItems();
  const createRent = useCreateRentItem();
  const updateRent = useUpdateRentItem();
  const deleteRent = useDeleteRentItem();
  const upsertFot = useUpsertFotSetting();
  const createHqFot = useCreateHqFotItem();
  const updateHqFot = useUpdateHqFotItem();
  const deleteHqFot = useDeleteHqFotItem();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newRows, setNewRows] = useState<NewState[]>([]);
  const [fotEdit, setFotEdit] = useState<string | null>(null);
  const [hqEditingId, setHqEditingId] = useState<number | null>(null);
  const [hqEditState, setHqEditState] = useState<HqEditState | null>(null);
  const [hqNewRows, setHqNewRows] = useState<HqNewState[]>([]);

  // Group by branch
  const grouped: Record<string, RentItem[]> = {};
  for (const r of rentList) {
    if (!grouped[r.branch_code]) grouped[r.branch_code] = [];
    grouped[r.branch_code].push(r);
  }
  const usedBranches = new Set(Object.keys(grouped));

  function startEdit(r: RentItem) {
    setEditingId(r.id);
    setEditState({ ...r, area_sqm: String(r.area_sqm), price_per_sqm: String(r.price_per_sqm) });
  }

  async function saveEdit() {
    if (!editState) return;
    await updateRent.mutateAsync({
      id: editState.id,
      branch_code: editState.branch_code,
      label: editState.label,
      area_sqm: parseFloat(editState.area_sqm) || 0,
      price_per_sqm: parseFloat(editState.price_per_sqm) || 0,
      notes: editState.notes || undefined,
    });
    setEditingId(null);
    setEditState(null);
  }

  async function saveNew(n: NewState) {
    if (!n.branch_code || !n.label) return;
    await createRent.mutateAsync({
      branch_code: n.branch_code,
      label: n.label,
      area_sqm: parseFloat(n.area_sqm) || 0,
      price_per_sqm: parseFloat(n.price_per_sqm) || 0,
      notes: n.notes || undefined,
    });
    setNewRows((prev) => prev.filter((x) => x !== n));
  }

  async function saveFot() {
    if (fotEdit === null) return;
    await upsertFot.mutateAsync(parseFloat(fotEdit) || 25);
    setFotEdit(null);
  }

  async function saveHqEdit() {
    if (!hqEditState) return;
    await updateHqFot.mutateAsync({
      id: hqEditState.id,
      name: hqEditState.name,
      fixed_amount: parseFloat(hqEditState.fixed_amount) || 0,
      motivation_amount: parseFloat(hqEditState.motivation_amount) || 0,
      notes: hqEditState.notes || undefined,
    });
    setHqEditingId(null);
    setHqEditState(null);
  }

  async function saveHqNew(n: HqNewState) {
    if (!n.name) return;
    await createHqFot.mutateAsync({
      name: n.name,
      fixed_amount: parseFloat(n.fixed_amount) || 0,
      motivation_amount: parseFloat(n.motivation_amount) || 0,
      notes: n.notes || undefined,
    });
    setHqNewRows((prev) => prev.filter((x) => x !== n));
  }

  const hqTotal = hqFotList.reduce((s, r) => s + r.total, 0);
  const hqFixedTotal = hqFotList.reduce((s, r) => s + r.fixed_amount, 0);
  const hqMotivTotal = hqFotList.reduce((s, r) => s + r.motivation_amount, 0);

  const totalRent = rentList.reduce((s, r) => s + r.monthly_rent, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* ФОТ */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">ФОТ (фонд оплаты труда)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Процент от выручки, применяется по всем филиалам автоматически</p>
        </div>
        <div className="px-6 py-4 flex items-center gap-4">
          {fotEdit !== null ? (
            <>
              <input
                type="number"
                value={fotEdit}
                onChange={(e) => setFotEdit(e.target.value)}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={0} max={100} step={0.5}
              />
              <span className="text-sm text-gray-500">%</span>
              <button onClick={saveFot} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                <Check size={13} /> Сохранить
              </button>
              <button onClick={() => setFotEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
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

      {/* Аренда */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={16} className="text-gray-400" /> Аренда по филиалам
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Можно добавить несколько строк на филиал (офис, склад и др.). Суммируется в P&L автоматически.
            </p>
          </div>
          <button
            onClick={() => setNewRows((p) => [...p, emptyNew()])}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} /> Добавить строку
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Филиал</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Тип</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Площадь, м²</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Цена/м², ₸</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Аренда/мес</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Примечание</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-400">Загрузка...</td></tr>
              )}

              {/* Existing rows — grouped by branch with subtotals */}
              {Object.entries(grouped).map(([bc, items]) => {
                const branchTotal = items.reduce((s, r) => s + r.monthly_rent, 0);
                return (
                  <>
                    {items.map((row) =>
                      editingId === row.id && editState ? (
                        <tr key={row.id} className="bg-blue-50">
                          <td className="px-6 py-2">
                            <select
                              value={editState.branch_code}
                              onChange={(e) => setEditState({ ...editState, branch_code: e.target.value })}
                              className="px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {ALL_BRANCHES.map((b) => <option key={b} value={b}>{BRANCH_NAMES[b]}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              value={editState.label}
                              onChange={(e) => setEditState({ ...editState, label: e.target.value })}
                              className="w-28 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editState.area_sqm}
                              onChange={(e) => setEditState({ ...editState, area_sqm: e.target.value })}
                              className="w-24 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editState.price_per_sqm}
                              onChange={(e) => setEditState({ ...editState, price_per_sqm: e.target.value })}
                              className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {fmt((parseFloat(editState.area_sqm) || 0) * (parseFloat(editState.price_per_sqm) || 0))}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              value={editState.notes ?? ""}
                              onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                              placeholder="Примечание"
                              className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={saveEdit} className="p-1 text-blue-600 hover:text-blue-800"><Check size={15} /></button>
                              <button onClick={() => { setEditingId(null); setEditState(null); }} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-2.5 font-medium text-gray-900">{BRANCH_NAMES[row.branch_code] ?? row.branch_code}</td>
                          <td className="px-4 py-2.5 text-gray-600">{row.label}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{row.area_sqm.toLocaleString("ru-KZ")}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{row.price_per_sqm.toLocaleString("ru-KZ")}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(row.monthly_rent)}</td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{row.notes ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(row)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                              <button onClick={() => deleteRent.mutate(row.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                    {/* Branch subtotal if more than one row */}
                    {items.length > 1 && (
                      <tr key={`${bc}-sub`} className="bg-gray-50 border-t border-gray-100">
                        <td className="px-6 py-1.5 text-xs text-gray-500 italic">{BRANCH_NAMES[bc] ?? bc} — итого</td>
                        <td colSpan={3} />
                        <td className="px-4 py-1.5 text-right text-xs font-bold text-gray-700">{fmt(branchTotal)}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </>
                );
              })}

              {/* New rows being added */}
              {newRows.map((n, idx) => (
                <tr key={`new-${idx}`} className="bg-green-50">
                  <td className="px-6 py-2">
                    <select
                      value={n.branch_code}
                      onChange={(e) => setNewRows((p) => p.map((x, i) => i === idx ? { ...x, branch_code: e.target.value } : x))}
                      className="px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Филиал...</option>
                      {ALL_BRANCHES.map((b) => <option key={b} value={b}>{BRANCH_NAMES[b]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={n.label}
                      onChange={(e) => setNewRows((p) => p.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                      placeholder="Офис / Склад"
                      className="w-28 px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={n.area_sqm}
                      onChange={(e) => setNewRows((p) => p.map((x, i) => i === idx ? { ...x, area_sqm: e.target.value } : x))}
                      placeholder="м²"
                      className="w-24 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={n.price_per_sqm}
                      onChange={(e) => setNewRows((p) => p.map((x, i) => i === idx ? { ...x, price_per_sqm: e.target.value } : x))}
                      placeholder="₸/м²"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                    {fmt((parseFloat(n.area_sqm) || 0) * (parseFloat(n.price_per_sqm) || 0))}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={n.notes}
                      onChange={(e) => setNewRows((p) => p.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                      placeholder="Примечание"
                      className="w-full px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => saveNew(n)}
                        disabled={!n.branch_code || !n.label}
                        className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => setNewRows((p) => p.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && rentList.length === 0 && newRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">
                    Нет данных. Нажмите «Добавить строку».
                  </td>
                </tr>
              )}
            </tbody>

            {rentList.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-6 py-3 text-xs font-bold text-gray-700 uppercase">Итого по всем</td>
                  <td colSpan={3} />
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(totalRent)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ФОТ Головного офиса */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">ФОТ Головного офиса</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Фикс + мотивация по каждому сотруднику. Итог автоматически попадает в P&L (Головной офис → ФОТ).
            </p>
          </div>
          <button
            onClick={() => setHqNewRows((p) => [...p, emptyHqNew()])}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} /> Добавить сотрудника
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
              {hqFotList.map((row) =>
                hqEditingId === row.id && hqEditState ? (
                  <tr key={row.id} className="bg-blue-50">
                    <td className="px-6 py-2">
                      <input
                        value={hqEditState.name}
                        onChange={(e) => setHqEditState({ ...hqEditState, name: e.target.value })}
                        className="w-48 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={hqEditState.fixed_amount}
                        onChange={(e) => setHqEditState({ ...hqEditState, fixed_amount: e.target.value })}
                        className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={hqEditState.motivation_amount}
                        onChange={(e) => setHqEditState({ ...hqEditState, motivation_amount: e.target.value })}
                        className="w-32 px-2 py-1 border border-blue-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmt((parseFloat(hqEditState.fixed_amount) || 0) + (parseFloat(hqEditState.motivation_amount) || 0))}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={hqEditState.notes ?? ""}
                        onChange={(e) => setHqEditState({ ...hqEditState, notes: e.target.value })}
                        placeholder="Примечание"
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setHqEditingId(row.id); setHqEditState({ ...row, fixed_amount: String(row.fixed_amount), motivation_amount: String(row.motivation_amount) }); }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        ><Pencil size={14} /></button>
                        <button onClick={() => deleteHqFot.mutate(row.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {hqNewRows.map((n, idx) => (
                <tr key={`hq-new-${idx}`} className="bg-green-50">
                  <td className="px-6 py-2">
                    <input
                      value={n.name}
                      onChange={(e) => setHqNewRows((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      placeholder="Имя / должность"
                      className="w-48 px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={n.fixed_amount}
                      onChange={(e) => setHqNewRows((p) => p.map((x, i) => i === idx ? { ...x, fixed_amount: e.target.value } : x))}
                      placeholder="0"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={n.motivation_amount}
                      onChange={(e) => setHqNewRows((p) => p.map((x, i) => i === idx ? { ...x, motivation_amount: e.target.value } : x))}
                      placeholder="0"
                      className="w-32 px-2 py-1 border border-green-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                    {fmt((parseFloat(n.fixed_amount) || 0) + (parseFloat(n.motivation_amount) || 0))}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={n.notes}
                      onChange={(e) => setHqNewRows((p) => p.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                      placeholder="Примечание"
                      className="w-full px-2 py-1 border border-green-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => saveHqNew(n)} disabled={!n.name} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"><Check size={15} /></button>
                      <button onClick={() => setHqNewRows((p) => p.filter((_, i) => i !== idx))} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
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
