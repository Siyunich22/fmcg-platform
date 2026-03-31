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
  ChevronRight, ChevronDown, X, Package, BarChart2,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────────────────────────
const ru = (n: number) =>
  n.toLocaleString("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt = (n: number) => ru(n) + " ₸";
const fmtQ = (n: number) => ru(n) + " шт";
const fmtM = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
};

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
      setMsg(`${res.rows.toLocaleString("ru")} строк · ${res.branches.join(", ")}`);
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
        : "border-gray-200 bg-white hover:border-blue-300"
    )}>
      <input {...getInputProps()} />
      {state === "loading" && <div className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin text-blue-500" />Обрабатываем...</div>}
      {state === "success" && <div className="flex items-center justify-center gap-2 text-sm text-green-700"><CheckCircle size={15} />Загружено: {msg}<button className="text-xs text-blue-600 underline ml-2" onClick={e => { e.stopPropagation(); setState("idle"); }}>Ещё</button></div>}
      {state === "error" && <div className="flex items-center justify-center gap-2 text-sm text-red-600"><XCircle size={15} />{msg}<button className="text-xs text-blue-600 underline ml-2" onClick={e => { e.stopPropagation(); setState("idle"); }}>Повторить</button></div>}
      {state === "idle" && <div className="flex items-center justify-center gap-2 text-sm text-gray-500"><Upload size={14} />{isDragActive ? "Отпустите" : "Загрузить отчёт продаж .xlsx"}</div>}
    </div>
  );
}

// ── Pivot tree ────────────────────────────────────────────────────────────────
interface Cell { qty: number; amount: number; }
interface PivotNode {
  id: string; label: string; level: 0 | 1 | 2;
  total: Cell; byBranch: Record<string, Cell>;
  children: PivotNode[];
  cat1: string; cat2: string | null; cat3: string | null;
}

function buildPivotTree(rows: SalesReportSummaryRow[]): PivotNode[] {
  const add = (cell: Cell, r: SalesReportSummaryRow) => { cell.qty += r.qty; cell.amount += r.amount; };
  const ensure = (map: Record<string, Cell>, k: string) => { if (!map[k]) map[k] = { qty: 0, amount: 0 }; return map[k]; };

  const m1 = new Map<string, { n: PivotNode; m2: Map<string, { n: PivotNode; m3: Map<string, PivotNode> }> }>();
  for (const r of rows) {
    const c1 = r.cat1 ?? "Прочее";
    const c2 = r.cat2; const c3 = r.cat3;
    if (!m1.has(c1)) m1.set(c1, { n: { id: c1, label: c1, level: 0, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: null, cat3: null }, m2: new Map() });
    const e1 = m1.get(c1)!; add(e1.n.total, r); add(ensure(e1.n.byBranch, r.branch_code), r);
    const k2 = c2 ?? "__";
    if (!e1.m2.has(k2)) e1.m2.set(k2, { n: { id: `${c1}|${k2}`, label: c2 ?? "—", level: 1, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: c2 ?? null, cat3: null }, m3: new Map() });
    const e2 = e1.m2.get(k2)!; add(e2.n.total, r); add(ensure(e2.n.byBranch, r.branch_code), r);
    if (c3) {
      if (!e2.m3.has(c3)) e2.m3.set(c3, { id: `${c1}|${k2}|${c3}`, label: c3, level: 2, total: { qty: 0, amount: 0 }, byBranch: {}, children: [], cat1: c1, cat2: c2 ?? null, cat3: c3 });
      const n3 = e2.m3.get(c3)!; add(n3.total, r); add(ensure(n3.byBranch, r.branch_code), r);
    }
  }
  for (const [, e1] of m1) {
    for (const [, e2] of e1.m2) {
      e2.n.children = [...e2.m3.values()].sort((a, b) => b.total.amount - a.total.amount);
      e1.n.children.push(e2.n);
    }
    e1.n.children.sort((a, b) => b.total.amount - a.total.amount);
  }
  return [...m1.values()].map(e => e.n).sort((a, b) => b.total.amount - a.total.amount);
}

// ── Product detail modal ──────────────────────────────────────────────────────
function ProductModal({ product, allRows, bonusRows, onClose }: {
  product: SalesReportRow; allRows: SalesReportRow[]; bonusRows: SalesReportRow[]; onClose: () => void;
}) {
  const byBranch = useMemo(() =>
    allRows.filter(r => r.code === product.code && !r.is_bonus).sort((a, b) => b.amount - a.amount),
    [allRows, product.code]);
  const bonuses = useMemo(() =>
    bonusRows.filter(r => r.cat1 === product.cat1).sort((a, b) => b.qty - a.qty).slice(0, 25),
    [bonusRows, product.cat1]);
  const max = byBranch[0]?.amount ?? 1;
  const total = byBranch.reduce((s, r) => s + r.amount, 0);
  const qty = byBranch.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-gray-400">{product.code}</div>
            <div className="text-sm font-bold text-gray-900">{product.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{[product.cat1, product.cat2, product.cat3].filter(Boolean).join(" › ")}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 flex-shrink-0">
          <div><div className="text-[10px] text-gray-400 uppercase">Итого</div><div className="text-base font-black">{fmt(total)}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Кол-во</div><div className="text-base font-black">{fmtQ(qty)}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Филиалов</div><div className="text-base font-black">{byBranch.length}</div></div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">По филиалам</div>
            {byBranch.length === 0
              ? <div className="text-sm text-gray-400 text-center py-3">Нет данных</div>
              : <div className="space-y-2.5">{byBranch.map((r, i) => {
                const pct = max > 0 ? (r.amount / max) * 100 : 0;
                const share = total > 0 ? (r.amount / total * 100).toFixed(0) : "0";
                return (
                  <div key={r.branch_code}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700 w-20 flex-shrink-0">{r.branch_name}</span>
                      <span className="text-[11px] text-gray-400">{fmtQ(r.qty)}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">{share}%</span>
                      <span className="text-xs font-bold text-gray-800 w-28 text-right">{fmt(r.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", i === 0 ? "bg-blue-500" : i === 1 ? "bg-blue-400" : "bg-blue-300")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}</div>}
          </div>
          {bonuses.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-2">Бонусы в «{product.cat1}»</div>
              <div className="space-y-0.5">{bonuses.map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1 border-b border-amber-50">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                  <span className="text-xs text-gray-700 flex-1 truncate">{r.name}</span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5">{r.branch_name}</span>
                  <span className="text-[11px] font-mono text-gray-500 w-14 text-right">{fmtQ(r.qty)}</span>
                </div>
              ))}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cell ──────────────────────────────────────────────────────────────────────
function PivotCell({ cell, rowTotal, colTotal, highlight }: {
  cell: Cell | undefined; rowTotal: number; colTotal: number; highlight?: boolean;
}) {
  if (!cell || cell.amount === 0) return <span className="text-gray-200 text-xs">—</span>;
  const rowShare = rowTotal > 0 ? (cell.amount / rowTotal) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className={cn("text-xs font-bold tabular-nums", highlight ? "text-blue-700" : "text-gray-800")}>
        {fmtM(cell.amount)} ₸
      </div>
      <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(cell.qty)}</div>
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", highlight ? "bg-blue-500" : "bg-blue-300")}
            style={{ width: `${Math.min(rowShare, 100)}%` }}
          />
        </div>
        <span className="text-[9px] text-gray-400 w-7 text-right tabular-nums">{rowShare.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ── Pivot table ───────────────────────────────────────────────────────────────
interface BranchInfo { code: string; name: string; }

function PivotTable({
  tree, branches, branchTotals, allRows, bonusRows,
  bonusSummary, onProductClick,
}: {
  tree: PivotNode[];
  branches: BranchInfo[];
  branchTotals: Record<string, Cell>;
  allRows: SalesReportRow[];
  bonusRows: SalesReportRow[];
  bonusSummary: SalesReportSummaryRow[];
  onProductClick: (r: SalesReportRow) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Flatten visible rows
  function flatten(nodes: PivotNode[], out: PivotNode[] = []) {
    for (const n of nodes) {
      out.push(n);
      if (open.has(n.id) && n.children.length) flatten(n.children, out);
    }
    return out;
  }
  const visibleRows = useMemo(() => flatten(tree), [tree, open]);

  const grandTotal: Cell = useMemo(() => ({
    qty: tree.reduce((s, n) => s + n.total.qty, 0),
    amount: tree.reduce((s, n) => s + n.total.amount, 0),
  }), [tree]);

  // Bonus totals
  const bonusTotal = useMemo(() => ({
    qty: bonusSummary.reduce((s, r) => s + r.qty, 0),
    amount: bonusSummary.reduce((s, r) => s + r.amount, 0),
  }), [bonusSummary]);
  const bonusByBranch = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const r of bonusSummary) {
      if (!m[r.branch_code]) m[r.branch_code] = { qty: 0, amount: 0 };
      m[r.branch_code].qty += r.qty;
      m[r.branch_code].amount += r.amount;
    }
    return m;
  }, [bonusSummary]);

  const COL_W = 136;
  const LEFT_W = 220;

  // Products grouped by cat3 for expanded leaf display
  const [openLeaf, setOpenLeaf] = useState<Set<string>>(new Set());
  const toggleLeaf = (id: string) => setOpenLeaf(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function getLeafProducts(node: PivotNode): SalesReportRow[] {
    // Unique products by code, summed across branches
    const map = new Map<string, SalesReportRow>();
    for (const r of allRows) {
      if (r.cat1 !== node.cat1) continue;
      if (node.cat2 !== null && r.cat2 !== node.cat2) continue;
      if (node.cat3 !== null && r.cat3 !== node.cat3) continue;
      if (!r.is_bonus) {
        const key = r.code || r.name;
        if (!map.has(key)) map.set(key, { ...r });
        else {
          const existing = map.get(key)!;
          map.set(key, { ...existing, qty: existing.qty + r.qty, amount: existing.amount + r.amount });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  const thCls = "px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-gray-50";
  const tdCls = "px-3 py-2.5 text-center border-b border-gray-100 align-top";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table style={{ minWidth: LEFT_W + (branches.length + 1) * COL_W + "px" }}>
          <colgroup>
            <col style={{ width: LEFT_W }} />
            <col style={{ width: COL_W }} />
            {branches.map(b => <col key={b.code} style={{ width: COL_W }} />)}
          </colgroup>
          <thead>
            {/* Column headers */}
            <tr>
              <th className={cn(thCls, "text-left sticky left-0 z-10")} style={{ minWidth: LEFT_W }}>
                Категория / Продукт
              </th>
              <th className={thCls}>Итого</th>
              {branches.map(b => (
                <th key={b.code} className={thCls}>
                  <div>{b.name}</div>
                </th>
              ))}
            </tr>
            {/* Grand total row */}
            <tr className="bg-blue-600 text-white">
              <td className="px-3 py-2.5 text-sm font-bold sticky left-0 z-10 bg-blue-600" style={{ minWidth: LEFT_W }}>
                Все продажи
              </td>
              <td className="px-3 py-2.5 text-center">
                <div className="text-sm font-black text-white">{fmt(grandTotal.amount)}</div>
                <div className="text-[11px] text-blue-200">{fmtQ(grandTotal.qty)}</div>
              </td>
              {branches.map(b => {
                const c = branchTotals[b.code];
                const share = grandTotal.amount > 0 && c ? (c.amount / grandTotal.amount * 100).toFixed(0) : "0";
                return (
                  <td key={b.code} className="px-3 py-2.5 text-center">
                    {c ? (
                      <>
                        <div className="text-sm font-bold text-white">{fmtM(c.amount)} ₸</div>
                        <div className="text-[10px] text-blue-200">{fmtQ(c.qty)}</div>
                        <div className="text-[10px] text-blue-300 font-semibold">{share}%</div>
                      </>
                    ) : <span className="text-blue-300 text-xs">—</span>}
                  </td>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map(row => {
              const hasChildren = row.children.length > 0;
              const isOpen = open.has(row.id);
              const isLeafOpen = openLeaf.has(row.id);
              const indent = row.level * 20 + 12;
              const products = (!hasChildren && isLeafOpen) ? getLeafProducts(row) : [];

              return (
                <>
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-gray-50/70 transition-colors",
                      row.level === 0 ? "border-t-2 border-gray-200" : ""
                    )}
                  >
                    {/* Category name cell */}
                    <td
                      className={cn(
                        "px-0 py-0 sticky left-0 z-10 border-b border-gray-100",
                        row.level === 0 ? "bg-white" : row.level === 1 ? "bg-gray-50/80" : "bg-white"
                      )}
                      style={{ minWidth: LEFT_W }}
                    >
                      <button
                        className="w-full text-left flex items-center gap-1.5 py-2.5"
                        style={{ paddingLeft: indent }}
                        onClick={() => hasChildren ? toggle(row.id) : toggleLeaf(row.id)}
                      >
                        <span className="flex-shrink-0 text-gray-400">
                          {hasChildren
                            ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                            : (isLeafOpen ? <ChevronDown size={12} className="text-blue-400" /> : <ChevronRight size={12} className="text-blue-300" />)
                          }
                        </span>
                        <span className={cn(
                          "truncate",
                          row.level === 0 ? "text-sm font-bold text-gray-900" :
                          row.level === 1 ? "text-xs font-semibold text-gray-700" :
                          "text-xs font-medium text-gray-600"
                        )}>
                          {row.label}
                        </span>
                      </button>
                    </td>

                    {/* Total cell */}
                    <td className={tdCls}>
                      <div className={cn("text-xs font-bold tabular-nums", row.level === 0 ? "text-gray-900" : "text-gray-700")}>
                        {fmtM(row.total.amount)} ₸
                      </div>
                      <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(row.total.qty)}</div>
                    </td>

                    {/* Per-branch cells */}
                    {branches.map(b => (
                      <td key={b.code} className={tdCls}>
                        <PivotCell
                          cell={row.byBranch[b.code]}
                          rowTotal={row.total.amount}
                          colTotal={branchTotals[b.code]?.amount ?? 0}
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Leaf products */}
                  {!hasChildren && isLeafOpen && products.map((product, pi) => (
                    <tr
                      key={`${row.id}_prod_${product.code}`}
                      className={cn(
                        "hover:bg-blue-50/40 transition-colors",
                        pi % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      )}
                    >
                      <td className={cn("sticky left-0 z-10 bg-inherit border-b border-gray-50 py-1.5")} style={{ paddingLeft: indent + 24 }}>
                        <button
                          className="flex items-center gap-1.5 text-left group"
                          onClick={() => onProductClick(product)}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-200 flex-shrink-0 group-hover:bg-blue-500" />
                          <span className="text-xs text-gray-600 group-hover:text-blue-700 truncate max-w-[160px]">{product.name}</span>
                          <span className="text-[9px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">↗</span>
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-center border-b border-gray-50">
                        <div className="text-[11px] font-semibold text-gray-700 tabular-nums">{fmtM(product.amount)} ₸</div>
                        <div className="text-[10px] text-gray-400 tabular-nums">{fmtQ(product.qty)}</div>
                      </td>
                      {branches.map(b => {
                        const bRows = allRows.filter(r => r.code === product.code && r.branch_code === b.code && !r.is_bonus);
                        const amt = bRows.reduce((s, r) => s + r.amount, 0);
                        const qty = bRows.reduce((s, r) => s + r.qty, 0);
                        return (
                          <td key={b.code} className="px-3 py-1.5 text-center border-b border-gray-50">
                            {amt > 0
                              ? <><div className="text-[11px] font-semibold text-gray-700 tabular-nums">{fmtM(amt)} ₸</div><div className="text-[10px] text-gray-400">{fmtQ(qty)}</div></>
                              : <span className="text-gray-200 text-xs">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}

            {/* Bonuses row */}
            {bonusTotal.amount > 0 && (
              <tr className="bg-amber-50/40 border-t-2 border-amber-100">
                <td className="sticky left-0 z-10 bg-amber-50 border-b border-amber-100 px-3 py-2.5" style={{ minWidth: LEFT_W }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">БОНУСЫ</span>
                    <span className="text-[10px] text-amber-500 bg-amber-100 rounded px-1.5 py-0.5 font-semibold">бесплатная отгрузка</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center border-b border-amber-100">
                  <div className="text-xs font-bold text-amber-700 tabular-nums">{fmtM(bonusTotal.amount)} ₸</div>
                  <div className="text-[10px] text-amber-500 tabular-nums">{fmtQ(bonusTotal.qty)}</div>
                </td>
                {branches.map(b => {
                  const c = bonusByBranch[b.code];
                  return (
                    <td key={b.code} className="px-3 py-2.5 text-center border-b border-amber-100">
                      {c && c.amount > 0
                        ? <><div className="text-xs font-bold text-amber-600 tabular-nums">{fmtM(c.amount)} ₸</div><div className="text-[10px] text-amber-400 tabular-nums">{fmtQ(c.qty)}</div></>
                        : <span className="text-amber-200 text-xs">—</span>}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TMZ остатки ───────────────────────────────────────────────────────────────
function TmzRow({ tmzSummary, branches }: {
  tmzSummary: { branch_code: string; branch_name: string; total_amount: number; total_qty: number; sku_count: number }[];
  branches: BranchInfo[];
}) {
  const total = tmzSummary.reduce((s, r) => s + r.total_amount, 0);
  if (total === 0) return null;
  const byCode = Object.fromEntries(tmzSummary.map(r => [r.branch_code, r]));

  return (
    <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table style={{ minWidth: 220 + (branches.length + 1) * 136 + "px" }}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 136 }} />
            {branches.map(b => <col key={b.code} style={{ width: 136 }} />)}
          </colgroup>
          <tbody>
            <tr className="bg-emerald-600 text-white">
              <td className="sticky left-0 z-10 bg-emerald-600 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Package size={14} />
                  <span className="text-sm font-bold">ТМЗ — остатки склада</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-center">
                <div className="text-sm font-black">{fmt(total)}</div>
                <div className="text-[11px] text-emerald-200">{fmtQ(tmzSummary.reduce((s, r) => s + r.total_qty, 0))}</div>
              </td>
              {branches.map(b => {
                const r = byCode[b.code];
                return (
                  <td key={b.code} className="px-3 py-2.5 text-center">
                    {r
                      ? <><div className="text-sm font-bold">{fmtM(r.total_amount)} ₸</div><div className="text-[10px] text-emerald-200">{fmtQ(r.total_qty)}</div><div className="text-[10px] text-emerald-300">{r.sku_count} SKU</div></>
                      : <span className="text-emerald-300 text-xs">—</span>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { data: dates = [] } = useSalesReportDates();
  const { data: branchList = [] } = useSalesReportBranches();
  const [selectedDate, setSelectedDate] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SalesReportRow | null>(null);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const p = { period_date: selectedDate || undefined };

  const { data: summary = [], isLoading } = useSalesReportSummary({ ...p, is_bonus: false });
  const { data: bonusSummary = [] } = useSalesReportSummary({ ...p, is_bonus: true });
  const { data: totals = [] } = useSalesReportTotals(p);
  const { data: allRows = [] } = useSalesReportRows({ ...p, is_bonus: false });
  const { data: bonusRows = [] } = useSalesReportRows({ ...p, is_bonus: true });
  const { data: tmzSummary = [] } = useTmzSummary(
    selectedDate ? selectedDate.substring(0, 7) + "-31" : undefined
  );

  const tree = useMemo(() => buildPivotTree(summary), [summary]);

  const branchTotals = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const t of totals) m[t.branch_code] = { qty: t.qty, amount: t.amount };
    return m;
  }, [totals]);

  const grandTotal = totals.reduce((s, t) => s + t.amount, 0);
  const grandQty = totals.reduce((s, t) => s + t.qty, 0);
  const topCat = tree[0]?.label ?? "—";
  const isEmpty = !isLoading && summary.length === 0;

  // Sort branches by total amount desc
  const orderedBranches = useMemo(() =>
    [...branchList].sort((a, b) => (branchTotals[b.code]?.amount ?? 0) - (branchTotals[a.code]?.amount ?? 0)),
    [branchList, branchTotals]);

  return (
    <div className="space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Продажи</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={() => setShowUpload(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              showUpload ? "bg-gray-200 text-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Upload size={14} />Загрузить
          </button>
        </div>
      </div>

      {showUpload && <UploadBlock onDone={() => setShowUpload(false)} />}

      {/* KPI strip */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-600 text-white rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-200">Реализация</div>
            <div className="text-lg font-black">{fmt(grandTotal)}</div>
            <div className="text-[11px] text-blue-200">{fmtQ(grandQty)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Топ категория</div>
            <div className="text-sm font-black text-gray-900 truncate">{topCat}</div>
            <div className="text-[11px] text-gray-400">{tree[0] ? fmtM(tree[0].total.amount) + " ₸" : ""}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Категорий</div>
            <div className="text-lg font-black text-gray-900">{tree.length}</div>
            <div className="text-[11px] text-gray-400">{orderedBranches.length} филиалов</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Позиций</div>
            <div className="text-lg font-black text-gray-900">
              {(() => { const s = new Set(allRows.map(r => r.code || r.name)); return s.size.toLocaleString("ru"); })()}
            </div>
            <div className="text-[11px] text-gray-400">уникальных SKU</div>
          </div>
        </div>
      )}

      {/* Hint */}
      {!isEmpty && (
        <p className="text-xs text-gray-400">
          Нажмите на категорию, чтобы раскрыть подкатегории. Листовая категория раскроет список товаров — кликните на товар для детального просмотра по филиалам.
        </p>
      )}

      {/* Main content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : isEmpty ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <TrendingUp size={36} className="text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm font-medium">
            {dates.length === 0 ? "Данные не загружены. Нажмите «Загрузить»." : "Нет данных по выбранному периоду."}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <PivotTable
            tree={tree}
            branches={orderedBranches}
            branchTotals={branchTotals}
            allRows={allRows}
            bonusRows={bonusRows}
            bonusSummary={bonusSummary}
            onProductClick={setSelectedProduct}
          />
          <TmzRow tmzSummary={tmzSummary} branches={orderedBranches} />
        </div>
      )}

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
