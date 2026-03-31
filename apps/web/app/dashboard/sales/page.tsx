"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  useSalesReportDates, useSalesReportBranches, useSalesReportSummary,
  useSalesReportRows, useSalesReportTotals, useUploadSalesReport,
  useTmzSummary,
  type SalesReportRow, type SalesReportSummaryRow,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Upload, CheckCircle, XCircle, Loader2,
  ChevronRight, ChevronDown, Search, X, Package,
} from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}
function fmtQty(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Upload block ──────────────────────────────────────────────────────────────
function UploadBlock({ onDone }: { onDone: () => void }) {
  const upload = useUploadSalesReport();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setState("loading");
    try {
      const res = await upload.mutateAsync(files[0]);
      setMsg(`Загружено ${res.rows.toLocaleString("ru")} строк · ${res.branches.join(", ")}`);
      setState("success");
      onDone();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Ошибка загрузки");
      setState("error");
    }
  }, [upload, onDone]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false, disabled: state === "loading",
    accept: { "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
  });

  return (
    <div {...getRootProps()} className={cn(
      "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all",
      isDragActive ? "border-blue-500 bg-blue-50"
      : state === "success" ? "border-green-400 bg-green-50"
      : state === "error" ? "border-red-300 bg-red-50"
      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
    )}>
      <input {...getInputProps()} />
      {state === "loading" && <div className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin text-blue-500" />Обрабатываем...</div>}
      {state === "success" && (
        <div className="flex items-center justify-center gap-2 text-sm text-green-700">
          <CheckCircle size={16} className="text-green-500" />{msg}
          <button className="text-xs text-blue-600 hover:underline ml-2" onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Ещё</button>
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center justify-center gap-2 text-sm text-red-600">
          <XCircle size={16} />{msg}
          <button className="text-xs text-blue-600 hover:underline ml-2" onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Повторить</button>
        </div>
      )}
      {state === "idle" && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Upload size={15} />{isDragActive ? "Отпустите" : "Загрузить отчёт продаж .xlsx"}
        </div>
      )}
    </div>
  );
}

// ── Tree builder ──────────────────────────────────────────────────────────────
interface Cat3Node { cat3: string | null; amount: number; qty: number; }
interface Cat2Node { cat2: string | null; cat3s: Cat3Node[]; amount: number; qty: number; }
interface Cat1Node { cat1: string; cat2s: Cat2Node[]; amount: number; qty: number; }

function buildTree(rows: SalesReportSummaryRow[]): Cat1Node[] {
  const map = new Map<string, Cat1Node>();
  for (const r of rows) {
    const c1 = r.cat1 ?? "Прочее";
    if (!map.has(c1)) map.set(c1, { cat1: c1, cat2s: [], amount: 0, qty: 0 });
    const n1 = map.get(c1)!;
    n1.amount += r.amount; n1.qty += r.qty;
    const c2 = r.cat2 ?? null;
    let n2 = n1.cat2s.find(x => x.cat2 === c2);
    if (!n2) { n2 = { cat2: c2, cat3s: [], amount: 0, qty: 0 }; n1.cat2s.push(n2); }
    n2.amount += r.amount; n2.qty += r.qty;
    const c3 = r.cat3 ?? null;
    let n3 = n2.cat3s.find(x => x.cat3 === c3);
    if (!n3) { n3 = { cat3: c3, amount: 0, qty: 0 }; n2.cat3s.push(n3); }
    n3.amount += r.amount; n3.qty += r.qty;
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

// ── Product rows for a leaf ───────────────────────────────────────────────────
function ProductRows({ rows, search }: { rows: SalesReportRow[]; search: string }) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  if (!filtered.length) return null;

  return (
    <div className="border-t border-gray-100">
      {filtered.map((r, i) => (
        <div key={r.id} className={cn(
          "grid grid-cols-[1fr_100px_130px] gap-2 items-center px-4 py-2 text-xs",
          "border-b border-gray-50 hover:bg-blue-50/30",
          i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-200 flex-shrink-0" />
            <span className="text-gray-700 truncate">{r.name}</span>
            <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{r.branch_name}</span>
          </div>
          <div className="text-right font-mono text-gray-500">{fmtQty(r.qty)}</div>
          <div className="text-right font-mono font-semibold text-gray-800">{r.amount > 0 ? fmt(r.amount) : <span className="text-gray-300">—</span>}</div>
        </div>
      ))}
    </div>
  );
}

// ── Accordion row ─────────────────────────────────────────────────────────────
function AccordionRow({
  label, amount, qty, depth, expanded, onClick, children, highlight,
}: {
  label: string; amount: number; qty: number; depth: number;
  expanded: boolean; onClick: () => void;
  children?: React.ReactNode; highlight?: boolean;
}) {
  const paddingLeft = 16 + depth * 20;
  const textSize = depth === 0 ? "text-sm font-bold" : depth === 1 ? "text-sm font-semibold" : "text-xs font-medium";
  const bgColor = depth === 0 ? "bg-white hover:bg-gray-50" : depth === 1 ? "bg-gray-50/50 hover:bg-gray-100/50" : "bg-white hover:bg-blue-50/30";

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[1fr_100px_140px] items-center gap-2 py-2.5 cursor-pointer select-none border-b border-gray-100 transition-colors",
          bgColor,
          highlight && "bg-blue-50/40"
        )}
        style={{ paddingLeft, paddingRight: 16 }}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 text-gray-400">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className={cn(textSize, "text-gray-800 truncate")}>{label}</span>
        </div>
        <div className={cn("text-right font-mono text-gray-400", depth === 0 ? "text-xs" : "text-xs")}>
          {fmtQty(qty)} шт
        </div>
        <div className={cn(
          "text-right font-mono",
          depth === 0 ? "text-sm font-black text-gray-900" : depth === 1 ? "text-sm font-bold text-gray-800" : "text-xs font-semibold text-gray-700"
        )}>
          {amount > 0 ? fmt(amount) : <span className="text-gray-300">—</span>}
        </div>
      </div>
      {expanded && children}
    </>
  );
}

// ── Main accordion tree ───────────────────────────────────────────────────────
function CategoryAccordion({
  tree, allRows, bonusSummary, bonusRows, search,
}: {
  tree: Cat1Node[];
  allRows: SalesReportRow[];
  bonusSummary: SalesReportSummaryRow[];
  bonusRows: SalesReportRow[];
  search: string;
}) {
  const [open1, setOpen1] = useState<Set<string>>(new Set());
  const [open2, setOpen2] = useState<Set<string>>(new Set());
  const [open3, setOpen3] = useState<Set<string>>(new Set());
  const [bonusOpen, setBonusOpen] = useState(false);

  function toggle1(c1: string) { setOpen1(s => { const n = new Set(s); n.has(c1) ? n.delete(c1) : n.add(c1); return n; }); }
  function toggle2(k: string) { setOpen2(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function toggle3(k: string) { setOpen3(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }

  function getRows(cat1: string | null, cat2: string | null, cat3: string | null) {
    return allRows.filter(r => r.cat1 === cat1 && r.cat2 === cat2 && r.cat3 === cat3 && !r.is_bonus);
  }

  const bonusTree = useMemo(() => buildTree(bonusSummary), [bonusSummary]);
  const bonusTotal = bonusSummary.reduce((s, r) => s + r.amount, 0);
  const bonusQty = bonusSummary.reduce((s, r) => s + r.qty, 0);

  const filteredTree = useMemo(() => {
    if (!search) return tree;
    const q = search.toLowerCase();
    return tree.map(n1 => ({
      ...n1,
      cat2s: n1.cat2s.map(n2 => ({
        ...n2,
        cat3s: n2.cat3s.filter(n3 =>
          allRows.some(r => r.cat1 === n1.cat1 && r.cat2 === n2.cat2 && r.cat3 === n3.cat3 && r.name.toLowerCase().includes(q))
        ),
      })).filter(n2 => n2.cat3s.length > 0 || allRows.some(r => r.cat1 === n1.cat1 && r.cat2 === n2.cat2 && r.name.toLowerCase().includes(q))),
    })).filter(n1 => n1.cat2s.length > 0);
  }, [tree, allRows, search]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_100px_140px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        <div>Категория / Наименование</div>
        <div className="text-right">Кол-во</div>
        <div className="text-right">Сумма</div>
      </div>

      {/* Main categories */}
      {filteredTree.map(n1 => (
        <div key={n1.cat1}>
          <AccordionRow label={n1.cat1} amount={n1.amount} qty={n1.qty} depth={0}
            expanded={open1.has(n1.cat1)} onClick={() => toggle1(n1.cat1)}>
            {n1.cat2s.map(n2 => {
              const k2 = `${n1.cat1}__${n2.cat2}`;
              return (
                <div key={k2}>
                  {n2.cat2 ? (
                    <AccordionRow label={n2.cat2} amount={n2.amount} qty={n2.qty} depth={1}
                      expanded={open2.has(k2)} onClick={() => toggle2(k2)}>
                      {n2.cat3s.map(n3 => {
                        const k3 = `${k2}__${n3.cat3}`;
                        const leafRows = getRows(n1.cat1, n2.cat2, n3.cat3);
                        if (n3.cat3 && leafRows.some(r => r.cat3 !== null)) {
                          return (
                            <div key={k3}>
                              <AccordionRow label={n3.cat3!} amount={n3.amount} qty={n3.qty} depth={2}
                                expanded={open3.has(k3)} onClick={() => toggle3(k3)}>
                                <ProductRows rows={leafRows} search={search} />
                              </AccordionRow>
                            </div>
                          );
                        }
                        return (
                          <div key={k3}>
                            <AccordionRow label={n3.cat3 ?? n2.cat2 ?? n1.cat1} amount={n3.amount} qty={n3.qty} depth={2}
                              expanded={open3.has(k3)} onClick={() => toggle3(k3)}>
                              <ProductRows rows={leafRows} search={search} />
                            </AccordionRow>
                          </div>
                        );
                      })}
                    </AccordionRow>
                  ) : (
                    // No cat2 — show products directly
                    <AccordionRow label="Позиции" amount={n2.amount} qty={n2.qty} depth={1}
                      expanded={open2.has(k2)} onClick={() => toggle2(k2)}>
                      <ProductRows rows={getRows(n1.cat1, null, null)} search={search} />
                    </AccordionRow>
                  )}
                </div>
              );
            })}
          </AccordionRow>
        </div>
      ))}

      {/* Bonuses section */}
      {bonusRows.length > 0 && (
        <div className="border-t-2 border-amber-100">
          <div
            className="grid grid-cols-[1fr_100px_140px] items-center gap-2 py-2.5 cursor-pointer select-none bg-amber-50/50 hover:bg-amber-50 border-b border-amber-100 transition-colors px-4"
            onClick={() => setBonusOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              {bonusOpen ? <ChevronDown size={13} className="text-amber-500" /> : <ChevronRight size={13} className="text-amber-500" />}
              <span className="text-sm font-bold text-amber-700">БОНУСЫ</span>
              <span className="text-[10px] text-amber-500 bg-amber-100 rounded px-1.5 py-0.5 font-semibold">бесплатная отгрузка</span>
            </div>
            <div className="text-right text-xs font-mono text-amber-600">{fmtQty(bonusQty)} шт</div>
            <div className="text-right text-sm font-black text-amber-700">{bonusTotal > 0 ? fmt(bonusTotal) : "—"}</div>
          </div>
          {bonusOpen && bonusTree.map(n1 => (
            <div key={`bonus_${n1.cat1}`} className="bg-amber-50/20">
              {bonusRows.filter(r => r.cat1 === n1.cat1).map((r, i) => (
                <div key={r.id} className={cn(
                  "grid grid-cols-[1fr_100px_130px] gap-2 items-center py-2 text-xs border-b border-amber-50 px-8",
                  i % 2 === 0 ? "bg-white" : "bg-amber-50/10"
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                    <span className="text-gray-700 truncate">{r.name}</span>
                    <span className="flex-shrink-0 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">{r.branch_name}</span>
                  </div>
                  <div className="text-right font-mono text-gray-500">{fmtQty(r.qty)}</div>
                  <div className="text-right font-mono text-gray-600">{r.amount > 0 ? fmt(r.amount) : <span className="text-gray-300">—</span>}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon size={17} className="text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{label}</div>
        <div className="text-base font-black text-gray-900 truncate">{value}</div>
        {sub && <div className="text-[10px] text-gray-400 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { data: dates = [] } = useSalesReportDates();
  const { data: branchList = [] } = useSalesReportBranches();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const params = { period_date: selectedDate || undefined, branch_code: selectedBranch || undefined };

  const { data: summary = [], isLoading } = useSalesReportSummary({ ...params, is_bonus: false });
  const { data: bonusSummary = [] } = useSalesReportSummary({ ...params, is_bonus: true });
  const { data: totals = [] } = useSalesReportTotals(params);
  const { data: allRows = [] } = useSalesReportRows({ ...params, is_bonus: false });
  const { data: bonusRows = [] } = useSalesReportRows({ ...params, is_bonus: true });
  const { data: tmzSummary = [] } = useTmzSummary(selectedDate ? selectedDate.substring(0, 7) + "-31" : undefined);

  const tree = useMemo(() => buildTree(summary), [summary]);
  const grandTotal = useMemo(() => totals.reduce((s, r) => s + r.amount, 0), [totals]);
  const grandQty = useMemo(() => totals.reduce((s, r) => s + r.qty, 0), [totals]);
  const tmzTotal = useMemo(() => tmzSummary.reduce((s, r) => s + (selectedBranch ? (r.branch_code === selectedBranch ? r.total_amount : 0) : r.total_amount), 0), [tmzSummary, selectedBranch]);
  const topCat = useMemo(() => tree[0]?.cat1 ?? "—", [tree]);

  const isEmpty = !isLoading && summary.length === 0;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Продажи</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Все филиалы</option>
            {branchList.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowUpload(!showUpload)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700")}>
            <Upload size={14} />Загрузить
          </button>
        </div>
      </div>

      {showUpload && <UploadBlock onDone={() => setShowUpload(false)} />}

      {/* KPI row */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Реализация" value={fmt(grandTotal)} sub={`${fmtQty(grandQty)} шт`} icon={TrendingUp} color="bg-blue-500" />
          <KpiCard label="Топ категория" value={topCat} sub={tree[0] ? fmt(tree[0].amount) : undefined} icon={TrendingUp} color="bg-indigo-500" />
          <KpiCard label="Филиалов" value={String(totals.length || branchList.length)} sub="в отчёте" icon={TrendingUp} color="bg-violet-500" />
          <KpiCard label="ТМЗ в наличии" value={fmt(tmzTotal)} sub="остатки на складе" icon={Package} color="bg-emerald-500" />
        </div>
      )}

      {/* Branch cards */}
      {!isEmpty && !selectedBranch && totals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[...totals].sort((a, b) => b.amount - a.amount).map(t => (
            <button key={t.branch_code}
              onClick={() => setSelectedBranch(t.branch_code)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
              <div className="text-xs font-semibold text-gray-500 truncate">{t.branch_name}</div>
              <div className="text-sm font-black text-gray-900 mt-0.5">{fmt(t.amount)}</div>
              <div className="text-xs text-gray-400">{fmtQty(t.qty)} шт</div>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {!isEmpty && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Поиск по наименованию..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
          {selectedBranch && (
            <button onClick={() => setSelectedBranch("")}
              className="flex items-center gap-1 px-3 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
              <X size={12} />{branchList.find(b => b.code === selectedBranch)?.name}
            </button>
          )}
          <div className="ml-auto text-sm text-gray-400">{allRows.length.toLocaleString("ru")} позиций</div>
        </div>
      )}

      {/* Main accordion */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : isEmpty ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <TrendingUp size={36} className="text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm font-medium">
            {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить»." : "Нет данных по выбранным фильтрам."}
          </div>
        </div>
      ) : (
        <CategoryAccordion
          tree={tree}
          allRows={allRows}
          bonusSummary={bonusSummary}
          bonusRows={bonusRows}
          search={search}
        />
      )}
    </div>
  );
}
