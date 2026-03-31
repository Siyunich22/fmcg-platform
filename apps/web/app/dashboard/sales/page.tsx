"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  useSalesReportDates, useSalesReportBranches, useSalesReportSummary,
  useSalesReportRows, useSalesReportTotals, useUploadSalesReport,
  type SalesReportRow, type SalesReportSummaryRow, type SalesReportTotal,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Upload, CheckCircle, XCircle, Loader2,
  ChevronRight, ChevronDown, Search, X, BarChart2,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₸";
}
function fmtQty(n: number) {
  return n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " тыс";
  return n.toFixed(0);
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
    accept: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  return (
    <div {...getRootProps()} className={cn(
      "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
      isDragActive ? "border-blue-500 bg-blue-50"
        : state === "success" ? "border-green-400 bg-green-50"
        : state === "error" ? "border-red-300 bg-red-50"
        : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
    )}>
      <input {...getInputProps()} />
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin text-blue-500" />Обрабатываем...
        </div>
      )}
      {state === "success" && (
        <div className="flex items-center justify-center gap-2 text-sm text-green-700">
          <CheckCircle size={16} className="text-green-500" />{msg}
          <button className="text-xs text-blue-600 hover:underline ml-2"
            onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Ещё</button>
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center justify-center gap-2 text-sm text-red-600">
          <XCircle size={16} />{msg}
          <button className="text-xs text-blue-600 hover:underline ml-2"
            onClick={(e) => { e.stopPropagation(); setState("idle"); }}>Повторить</button>
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

// ── Branch comparison chart (CSS bars) ────────────────────────────────────────
function BranchChart({
  totals, selectedBranch, onSelect,
}: {
  totals: SalesReportTotal[];
  selectedBranch: string;
  onSelect: (code: string) => void;
}) {
  const sorted = useMemo(() => [...totals].sort((a, b) => b.amount - a.amount), [totals]);
  const max = sorted[0]?.amount ?? 1;
  const grandTotal = sorted.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Сравнение филиалов
        </span>
        {selectedBranch && (
          <button
            onClick={() => onSelect("")}
            className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <X size={11} /> Сбросить
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {sorted.map((t, i) => {
          const pct = max > 0 ? (t.amount / max) * 100 : 0;
          const sharePct = grandTotal > 0 ? ((t.amount / grandTotal) * 100).toFixed(1) : "0";
          const isSelected = selectedBranch === t.branch_code;
          const isDimmed = !!selectedBranch && !isSelected;

          return (
            <button
              key={t.branch_code}
              onClick={() => onSelect(isSelected ? "" : t.branch_code)}
              className={cn("w-full text-left transition-opacity", isDimmed && "opacity-35")}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className={cn(
                  "text-[11px] font-semibold w-20 truncate flex-shrink-0",
                  isSelected ? "text-blue-700" : "text-gray-600"
                )}>
                  {i + 1}. {t.branch_name}
                </span>
                <span className={cn(
                  "text-[11px] font-mono ml-auto",
                  isSelected ? "text-blue-700 font-bold" : "text-gray-700"
                )}>
                  {fmt(t.amount)}
                </span>
                <span className="text-[10px] text-gray-400 w-10 text-right flex-shrink-0">
                  {sharePct}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isSelected
                      ? "bg-blue-600"
                      : i === 0 ? "bg-blue-500"
                      : i === 1 ? "bg-blue-400"
                      : i <= 3 ? "bg-blue-300"
                      : "bg-blue-200"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-gray-400">{fmtQty(t.qty)} шт</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Product detail modal ──────────────────────────────────────────────────────
function ProductModal({
  product, allRows, bonusRows, onClose,
}: {
  product: SalesReportRow;
  allRows: SalesReportRow[];
  bonusRows: SalesReportRow[];
  onClose: () => void;
}) {
  const productRows = useMemo(() =>
    allRows
      .filter(r => r.code === product.code && !r.is_bonus)
      .sort((a, b) => b.amount - a.amount),
    [allRows, product.code]
  );

  const relatedBonuses = useMemo(() =>
    bonusRows
      .filter(r => r.cat1 === product.cat1)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 30),
    [bonusRows, product.cat1]
  );

  const maxAmt = productRows[0]?.amount ?? 1;
  const totalAmt = productRows.reduce((s, r) => s + r.amount, 0);
  const totalQty = productRows.reduce((s, r) => s + r.qty, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-gray-400 mb-0.5">{product.code}</div>
            <div className="text-sm font-bold text-gray-900 leading-snug">{product.name}</div>
            {product.cat1 && (
              <div className="text-xs text-gray-400 mt-0.5">
                {[product.cat1, product.cat2, product.cat3].filter(Boolean).join(" › ")}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* KPI strip */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 flex-shrink-0">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Итого</div>
            <div className="text-base font-black text-gray-900">{fmt(totalAmt)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Кол-во</div>
            <div className="text-base font-black text-gray-900">{fmtQty(totalQty)} шт</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Филиалов</div>
            <div className="text-base font-black text-gray-900">{productRows.length}</div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Per-branch breakdown */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Продажи по филиалам
            </div>
            {productRows.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">Нет данных</div>
            ) : (
              <div className="space-y-2.5">
                {productRows.map((r, i) => {
                  const pct = maxAmt > 0 ? (r.amount / maxAmt) * 100 : 0;
                  return (
                    <div key={r.branch_code}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{r.branch_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-400">{fmtQty(r.qty)} шт</span>
                          <span className="text-xs font-bold text-gray-800 w-28 text-right">{fmt(r.amount)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            i === 0 ? "bg-blue-500" : i === 1 ? "bg-blue-400" : i === 2 ? "bg-blue-300" : "bg-blue-200"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Related bonuses */}
          {relatedBonuses.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-2">
                Бонусы в категории «{product.cat1}»
              </div>
              <div className="space-y-0.5">
                {relatedBonuses.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-amber-50/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{r.name}</span>
                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                      {r.branch_name}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500 w-14 text-right flex-shrink-0">
                      {fmtQty(r.qty)} шт
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
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

// ── Product rows ──────────────────────────────────────────────────────────────
function ProductRows({
  rows, search, onProductClick,
}: {
  rows: SalesReportRow[];
  search: string;
  onProductClick: (r: SalesReportRow) => void;
}) {
  // Group by product code, aggregate branches
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const map = new Map<string, { row: SalesReportRow; branches: string[]; qty: number; amount: number }>();
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q)) continue;
      const key = r.code || r.name;
      if (!map.has(key)) {
        map.set(key, { row: r, branches: [], qty: 0, amount: 0 });
      }
      const g = map.get(key)!;
      g.qty += r.qty;
      g.amount += r.amount;
      g.branches.push(r.branch_name);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [rows, search]);

  if (!grouped.length) return null;

  return (
    <div className="border-t border-gray-100">
      {grouped.map((g, i) => (
        <button
          key={g.row.code || g.row.name}
          onClick={() => onProductClick(g.row)}
          className={cn(
            "w-full text-left grid grid-cols-[1fr_90px_130px] gap-2 items-center px-4 py-2 text-xs",
            "border-b border-gray-50 hover:bg-blue-50/40 transition-colors group",
            i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-200 flex-shrink-0 group-hover:bg-blue-400 transition-colors" />
            <span className="text-gray-700 truncate group-hover:text-blue-700">{g.row.name}</span>
            <span className="flex-shrink-0 text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
              → подробнее
            </span>
          </div>
          <div className="text-right font-mono text-gray-400">{fmtQty(g.qty)} шт</div>
          <div className="text-right font-mono font-semibold text-gray-800">
            {g.amount > 0 ? fmt(g.amount) : <span className="text-gray-300">—</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Accordion row ─────────────────────────────────────────────────────────────
function AccordionRow({
  label, amount, qty, depth, expanded, onClick, children,
}: {
  label: string; amount: number; qty: number; depth: number;
  expanded: boolean; onClick: () => void; children?: React.ReactNode;
}) {
  const pl = 16 + depth * 20;
  const textCls =
    depth === 0 ? "text-sm font-bold" :
    depth === 1 ? "text-sm font-semibold" :
    "text-xs font-medium";
  const bgCls =
    depth === 0 ? "bg-white hover:bg-gray-50" :
    depth === 1 ? "bg-gray-50/50 hover:bg-gray-100/50" :
    "bg-white hover:bg-blue-50/30";

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[1fr_90px_140px] items-center gap-2 py-2.5 cursor-pointer select-none",
          "border-b border-gray-100 transition-colors", bgCls
        )}
        style={{ paddingLeft: pl, paddingRight: 16 }}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 text-gray-400">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className={cn(textCls, "text-gray-800 truncate")}>{label}</span>
        </div>
        <div className="text-right text-xs font-mono text-gray-400">{fmtQty(qty)} шт</div>
        <div className={cn(
          "text-right font-mono",
          depth === 0 ? "text-sm font-black text-gray-900" :
          depth === 1 ? "text-sm font-bold text-gray-800" :
          "text-xs font-semibold text-gray-700"
        )}>
          {amount > 0 ? fmt(amount) : <span className="text-gray-300">—</span>}
        </div>
      </div>
      {expanded && children}
    </>
  );
}

// ── Category accordion ────────────────────────────────────────────────────────
function CategoryAccordion({
  tree, allRows, bonusSummary, bonusRows, search, onProductClick,
}: {
  tree: Cat1Node[];
  allRows: SalesReportRow[];
  bonusSummary: SalesReportSummaryRow[];
  bonusRows: SalesReportRow[];
  search: string;
  onProductClick: (r: SalesReportRow) => void;
}) {
  const [open1, setOpen1] = useState<Set<string>>(new Set());
  const [open2, setOpen2] = useState<Set<string>>(new Set());
  const [open3, setOpen3] = useState<Set<string>>(new Set());
  const [bonusOpen, setBonusOpen] = useState(false);

  const toggle1 = (c: string) => setOpen1(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggle2 = (c: string) => setOpen2(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggle3 = (c: string) => setOpen3(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });

  function getRows(cat1: string, cat2: string | null, cat3: string | null) {
    return allRows.filter(r =>
      r.cat1 === cat1 && r.cat2 === cat2 && r.cat3 === cat3 && !r.is_bonus
    );
  }

  const bonusTotal = bonusSummary.reduce((s, r) => s + r.amount, 0);
  const bonusQty = bonusSummary.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_90px_140px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        <div>Категория / Наименование</div>
        <div className="text-right">Кол-во</div>
        <div className="text-right">Сумма</div>
      </div>

      {/* Category tree */}
      {tree.map(n1 => (
        <div key={n1.cat1}>
          <AccordionRow label={n1.cat1} amount={n1.amount} qty={n1.qty} depth={0}
            expanded={open1.has(n1.cat1)} onClick={() => toggle1(n1.cat1)}>
            {n1.cat2s.map(n2 => {
              const k2 = `${n1.cat1}__${n2.cat2}`;
              if (!n2.cat2) {
                return (
                  <div key={k2}>
                    <AccordionRow label="Позиции" amount={n2.amount} qty={n2.qty} depth={1}
                      expanded={open2.has(k2)} onClick={() => toggle2(k2)}>
                      <ProductRows
                        rows={getRows(n1.cat1, null, null)}
                        search={search}
                        onProductClick={onProductClick}
                      />
                    </AccordionRow>
                  </div>
                );
              }
              return (
                <div key={k2}>
                  <AccordionRow label={n2.cat2} amount={n2.amount} qty={n2.qty} depth={1}
                    expanded={open2.has(k2)} onClick={() => toggle2(k2)}>
                    {n2.cat3s.map(n3 => {
                      const k3 = `${k2}__${n3.cat3}`;
                      const leafRows = getRows(n1.cat1, n2.cat2, n3.cat3);
                      return (
                        <div key={k3}>
                          <AccordionRow
                            label={n3.cat3 ?? n2.cat2 ?? n1.cat1}
                            amount={n3.amount} qty={n3.qty} depth={2}
                            expanded={open3.has(k3)} onClick={() => toggle3(k3)}>
                            <ProductRows rows={leafRows} search={search} onProductClick={onProductClick} />
                          </AccordionRow>
                        </div>
                      );
                    })}
                  </AccordionRow>
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
            className="grid grid-cols-[1fr_90px_140px] items-center gap-2 py-2.5 cursor-pointer select-none bg-amber-50/50 hover:bg-amber-50 border-b border-amber-100 transition-colors px-4"
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
          {bonusOpen && (
            <div>
              {bonusRows.slice(0, 200).map((r, i) => (
                <div key={r.id} className={cn(
                  "grid grid-cols-[1fr_90px_130px] gap-2 items-center py-2 text-xs border-b border-amber-50 px-8",
                  i % 2 === 0 ? "bg-white" : "bg-amber-50/10"
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                    <span className="text-gray-700 truncate">{r.name}</span>
                    <span className="flex-shrink-0 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                      {r.branch_name}
                    </span>
                  </div>
                  <div className="text-right font-mono text-gray-500">{fmtQty(r.qty)}</div>
                  <div className="text-right font-mono text-gray-600">
                    {r.amount > 0 ? fmt(r.amount) : <span className="text-gray-300">—</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className={cn("rounded-xl px-4 py-3 border", color)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60 truncate">{label}</div>
      <div className="text-lg font-black truncate mt-0.5">{value}</div>
      {sub && <div className="text-[11px] opacity-50 truncate">{sub}</div>}
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
  const [selectedProduct, setSelectedProduct] = useState<SalesReportRow | null>(null);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const params = {
    period_date: selectedDate || undefined,
    branch_code: selectedBranch || undefined,
  };

  const { data: summary = [], isLoading } = useSalesReportSummary({ ...params, is_bonus: false });
  const { data: bonusSummary = [] } = useSalesReportSummary({ ...params, is_bonus: true });
  const { data: totals = [] } = useSalesReportTotals({ period_date: selectedDate || undefined });
  const { data: allRows = [] } = useSalesReportRows({ ...params, is_bonus: false });
  const { data: bonusRows = [] } = useSalesReportRows({ ...params, is_bonus: true });

  const tree = useMemo(() => buildTree(summary), [summary]);
  const grandTotal = useMemo(() => {
    if (selectedBranch) {
      return totals.find(t => t.branch_code === selectedBranch)?.amount ?? 0;
    }
    return totals.reduce((s, r) => s + r.amount, 0);
  }, [totals, selectedBranch]);
  const grandQty = useMemo(() => {
    if (selectedBranch) {
      return totals.find(t => t.branch_code === selectedBranch)?.qty ?? 0;
    }
    return totals.reduce((s, r) => s + r.qty, 0);
  }, [totals, selectedBranch]);
  const topCat = tree[0]?.cat1 ?? "—";
  const isEmpty = !isLoading && summary.length === 0;
  const activeBranchName = selectedBranch
    ? branchList.find(b => b.code === selectedBranch)?.name ?? selectedBranch
    : null;

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Продажи</h1>
          {activeBranchName && (
            <span className="flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1">
              {activeBranchName}
              <button onClick={() => setSelectedBranch("")} className="text-blue-400 hover:text-blue-700">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Upload size={14} />Загрузить
          </button>
        </div>
      </div>

      {showUpload && <UploadBlock onDone={() => { setShowUpload(false); }} />}

      {/* KPI strip */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Реализация"
            value={fmt(grandTotal)}
            sub={`${fmtQty(grandQty)} шт`}
            color="bg-blue-600 text-white border-blue-600"
          />
          <KpiCard
            label="Топ категория"
            value={topCat}
            sub={tree[0] ? fmtShort(tree[0].amount) + " ₸" : undefined}
            color="bg-white text-gray-900 border-gray-200"
          />
          <KpiCard
            label="Филиалов"
            value={String(totals.length || branchList.length)}
            sub={selectedBranch ? "выбран 1" : "в отчёте"}
            color="bg-white text-gray-900 border-gray-200"
          />
          <KpiCard
            label="Позиций"
            value={fmtQty(allRows.length)}
            sub="уникальных записей"
            color="bg-white text-gray-900 border-gray-200"
          />
        </div>
      )}

      {/* Main layout: chart + accordion */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : isEmpty ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <TrendingUp size={36} className="text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm font-medium">
            {dates.length === 0
              ? "Данные не загружены. Нажмите «Загрузить»."
              : "Нет данных по выбранным фильтрам."}
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* Left: branch chart (sticky on large screens) */}
          {totals.length > 0 && (
            <div className="w-full lg:w-72 flex-shrink-0 lg:sticky lg:top-4">
              <BranchChart
                totals={totals}
                selectedBranch={selectedBranch}
                onSelect={setSelectedBranch}
              />
            </div>
          )}

          {/* Right: search + accordion */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Search bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по наименованию..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="text-sm text-gray-400 ml-auto">
                {tree.length} категорий
              </div>
            </div>

            <CategoryAccordion
              tree={tree}
              allRows={allRows}
              bonusSummary={bonusSummary}
              bonusRows={bonusRows}
              search={search}
              onProductClick={setSelectedProduct}
            />
          </div>
        </div>
      )}

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          allRows={allRows}
          bonusRows={bonusRows}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
