import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Printer, ArrowLeft, Edit2,
  CheckCircle, AlertCircle, X, Save,
} from "lucide-react";
import {
  getNextObNo, listOrderBills, getOrderBill,
  createOrderBill, updateOrderBill, deleteOrderBill,
} from "../api/orderBillApiService";
import { getObRates } from "../api/obRateService";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_METALS     = ["Gold 24K", "Gold 22K", "Silver"];
const CUSTOMER_TYPES = ["Retail", "Showroom", "Wholesale"];

const METAL_COLORS = {
  "Gold 24K": { bg: "bg-amber-50",  border: "border-amber-300", text: "text-amber-800",  badge: "bg-amber-100 text-amber-800"  },
  "Gold 22K": { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-800" },
  "Silver":   { bg: "bg-slate-50",  border: "border-slate-300", text: "text-slate-700",  badge: "bg-slate-100 text-slate-600"  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt    = (n, d = 3) => Number(n || 0).toFixed(d);
const fmtINR = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Parse products JSON stored in DB (backward compat for legacy bills)
const parseProducts = (raw) => {
  if (Array.isArray(raw)) return raw.length ? raw : ["Gold 24K"];
  if (!raw) return ["Gold 24K"];
  try { const a = JSON.parse(raw); return Array.isArray(a) && a.length ? a : ["Gold 24K"]; }
  catch { return ["Gold 24K"]; }
};

// Get LC per piece from a rate row given customer type
const getLcPpFromRow = (rateRow, customerType) => {
  if (!rateRow) return 0;
  switch (customerType) {
    case "Retail":    return rateRow.lc_pp_retail    || 0;
    case "Showroom":  return rateRow.lc_pp_showroom  || 0;
    case "Wholesale": return rateRow.lc_pp_wholesale || 0;
    default:          return 0;
  }
};

// Convenience: look up a rate row from the loaded obRates array
const findRateRow = (obRates, metalType, sizeLabel) =>
  obRates.find((r) => r.metal_type === metalType && r.size_label === sizeLabel) || null;

// Build item rows for a single metal from obRates
const makeItemsForMetal = (obRates, metalType, customerType) => {
  const metalRates = obRates
    .filter((r) => r.metal_type === metalType)
    .sort((a, b) => a.sort_order - b.sort_order);

  return metalRates.map((r, i) => ({
    metal_type:     metalType,
    size_label:     r.size_label,
    // size_value: null → user must enter (Silver, custom Gold); otherwise fixed
    size_value:     r.size_value != null ? r.size_value : "",
    pcs:            "",
    lc_pp:          getLcPpFromRow(r, customerType).toString(),
    is_custom:      !!r.is_custom,
    has_fixed_size: r.size_value != null && !r.is_custom,
    sort_order:     i,
  }));
};

// Build all items for all selected metals
const makeItemsForProducts = (obRates, selectedProducts, customerType) =>
  selectedProducts.flatMap((metal) => makeItemsForMetal(obRates, metal, customerType));

// Compute derived fields for a single row
const computeRow = (item) => {
  const pcs    = parseInt(item.pcs)        || 0;
  const sv     = parseFloat(item.size_value) || 0;
  const weight = parseFloat((sv * pcs).toFixed(4));
  const lc_pp  = parseFloat(item.lc_pp)    || 0;
  const t_lc   = parseFloat((lc_pp * pcs).toFixed(2));
  return { pcs, sv, weight, t_lc };
};

// Compute all summary totals (labour always included in subtotal for all customer types)
const computeSummary = (items, fineJama, rate10g, amtJama) => {
  let total_pcs    = 0;
  let total_weight = 0;
  let labour_total = 0;

  (items || []).forEach((item) => {
    const { pcs, weight, t_lc } = computeRow(item);
    total_pcs    += pcs;
    total_weight  = parseFloat((total_weight + weight).toFixed(4));
    labour_total  = parseFloat((labour_total + t_lc).toFixed(2));
  });

  const fj  = parseFloat(fineJama) || 0;
  const r10 = parseFloat(rate10g)  || 0;
  const aj  = parseFloat(amtJama)  || 0;

  const fine_diff = parseFloat((total_weight - fj).toFixed(4));
  const gold_rs   = Math.round((fine_diff * r10 / 10) / 10) * 10;
  const subtotal  = parseFloat((labour_total + gold_rs).toFixed(2));
  const amt_baki  = parseFloat((subtotal - aj).toFixed(2));

  let ofg_status, fine_carry;
  if (gold_rs <= 0 && fine_diff > 0) {
    ofg_status = "OF.G AFSL";
    fine_carry = parseFloat(fine_diff.toFixed(4));
  } else {
    ofg_status = "OF.G HDF";
    fine_carry = 0;
  }

  return { total_pcs, total_weight, labour_total, fine_diff, gold_rs, subtotal, amt_baki, ofg_status, fine_carry };
};

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast.show) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast.show, onClose]);

  if (!toast.show) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold transition-all ${
      toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
    }`}>
      {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.message}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
};

// ─── Customer Type Badge ──────────────────────────────────────────────────────

const CTypeBadge = ({ type, size = "sm" }) => {
  const cls =
    type === "Wholesale" ? "bg-blue-100 text-blue-700" :
    type === "Showroom"  ? "bg-purple-100 text-purple-700" :
                           "bg-slate-100 text-slate-600";
  return (
    <span className={`font-black rounded-full px-2.5 py-0.5 ${size === "xs" ? "text-[10px]" : "text-xs"} ${cls}`}>
      {type || "Retail"}
    </span>
  );
};

// ─── Metal Badge ──────────────────────────────────────────────────────────────

const MetalBadge = ({ metal }) => {
  const c = METAL_COLORS[metal] || METAL_COLORS["Silver"];
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.badge}`}>{metal}</span>
  );
};

// ─── Items Table (shared by Form + Print) ─────────────────────────────────────

const ItemsTable = ({ items, selectedProducts, showLabour, onUpdate, readonly = false }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/80 text-xs border-b border-slate-200">
            <th className="text-left px-3 py-2 font-black text-slate-500 w-28">SIZE</th>
            <th className="text-center px-3 py-2 font-black text-slate-500 w-20">PCS</th>
            <th className="text-right px-3 py-2 font-black text-slate-500 w-24">WEIGHT (g)</th>
            {showLabour && <th className="text-right px-3 py-2 font-black text-slate-500 w-28">LC P.P (₹)</th>}
            {showLabour && <th className="text-right px-3 py-2 font-black text-slate-500 w-24">T. LC (₹)</th>}
          </tr>
        </thead>
        <tbody>
          {selectedProducts.map((metal) => {
            const metalItems = items.filter((i) => i.metal_type === metal);
            if (!metalItems.length) return null;
            const mc = METAL_COLORS[metal] || METAL_COLORS["Silver"];
            return (
              <React.Fragment key={metal}>
                {/* Metal group header row */}
                <tr className={`${mc.bg} border-b ${mc.border}`}>
                  <td colSpan={showLabour ? 5 : 3} className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider ${mc.text}`}>
                    {metal}
                  </td>
                </tr>
                {metalItems.map((item) => {
                  const { pcs, weight, t_lc } = computeRow(item);
                  const hasValue = pcs > 0;
                  return (
                    <tr key={`${metal}-${item.sort_order}`}
                      className={`border-b border-slate-100 transition-colors ${hasValue ? `${mc.bg}/50` : "hover:bg-slate-50/60"}`}>

                      {/* SIZE */}
                      <td className="px-3 py-2">
                        {!readonly && item.is_custom ? (
                          <div className="space-y-1">
                            <input type="text" value={item.size_label}
                              onChange={(e) => onUpdate(metal, item.sort_order, "size_label", e.target.value)}
                              placeholder="Label"
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            <input type="number" min="0" step="0.001" value={item.size_value}
                              onChange={(e) => onUpdate(metal, item.sort_order, "size_value", e.target.value)}
                              placeholder="g/pc"
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                          </div>
                        ) : !readonly && !item.has_fixed_size ? (
                          // Fixed label but user enters size (e.g. Silver items)
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-700">{item.size_label}</span>
                            <input type="number" min="0" step="0.001" value={item.size_value}
                              onChange={(e) => onUpdate(metal, item.sort_order, "size_value", e.target.value)}
                              placeholder="g/pc"
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                          </div>
                        ) : (
                          <span className="font-bold text-slate-700">{item.size_label}</span>
                        )}
                      </td>

                      {/* PCS */}
                      <td className="px-3 py-2 text-center">
                        {readonly ? (
                          <span>{pcs || "—"}</span>
                        ) : (
                          <input type="number" min="0" step="1" value={item.pcs}
                            onChange={(e) => onUpdate(metal, item.sort_order, "pcs", e.target.value)}
                            className={`w-16 text-center text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 ${
                              hasValue
                                ? `${mc.border} ${mc.bg} focus:ring-amber-200 font-bold ${mc.text}`
                                : "border-slate-200 focus:ring-indigo-300"
                            }`} />
                        )}
                      </td>

                      {/* WEIGHT */}
                      <td className="px-3 py-2 text-right font-mono text-slate-700 text-xs">
                        {hasValue
                          ? <span className="font-semibold">{fmt(weight, 3)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* LC P.P */}
                      {showLabour && (
                        <td className="px-3 py-2 text-right">
                          {readonly ? (
                            <span className="font-mono text-xs">{fmt(item.lc_pp, 0)}</span>
                          ) : (
                            <input type="number" min="0" step="1" value={item.lc_pp}
                              onChange={(e) => onUpdate(metal, item.sort_order, "lc_pp", e.target.value)}
                              className="w-24 text-right text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          )}
                        </td>
                      )}

                      {/* T. LC */}
                      {showLabour && (
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {hasValue
                            ? <span className="font-semibold text-slate-700">{fmt(t_lc, 0)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Print View ───────────────────────────────────────────────────────────────

const PrintView = ({ bill, onClose }) => {
  useEffect(() => { setTimeout(() => window.print(), 200); }, []);

  const showLabour  = bill.customer_type !== "Retail";
  const products    = parseProducts(bill.products);
  const allItems    = bill.items || [];
  const summary     = computeSummary(allItems, bill.fine_jama, bill.rate_10g, bill.amt_jama);

  return (
    <div className="min-h-screen bg-white p-8 print:p-4">
      <div className="max-w-2xl mx-auto">
        {/* Screen-only controls */}
        <div className="flex justify-between items-start mb-6 print:hidden">
          <button onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg bg-slate-100 hover:bg-indigo-50 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors">
            <Printer size={16} /> Print
          </button>
        </div>

        {/* Bill Header */}
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-xl font-black text-slate-900 tracking-tight">ORDER BOOK (OB)</h1>
          <p className="text-xs text-slate-500">Jewellery Order Bill</p>
        </div>

        <div className="flex justify-between text-sm mb-3">
          <div className="space-y-0.5">
            <p><span className="font-bold text-slate-600">OB No.:</span> <span className="font-black">{bill.ob_no}</span></p>
            <p><span className="font-bold text-slate-600">Date:</span> {bill.date}</p>
            {bill.product && <p><span className="font-bold text-slate-600">Product:</span> {bill.product}</p>}
            <p><span className="font-bold text-slate-600">Metal:</span> {products.join(", ")}</p>
            <p><span className="font-bold text-slate-600">Customer Type:</span> <CTypeBadge type={bill.customer_type} size="xs" /></p>
          </div>
          <div className="text-right space-y-0.5">
            <p className="font-bold text-slate-800 text-base">{bill.customer_name || "—"}</p>
            {bill.customer_city  && <p className="text-slate-600">{bill.customer_city}</p>}
            {bill.customer_phone && <p className="text-slate-600">{bill.customer_phone}</p>}
          </div>
        </div>

        {/* Items — grouped by metal */}
        {allItems.length > 0 ? (
          <table className="w-full text-xs border border-slate-300 mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1.5 text-left font-black">SIZE</th>
                <th className="border border-slate-300 px-2 py-1.5 text-center font-black">PCS</th>
                <th className="border border-slate-300 px-2 py-1.5 text-right font-black">WEIGHT (g)</th>
                {showLabour && <th className="border border-slate-300 px-2 py-1.5 text-right font-black">LC P.P (₹)</th>}
                {showLabour && <th className="border border-slate-300 px-2 py-1.5 text-right font-black">T. LC (₹)</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((metal) => {
                const metalItems = allItems.filter((i) =>
                  (i.metal_type || "Gold 24K") === metal && (parseInt(i.pcs) || 0) > 0
                );
                if (!metalItems.length) return null;
                return (
                  <React.Fragment key={metal}>
                    <tr className="bg-slate-50">
                      <td colSpan={showLabour ? 5 : 3}
                        className="border border-slate-300 px-2 py-1 font-black text-[10px] uppercase tracking-wider text-slate-600">
                        {metal}
                      </td>
                    </tr>
                    {metalItems.map((item, i) => {
                      const { pcs, weight, t_lc } = computeRow(item);
                      return (
                        <tr key={i}>
                          <td className="border border-slate-200 px-2 py-1 font-semibold">{item.size_label}</td>
                          <td className="border border-slate-200 px-2 py-1 text-center">{pcs}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono">{fmt(weight, 3)}</td>
                          {showLabour && <td className="border border-slate-200 px-2 py-1 text-right font-mono">{fmt(item.lc_pp, 0)}</td>}
                          {showLabour && <td className="border border-slate-200 px-2 py-1 text-right font-mono">{fmt(t_lc, 0)}</td>}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black">
                <td className="border border-slate-300 px-2 py-1.5">TOTAL</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{summary.total_pcs}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{fmt(summary.total_weight, 3)}</td>
                {showLabour && <td className="border border-slate-300 px-2 py-1.5" />}
                {showLabour && <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{fmt(summary.labour_total, 0)}</td>}
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-center text-slate-400 text-xs py-4">No items on this bill.</p>
        )}

        {/* Fine Gold + Payment Summary */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="border border-slate-300 rounded p-3">
            <p className="font-black text-slate-700 text-xs uppercase tracking-wider mb-2">Fine Gold</p>
            <table className="w-full">
              <tbody>
                <tr><td className="py-0.5 text-slate-600">T. Weight</td><td className="text-right font-mono font-semibold">{fmt(summary.total_weight, 3)}g</td></tr>
                <tr><td className="py-0.5 text-slate-600">F. JAMA</td><td className="text-right font-mono font-semibold">{fmt(bill.fine_jama, 3)}g</td></tr>
                <tr className="border-t border-slate-200">
                  <td className="py-1 font-bold">FINE +/-</td>
                  <td className={`text-right font-black font-mono ${summary.fine_diff > 0 ? "text-orange-600" : summary.fine_diff < 0 ? "text-green-600" : "text-slate-700"}`}>
                    {summary.fine_diff > 0 ? "+" : ""}{fmt(summary.fine_diff, 3)}g
                  </td>
                </tr>
                <tr><td className="py-0.5 text-slate-600">10g Rate</td><td className="text-right font-mono">₹{fmt(bill.rate_10g, 0)}</td></tr>
                <tr><td className="py-0.5 font-bold">Gold ₹</td><td className="text-right font-black font-mono">{fmtINR(summary.gold_rs)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="border border-slate-300 rounded p-3">
            <p className="font-black text-slate-700 text-xs uppercase tracking-wider mb-2">Payment</p>
            <table className="w-full">
              <tbody>
                {showLabour && <tr><td className="py-0.5 text-slate-600">Labour Total</td><td className="text-right font-mono font-semibold">{fmtINR(summary.labour_total)}</td></tr>}
                <tr><td className="py-0.5 text-slate-600">Gold ₹</td><td className="text-right font-mono font-semibold">{fmtINR(summary.gold_rs)}</td></tr>
                <tr className="border-t border-slate-200">
                  <td className="py-1 font-bold">Subtotal</td>
                  <td className="text-right font-black font-mono">{fmtINR(summary.subtotal)}</td>
                </tr>
                <tr><td className="py-0.5 text-slate-600">AMT JAMA</td><td className="text-right font-mono font-semibold">{fmtINR(bill.amt_jama)}</td></tr>
                <tr className={`border-t-2 border-slate-400 ${summary.amt_baki > 0 ? "text-red-700" : "text-green-700"}`}>
                  <td className="py-1 font-black text-sm">AMT BAKI</td>
                  <td className="text-right font-black font-mono text-sm">{fmtINR(summary.amt_baki)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Gold Carry Forward */}
        <div className={`mt-3 px-4 py-2.5 rounded border text-xs font-bold flex items-center justify-between ${
          summary.ofg_status === "OF.G AFSL"
            ? "bg-orange-50 border-orange-300 text-orange-800"
            : "bg-green-50 border-green-200 text-green-800"
        }`}>
          <span>{summary.ofg_status}</span>
          {summary.ofg_status === "OF.G AFSL" && (
            <span>Fine JAMA: {fmt(summary.fine_carry, 3)}g</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderBills() {
  const [view,             setView]             = useState("list");
  const [bills,            setBills]            = useState([]);
  const [obRates,          setObRates]          = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [toast,            setToast]            = useState({ show: false, message: "", type: "success" });
  const [deleteConfirm,    setDeleteConfirm]    = useState(null);
  const [editBill,         setEditBill]         = useState(null);
  const [printBill,        setPrintBill]        = useState(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [obNo,             setObNo]             = useState(1);
  const [formDate,         setFormDate]         = useState(new Date().toISOString().split("T")[0]);
  const [product,          setProduct]          = useState("");
  const [selectedProducts, setSelectedProducts] = useState(["Gold 24K"]);
  const [customerName,     setCustomerName]     = useState("");
  const [customerCity,     setCustomerCity]     = useState("");
  const [customerPhone,    setCustomerPhone]    = useState("");
  const [customerType,     setCustomerType]     = useState("Retail");
  const [items,            setItems]            = useState([]);
  const [fineJama,         setFineJama]         = useState("");
  const [rate10g,          setRate10g]          = useState("");
  const [amtJama,          setAmtJama]          = useState("");

  // Labour is always calculated; only visibility changes for Retail
  const showLabour = customerType !== "Retail";

  // ── Real-time summary ─────────────────────────────────────────────────────
  const summary = useMemo(
    () => computeSummary(items, fineJama, rate10g, amtJama),
    [items, fineJama, rate10g, amtJama]
  );

  const showToast = useCallback((message, type = "success") =>
    setToast({ show: true, message, type }), []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadBills = useCallback(async () => {
    setLoading(true);
    try { setBills(await listOrderBills()); }
    catch { showToast("Failed to load order bills", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  const loadRates = useCallback(async () => {
    try { setObRates(await getObRates()); }
    catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadBills(); loadRates(); }, [loadBills, loadRates]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(async (rates) => {
    const resp = await getNextObNo().catch(() => ({ ob_no: 1 }));
    setObNo(resp.ob_no ?? resp);
    setFormDate(new Date().toISOString().split("T")[0]);
    setProduct("");
    const prods = ["Gold 24K"];
    setSelectedProducts(prods);
    setCustomerName("");
    setCustomerCity("");
    setCustomerPhone("");
    const ct = "Retail";
    setCustomerType(ct);
    setItems(makeItemsForProducts(rates, prods, ct));
    setFineJama("");
    setRate10g("");
    setAmtJama("");
  }, []);

  const openNew = useCallback(async () => {
    setEditBill(null);
    let rates = obRates;
    if (!rates.length) {
      try { rates = await getObRates(); setObRates(rates); } catch { /* ok */ }
    }
    await resetForm(rates);
    setView("form");
  }, [obRates, resetForm]);

  const openEdit = useCallback(async (bill) => {
    setLoading(true);
    try {
      // Ensure rates are loaded first
      let rates = obRates;
      if (!rates.length) {
        try { rates = await getObRates(); setObRates(rates); } catch { /* ok */ }
      }

      const full = await getOrderBill(bill.id);
      const prods = parseProducts(full.products);

      setEditBill(full);
      setObNo(full.ob_no);
      setFormDate(full.date);
      setProduct(full.product || "");
      setSelectedProducts(prods);
      setCustomerName(full.customer_name || "");
      setCustomerCity(full.customer_city || "");
      setCustomerPhone(full.customer_phone || "");
      setCustomerType(full.customer_type || "Retail");
      setFineJama(full.fine_jama?.toString() || "");
      setRate10g(full.rate_10g?.toString() || "");
      setAmtJama(full.amt_jama?.toString() || "");

      // Build lookup: savedItems keyed by (metal_type, sort_order)
      const savedIndex = {};
      (full.items || []).forEach((i) => {
        const mt = i.metal_type || "Gold 24K";
        savedIndex[`${mt}::${i.sort_order}`] = i;
      });

      // Reconstruct rows per metal from obRates template, filling saved values
      const rows = [];
      prods.forEach((metal) => {
        const metalRates = rates
          .filter((r) => r.metal_type === metal)
          .sort((a, b) => a.sort_order - b.sort_order);

        metalRates.forEach((r, i) => {
          const saved = savedIndex[`${metal}::${i}`];
          rows.push({
            metal_type:     metal,
            size_label:     saved?.size_label || r.size_label,
            size_value:     r.size_value != null ? r.size_value
                              : (saved?.size_value?.toString() || ""),
            pcs:            saved?.pcs?.toString() || "",
            lc_pp:          saved?.lc_pp?.toString()
                              || getLcPpFromRow(r, full.customer_type || "Retail").toString(),
            is_custom:      !!r.is_custom,
            has_fixed_size: r.size_value != null && !r.is_custom,
            sort_order:     i,
          });
        });
      });
      setItems(rows);
      setView("form");
    } catch { showToast("Failed to load bill", "error"); }
    finally { setLoading(false); }
  }, [obRates, showToast]);

  // ── Product Toggle ────────────────────────────────────────────────────────

  const handleProductToggle = useCallback((metal) => {
    const isSelected = selectedProducts.includes(metal);
    if (isSelected) {
      if (selectedProducts.length === 1) return; // must keep at least 1
      setSelectedProducts((prev) => prev.filter((p) => p !== metal));
      setItems((prev) => prev.filter((item) => item.metal_type !== metal));
    } else {
      const newOrder = [...selectedProducts, metal];
      setSelectedProducts(newOrder);
      const newMetal = makeItemsForMetal(obRates, metal, customerType);
      setItems((prev) => [...prev, ...newMetal]);
    }
  }, [selectedProducts, customerType, obRates]);

  // ── Customer Type Change ──────────────────────────────────────────────────

  const handleCustomerTypeChange = useCallback((newType) => {
    setCustomerType(newType);
    setItems((prev) =>
      prev.map((item) => {
        const rateRow = findRateRow(obRates, item.metal_type, item.size_label);
        return { ...item, lc_pp: getLcPpFromRow(rateRow, newType).toString() };
      })
    );
  }, [obRates]);

  // ── Item Updates ──────────────────────────────────────────────────────────

  const updateItem = useCallback((metalType, sortOrder, field, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.metal_type === metalType && item.sort_order === sortOrder
          ? { ...item, [field]: value }
          : item
      )
    );
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (andPrint = false) => {
    if (!formDate)              { showToast("Date is required", "error"); return; }
    if (!obNo)                  { showToast("OB No. is required", "error"); return; }
    if (!selectedProducts.length) { showToast("Select at least one metal", "error"); return; }

    const itemsPayload = items.map((item) => ({
      metal_type:  item.metal_type,
      size_label:  item.size_label,
      size_value:  item.has_fixed_size
        ? parseFloat(item.size_value)
        : (parseFloat(item.size_value) || 0),
      pcs:         parseInt(item.pcs) || 0,
      lc_pp:       parseFloat(item.lc_pp) || 0,
      is_custom:   item.is_custom ? 1 : 0,
      sort_order:  item.sort_order,
    }));

    const payload = {
      ob_no:          parseInt(obNo),
      date:           formDate,
      product,
      products:       selectedProducts,
      customer_name:  customerName,
      customer_city:  customerCity,
      customer_phone: customerPhone,
      customer_type:  customerType,
      fine_jama:      parseFloat(fineJama)  || 0,
      rate_10g:       parseFloat(rate10g)   || 0,
      amt_jama:       parseFloat(amtJama)   || 0,
      items:          itemsPayload,
    };

    setSaving(true);
    try {
      let saved;
      if (editBill) {
        saved = await updateOrderBill(editBill.id, payload);
        showToast("Order bill updated");
      } else {
        saved = await createOrderBill(payload);
        showToast("Order bill created");
      }
      await loadBills();
      if (andPrint) {
        const fullSaved = await getOrderBill(typeof saved === "number" ? saved : saved?.id ?? saved);
        setPrintBill({ ...fullSaved, items });
        setView("print");
      } else {
        setView("list");
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message || "Failed to save bill", "error");
    } finally {
      setSaving(false);
    }
  }, [
    formDate, obNo, product, selectedProducts, customerName, customerCity, customerPhone,
    customerType, fineJama, rate10g, amtJama, items, editBill, loadBills, showToast,
  ]);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteOrderBill(id);
      setDeleteConfirm(null);
      showToast("Bill deleted");
      loadBills();
    } catch { showToast("Failed to delete bill", "error"); }
  }, [loadBills, showToast]);

  // ── RENDER: Print ────────────────────────────────────────────────────────

  if (view === "print" && printBill) {
    return (
      <PrintView
        bill={printBill}
        onClose={() => { setPrintBill(null); setView("list"); }}
      />
    );
  }

  // ── RENDER: List ─────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="space-y-6">
        <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Order Bills (OB)</h1>
            <p className="text-sm text-slate-500 mt-0.5">Create and manage jewellery order book bills</p>
          </div>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Plus size={16} /> New OB
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : bills.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-5xl mb-3">📒</p>
            <p className="font-bold text-lg">No order bills yet</p>
            <p className="text-sm">Click <span className="text-indigo-600 font-semibold">New OB</span> to create your first order bill.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">OB No.</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Metals</th>
                    <th className="text-center px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Wt (g)</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Subtotal</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Baki</th>
                    <th className="text-center px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill, idx) => {
                    const prods = parseProducts(bill.products);
                    return (
                      <tr key={bill.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                        <td className="px-4 py-3 font-black text-indigo-600">#{bill.ob_no}</td>
                        <td className="px-4 py-3 text-slate-600">{bill.date}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{bill.customer_name || "—"}</p>
                          {bill.customer_city && <p className="text-xs text-slate-400">{bill.customer_city}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {prods.map((m) => <MetalBadge key={m} metal={m} />)}
                          </div>
                          {bill.product && <p className="text-xs text-slate-400 mt-0.5">{bill.product}</p>}
                        </td>
                        <td className="px-4 py-3 text-center"><CTypeBadge type={bill.customer_type} /></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(bill.total_weight, 3)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtINR(bill.subtotal)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${(bill.amt_baki || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                            {fmtINR(bill.amt_baki)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(bill)} title="Edit"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={async () => {
                              const full = await getOrderBill(bill.id);
                              setPrintBill(full);
                              setView("print");
                            }} title="Print"
                              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                              <Printer size={14} />
                            </button>
                            <button onClick={() => setDeleteConfirm(bill.id)} title="Delete"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-black text-slate-800 mb-2">Delete Order Bill?</h3>
              <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER: Form ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />

      {/* Form Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => setView("list")}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-200 px-3 py-2 rounded-xl transition-colors">
          <ArrowLeft size={16} /> Order Bills
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">
            {editBill ? `Edit OB #${obNo}` : "New Order Bill"}
          </h1>
          <p className="text-xs text-slate-400">
            {editBill ? "Update jewellery order bill" : "Create a new jewellery order bill"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ─── Left Column (2/3) ─── */}
        <div className="xl:col-span-2 space-y-5">

          {/* ── Bill Details ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Bill Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">OB No. *</label>
                <input type="number" min="1" step="1" value={obNo} onChange={(e) => setObNo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Date *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Product / Description</label>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Bangles, Ring, Chain…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Customer Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">City</label>
                <input type="text" value={customerCity} onChange={(e) => setCustomerCity(e.target.value)}
                  placeholder="City"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
                <input type="text" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone No."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
          </div>

          {/* ── Metal Type Selection ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider mb-1">Metal Types</h2>
            <p className="text-xs text-slate-400 mb-3">
              Select one or more metals. Items are auto-populated from Admin labour configuration.
            </p>
            <div className="flex gap-3">
              {ALL_METALS.map((metal) => {
                const isSelected = selectedProducts.includes(metal);
                const mc = METAL_COLORS[metal];
                return (
                  <button key={metal} onClick={() => handleProductToggle(metal)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                      isSelected
                        ? `${mc.bg} ${mc.border} ${mc.text}`
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}>
                    {metal}
                    {isSelected && <span className="ml-1.5 text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedProducts.length === 0 && (
              <p className="text-xs text-red-500 mt-2 font-semibold">At least one metal must be selected.</p>
            )}
          </div>

          {/* ── Customer Type ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider mb-3">Customer Type</h2>
            <div className="flex gap-3">
              {CUSTOMER_TYPES.map((ct) => (
                <button key={ct} onClick={() => handleCustomerTypeChange(ct)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                    customerType === ct
                      ? ct === "Wholesale" ? "bg-blue-50 border-blue-500 text-blue-700"
                        : ct === "Showroom" ? "bg-purple-50 border-purple-500 text-purple-700"
                        : "bg-slate-100 border-slate-500 text-slate-700"
                      : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}>
                  {ct}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {customerType === "Retail"
                ? "Labour included in total but not shown separately."
                : "LC P.P and T.LC columns are visible."}
            </p>
          </div>

          {/* ── Order Items Table ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-700">Order Items</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Enter PCS for each size. Rows with 0 pieces are ignored in totals.
                {items.length === 0 && obRates.length === 0 && (
                  <span className="text-amber-600 ml-1">No rates configured — visit Admin to set up labour rates.</span>
                )}
              </p>
            </div>

            {items.length > 0 ? (
              <>
                <ItemsTable
                  items={items}
                  selectedProducts={selectedProducts}
                  showLabour={showLabour}
                  onUpdate={updateItem}
                />
                {/* Footer totals */}
                <table className="w-full text-sm border-t-2 border-slate-300">
                  <tfoot>
                    <tr className="bg-slate-100 text-xs font-black text-slate-700">
                      <td className="px-3 py-2.5 w-28">TOTAL</td>
                      <td className="px-3 py-2.5 text-center w-20">{summary.total_pcs}</td>
                      <td className="px-3 py-2.5 text-right w-24 font-mono">{fmt(summary.total_weight, 3)}</td>
                      {showLabour && <td className="px-3 py-2.5 w-28" />}
                      {showLabour && <td className="px-3 py-2.5 text-right w-24 font-mono">{fmt(summary.labour_total, 0)}</td>}
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">📦</p>
                <p className="font-bold">No items to display</p>
                <p className="text-xs mt-1">
                  {obRates.filter((r) => selectedProducts.includes(r.metal_type)).length === 0
                    ? "No labour rates configured for selected metals."
                    : "Select a metal above to populate items."}
                </p>
              </div>
            )}
          </div>

          {/* ── Fine Gold Section ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Fine Gold</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-0.5">T. Weight</p>
                <p className="text-xl font-black text-slate-800 font-mono">{fmt(summary.total_weight, 3)}g</p>
                <p className="text-[10px] text-slate-400">Sum of all selected items</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">F. JAMA (g) — Gold Deposited</label>
                <input type="number" min="0" step="0.001" value={fineJama}
                  onChange={(e) => setFineJama(e.target.value)} placeholder="0.000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={`rounded-xl p-3 border ${
                summary.fine_diff > 0 ? "bg-orange-50 border-orange-200"
                : summary.fine_diff < 0 ? "bg-green-50 border-green-200"
                : "bg-slate-50 border-slate-200"
              }`}>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-0.5">FINE +/-</p>
                <p className={`text-xl font-black font-mono ${
                  summary.fine_diff > 0 ? "text-orange-700" : summary.fine_diff < 0 ? "text-green-700" : "text-slate-700"
                }`}>
                  {summary.fine_diff > 0 ? "+" : ""}{fmt(summary.fine_diff, 3)}g
                </p>
                <p className="text-[10px] text-slate-400">
                  {summary.fine_diff > 0 ? "Customer owes gold" : summary.fine_diff < 0 ? "Gold surplus" : "Balanced"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">10g Rate (₹)</label>
                <input type="number" min="0" step="1" value={rate10g}
                  onChange={(e) => setRate10g(e.target.value)} placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Gold ₹</p>
                <p className="text-[10px] text-amber-500 mt-0.5">FINE+/- × 10g Rate ÷ 10, rounded to ₹10</p>
              </div>
              <p className="text-2xl font-black text-amber-800 font-mono">{fmtINR(summary.gold_rs)}</p>
            </div>
          </div>
        </div>

        {/* ─── Right Column (1/3) ─── */}
        <div className="space-y-5">

          {/* ── Payment Summary ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Payment</h2>
            {showLabour && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Labour Total</span>
                <span className="font-bold">{fmtINR(summary.labour_total)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Gold ₹</span>
              <span className="font-bold">{fmtINR(summary.gold_rs)}</span>
            </div>
            <div className="flex justify-between items-center text-base font-black border-t border-slate-200 pt-2">
              <span>Subtotal</span>
              <span>{fmtINR(summary.subtotal)}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">AMT JAMA (₹) — Advance Paid</label>
              <input type="number" min="0" step="0.01" value={amtJama}
                onChange={(e) => setAmtJama(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div className={`rounded-xl px-4 py-3 border font-black flex justify-between items-center text-base ${
              (summary.amt_baki || 0) > 0
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-green-50 border-green-200 text-green-700"
            }`}>
              <span>AMT BAKI</span>
              <span>{fmtINR(summary.amt_baki)}</span>
            </div>
          </div>

          {/* ── Gold Carry Forward ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Gold Carry Forward</h2>
            <div className={`rounded-xl px-4 py-3 border font-black text-sm flex justify-between items-center ${
              summary.ofg_status === "OF.G AFSL"
                ? "bg-orange-50 border-orange-300 text-orange-800"
                : "bg-green-50 border-green-200 text-green-700"
            }`}>
              <span>{summary.ofg_status}</span>
              {summary.ofg_status === "OF.G AFSL" && (
                <span className="text-xs font-semibold">{fmt(summary.fine_carry, 3)}g</span>
              )}
            </div>
            {summary.ofg_status === "OF.G AFSL" ? (
              <div className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
                <p className="font-bold mb-0.5">Gold carries forward</p>
                <p>Fine JAMA: <span className="font-black font-mono">{fmt(summary.fine_carry, 3)}g</span></p>
                <p className="text-orange-400 mt-0.5">Rate is ₹0 — surplus gold is carried to next bill</p>
              </div>
            ) : (
              <div className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                No gold carry forward
              </div>
            )}
          </div>

          {/* ── Action Buttons ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2 sticky top-4">
            <button onClick={() => handleSave(false)} disabled={saving}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
              <Save size={14} />
              {saving ? "Saving…" : editBill ? "Update OB" : "Save OB"}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
              <Printer size={14} />
              {saving ? "Saving…" : "Save & Print"}
            </button>
            <button onClick={() => setView("list")} disabled={saving}
              className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
