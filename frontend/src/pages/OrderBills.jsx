import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  FileText,
  Plus,
  Printer,
  Save,
  Search,
  SortAsc,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  createOrderBill,
  deleteOrderBill,
  getNextObNo,
  getOrderBill,
  listOrderBills,
  updateOrderBill,
  validateOrderBillStock,
} from "../api/orderBillApiService";
import { getLabourChargesGrouped } from "../api/labourChargeService";
import { getCustomers } from "../api/customerService";
import { useSellingSync } from "../context/SellingSyncContext";
import {
  createEmptyPaymentEntry,
  computeEstimateBalance,
  METAL_PAYMENT_TYPES,
  normalizePaymentEntries,
  normalizeSettlementRates,
} from "../utils/sellingPayments";

// --- Constants ---
const METAL_TYPES    = METAL_PAYMENT_TYPES;
const CUSTOMER_TYPES = ["Retail", "Showroom", "Wholesale"];
const BILLS_PER_PAGE = 20;

// --- Formatting helpers ---
const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
const fmtMoney = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getTodayLocalISO = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().split("T")[0];
};

const fmtDate = (dateStr) => {
  if (!dateStr) return "-";
  const [y, m, d] = String(dateStr).split("-");
  if (!y || !m || !d) return dateStr;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
};

// --- Business logic helpers (unchanged) ---
const parseProducts = (raw) => {
  if (Array.isArray(raw) && raw.length) return raw;
  if (!raw) return ["Gold 24K"];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : ["Gold 24K"];
  } catch {
    return ["Gold 24K"];
  }
};

const extractSettlementRates = (bill = {}) => normalizeSettlementRates(
  bill?.balance_snapshot?.settlement_rate,
  {
    "Gold 24K": parseFloat(bill?.rate_10g) || 0,
    "Gold 22K": parseFloat(bill?.rate_gold_22k) || 0,
    Silver: parseFloat(bill?.rate_silver) || 0,
  }
);

const itemKey = (metalType, category, sizeLabel) => `${metalType}::${category}::${sizeLabel}`;

const normalizeEstimateSizeLabel = (metalType, sizeLabel) => {
  if (metalType === "Silver") return sizeLabel;
  const match = sizeLabel.match(/^(\d+\.\d+)g$|^(\d+)g$/);
  if (!match) return sizeLabel;
  return match[1] ? `${match[1]}gm` : `${match[2]} gm`;
};

const getRateForCustomerType = (row, customerType) => {
  if (!row) return 0;
  if (customerType === "Wholesale") return parseFloat(row.lc_pp_wholesale) || 0;
  if (customerType === "Showroom")  return parseFloat(row.lc_pp_showroom)  || 0;
  return parseFloat(row.lc_pp_retail) || 0;
};

const buildItemsFromCharges = (groupedCharges, selectedMetals, customerType, existingItems = []) => {
  // Primary key: exact match from DB (metal_type::category::size_label)
  const existingMap = new Map(
    (existingItems || []).map((item) => [
      itemKey(item.metal_type || "Gold 24K", item.category || "Standard", item.size_label || ""),
      item,
    ])
  );
  // Fallback key: metal_type::normalized_size_label — needed because saved items store
  // normalizeEstimateSizeLabel(metal_type, size_label) for both category AND size_label,
  // so the exact key never matches groupedCharges keys on edit.
  const existingByNorm = new Map(
    (existingItems || []).map((item) => [
      `${item.metal_type || "Gold 24K"}::${item.size_label || ""}`,
      item,
    ])
  );

  const rows = [];
  selectedMetals.forEach((metalType) => {
    const categories = groupedCharges?.[metalType] || {};
    let sortOrder = 0;
    Object.entries(categories).forEach(([category, sizeRows]) => {
      (sizeRows || []).forEach((row) => {
        const exactKey = itemKey(metalType, category, row.size_label);
        const normKey  = `${metalType}::${normalizeEstimateSizeLabel(metalType, row.size_label)}`;
        const existing = existingMap.get(exactKey) || existingByNorm.get(normKey);
        rows.push({
          metal_type:  metalType,
          category,
          size_label:  row.size_label,
          size_value:
            row.size_value != null && row.size_value !== ""
              ? parseFloat(row.size_value)
              : existing?.size_value != null && existing?.size_value !== ""
                ? parseFloat(existing.size_value)
                : 0,
          pcs:    existing?.pcs != null ? String(existing.pcs) : "",
          lc_pp:  getRateForCustomerType(row, customerType),
          sort_order: sortOrder,
        });
        sortOrder += 1;
      });
    });
  });
  return rows;
};

// --- Toast ---
const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast.show) return undefined;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast.show, onClose]);
  if (!toast.show) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold ${
      toast.type === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-red-50 border-red-200 text-red-800"
    }`}>
      {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.message}
      <button onClick={onClose} className="opacity-60 hover:opacity-100 ml-1"><X size={14} /></button>
    </div>
  );
};

// --- View state ---
const CustomerLookup = ({ selectedCustomer, onSelect, onClear }) => {
  const [query, setQuery]     = useState(selectedCustomer?.party_name || "");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const debounceRef           = useRef(null);
  const containerRef          = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await getCustomers(value.trim());
        const list = res?.data || [];
        setResults(list);
        setOpen(list.length > 0);
      } catch { setResults([]); setOpen(false); }
    }, 250);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => { if (results.length) setOpen(true); }}
            placeholder="Search by name or phone..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
          />
        </div>
        {selectedCustomer && (
          <button
            onClick={() => { onClear(); setQuery(""); setResults([]); setOpen(false); }}
            className="px-3 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); setOpen(false); }}
              className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-50 last:border-b-0 transition-colors"
            >
              <p className="text-sm font-bold text-slate-800">{c.party_name}</p>
              <p className="text-xs text-slate-500">
                {c.phone_no || "No phone"}{c.city ? `  ·  ${c.city}` : ""}{" "}
                <span className="text-indigo-400 font-semibold">{c.customer_type}</span>
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- View state ---
const Pagination = ({ page, totalPages, onChange, label }) => {
  if (totalPages <= 1) return null;
  const buildPages = () => {
    let start = Math.max(1, page - 2);
    let end   = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    const pages = [];
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      {label && <span className="text-xs text-slate-400 font-semibold hidden sm:block">{label}</span>}
      <div className="flex items-center gap-1 mx-auto sm:mx-0">
        <button onClick={() => onChange(1)} disabled={page <= 1} className="px-1.5 py-1 text-xs font-black text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30">«</button>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30"><ChevronLeft size={15} /></button>
        {buildPages().map((p) => (
          <button key={p} onClick={() => onChange(p)}
            className={`w-7 h-7 rounded-lg text-xs font-bold ${p === page ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}
          >{p}</button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30"><ChevronRight size={15} /></button>
        <button onClick={() => onChange(totalPages)} disabled={page >= totalPages} className="px-1.5 py-1 text-xs font-black text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30">»</button>
      </div>
    </div>
  );
};

// --- List view state ---
const PrintView = ({ bill, onClose }) => {
  const items   = bill.items || [];
  const products = parseProducts(bill.products);
  const paymentEntries = normalizePaymentEntries(bill.payment_entries || [], bill);
  const summary = computeEstimateBalance(items, paymentEntries, bill.discount, extractSettlementRates(bill));
  // Retail customers see the total but NOT the labour breakdown line-by-line
  const isRetail = (bill.customer_type || "Retail").toLowerCase() === "retail";

  useEffect(() => {
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-white p-8 print:p-4">
      <div className="max-w-3xl mx-auto">
        {/* Controls (hidden on print) */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={16} /> Back to list
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors">
            <Printer size={16} /> Print
          </button>
        </div>

        {/* Header */}
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-5">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ESTIMATE</h1>
          <p className="text-xs text-slate-500 mt-0.5">Jewellery order estimate</p>
        </div>

        {/* Bill info */}
        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div className="space-y-1">
            <p><span className="font-bold text-slate-600">Estimate No.:</span> #{bill.ob_no}</p>
            <p><span className="font-bold text-slate-600">Date:</span> {fmtDate(bill.date)}</p>
            <p><span className="font-bold text-slate-600">Metal:</span> {products.join(", ")}</p>
            {bill.product ? <p><span className="font-bold text-slate-600">Product:</span> {bill.product}</p> : null}
          </div>
          <div className="text-right space-y-1">
            <p className="font-black text-slate-800 text-base">{bill.customer_name || "Walk-in Customer"}</p>
            {bill.customer_phone   ? <p className="text-slate-600 text-xs">{bill.customer_phone}</p>   : null}
            {bill.customer_address ? <p className="text-slate-600 text-xs">{bill.customer_address}</p> : null}
            <p className="text-xs text-slate-500 font-semibold">{bill.customer_type || "Retail"}</p>
          </div>
        </div>

        {/* Items per metal */}
        {products.map((metalType) => {
          const metalItems = items.filter((item) => (item.metal_type || "Gold 24K") === metalType);
          if (!metalItems.length) return null;
          const categories = [...new Set(metalItems.map((item) => item.category || "Standard"))];
          return (
            <div key={metalType} className="mb-5">
              <h3 className="font-black text-slate-700 text-sm mb-2 uppercase tracking-wider bg-slate-50 px-3 py-1 rounded">{metalType}</h3>
              {categories.map((category) => {
                const catItems = metalItems.filter((item) => (item.category || "Standard") === category);
                return (
                  <div key={`${metalType}-${category}`} className="mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{category}</p>
                    <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-200 px-2 py-1.5 text-left font-black">Size</th>
                          <th className="border border-slate-200 px-2 py-1.5 text-center font-black">Pcs</th>
                          <th className="border border-slate-200 px-2 py-1.5 text-right font-black">Weight (g)</th>
                          {!isRetail && (
                            <>
                              <th className="border border-slate-200 px-2 py-1.5 text-right font-black">LC/pc</th>
                              <th className="border border-slate-200 px-2 py-1.5 text-right font-black">T. LC</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {catItems.map((item) => {
                          const pcs    = parseInt(item.pcs, 10) || 0;
                          const weight = (parseFloat(item.size_value) || 0) * pcs;
                          const lc     = (parseFloat(item.lc_pp) || 0) * pcs;
                          return (
                            <tr key={itemKey(item.metal_type, item.category, item.size_label)} className="even:bg-slate-50/50">
                              <td className="border border-slate-200 px-2 py-1.5">{item.size_label}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-center font-bold">{pcs}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-right">{fmt(weight, 4)}</td>
                              {!isRetail && (
                                <>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right">{fmt(item.lc_pp, 0)}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold">{fmt(lc, 0)}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Summary */}
        <div className="ml-auto w-72 text-sm space-y-1 border border-slate-200 rounded-xl p-4 mt-4">
          {[
            ["Total Pcs",    String(summary.totalPcs)],
            ["Total Weight", `${fmt(summary.totalWeight, 4)}g`],
            // Labour Total is hidden for retail — it's included in Final Payable
            ...(!isRetail ? [["Labour Total", fmtMoney(summary.labourTotal)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">{label}</span>
              <span className="font-bold">{value}</span>
            </div>
          ))}
          {Object.entries(summary.requiredMetal || {}).map(([mt, required]) => {
            if ((required || 0) === 0 && (summary.metalReceived?.[mt] || 0) === 0) return null;
            return (
              <div key={mt} className="py-1 border-b border-slate-100">
                <div className="flex justify-between"><span className="text-slate-600">{mt} Needed</span><span className="font-bold">{fmt(required || 0, 4)}g</span></div>
                {(summary.metalReceived?.[mt] || 0) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-600">{mt} Received</span><span className="font-bold">{fmt(summary.metalReceived?.[mt] || 0, 4)}g</span></div>
                )}
                {(summary.metalDueUnsettled?.[mt] || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">{mt} Still Owed</span>
                    <span className="font-bold text-rose-700">{fmt(summary.metalDueUnsettled?.[mt] || 0, 4)}g</span>
                  </div>
                )}
                {(summary.metalShortfallSettled?.[mt] || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 italic text-xs">&#8627; Paid in Cash</span>
                    <span className="font-bold text-amber-700">{fmt(summary.metalShortfallSettled?.[mt], 4)}g</span>
                  </div>
                )}
                {(summary.metalCredit?.[mt] || 0) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-600">{mt} Extra Metal</span><span className="font-bold text-emerald-700">{fmt(summary.metalCredit?.[mt] || 0, 4)}g</span></div>
                )}
              </div>
            );
          })}
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">Money Received</span>
            <span className="font-bold">{fmtMoney(summary.moneyPaid)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200">
            <span className="text-slate-600">Final Payable</span>
            <span className="font-bold">{fmtMoney(summary.totalAmount || 0)}</span>
          </div>
          {summary.discount > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700">
              <span>Discount</span>
              <span className="font-bold">- {fmtMoney(summary.discount)}</span>
            </div>
          )}
          {/* Settlement outcome — single authoritative row */}
          {summary.amountGiven > 0 ? (
            <div className="flex justify-between py-1.5 font-black text-base text-amber-700">
              <span>Return to Customer</span>
              <span>{fmtMoney(summary.amountGiven)}</span>
            </div>
          ) : summary.refundDue > 0 ? (
            <div className="flex justify-between py-1.5 font-black text-base text-emerald-700">
              <span>Cash Refund</span>
              <span>{fmtMoney(summary.refundDue)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between py-1 border-b border-slate-200 font-black text-base">
                <span>Cash Remaining</span>
                <span>{fmtMoney(summary.amountDue)}</span>
              </div>
              {Object.values(summary.metalDueUnsettled || {}).some((v) => v > 0) && (
                <div className="flex justify-between py-1.5 font-semibold text-sm">
                  <span className="text-slate-600">Metal Still Owed</span>
                  <span className="text-rose-700">See above</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Modal state ---
const EstimateViewModal = ({ bill, onClose, onEdit }) => {
  if (!bill) return null;

  const items = bill.items || [];
  const products = parseProducts(bill.products);
  const paymentEntries = normalizePaymentEntries(bill.payment_entries || [], bill);
  const summary = computeEstimateBalance(items, paymentEntries, bill.discount, extractSettlementRates(bill));

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-indigo-500">Estimate View</p>
            <h3 className="text-xl font-black text-slate-800">Estimate #{bill.ob_no}</h3>
            <p className="text-sm text-slate-500 mt-0.5">Created for {fmtDate(bill.date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit?.(bill)}
              className="px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
            >
              Edit Estimate
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-82px)] p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Customer</p>
              <p className="text-lg font-black text-slate-800 mt-1">{bill.customer_name || "Walk-in Customer"}</p>
              <p className="text-sm text-slate-500 mt-1">{bill.customer_phone || "No phone number"}</p>
              <p className="text-sm text-slate-500">{bill.customer_address || "No address saved"}</p>
              <p className="text-xs font-semibold text-indigo-500 mt-2">{bill.customer_type || "Retail"}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Estimate Details</p>
              <p className="text-sm text-slate-600 mt-2">Date: <span className="font-bold text-slate-800">{fmtDate(bill.date)}</span></p>
              <p className="text-sm text-slate-600 mt-1">Metals: <span className="font-bold text-slate-800">{products.join(", ")}</span></p>
              <p className="text-sm text-slate-600 mt-1">Product: <span className="font-bold text-slate-800">{bill.product || "Not specified"}</span></p>
              <p className="text-sm text-slate-600 mt-1">Money Received: <span className="font-bold text-emerald-700">{fmtMoney(summary.moneyPaid)}</span></p>
              {summary.amountGiven > 0 && (
                <p className="text-sm text-slate-600 mt-1">Amount Given to Customer: <span className="font-bold text-amber-700">{fmtMoney(summary.amountGiven)}</span></p>
              )}
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Totals</p>
              <p className="text-sm text-slate-600 mt-2">Pieces: <span className="font-bold text-slate-800">{summary.totalPcs}</span></p>
              <p className="text-sm text-slate-600 mt-1">Weight: <span className="font-bold text-slate-800">{fmt(summary.totalWeight, 4)}g</span></p>
              <p className="text-sm text-slate-600 mt-1">Labour: <span className="font-bold text-slate-800">{fmtMoney(summary.labourTotal)}</span></p>
              {summary.amountGiven > 0 ? (
                <p className="text-sm text-slate-600 mt-1">Return to Customer: <span className="font-bold text-amber-700">{fmtMoney(summary.amountGiven)}</span></p>
              ) : summary.refundDue > 0 ? (
                <p className="text-sm text-slate-600 mt-1">Refund Due: <span className="font-bold text-emerald-700">{fmtMoney(summary.refundDue)}</span></p>
              ) : (
                <p className="text-sm text-slate-600 mt-1">Balance Due: <span className={`font-bold ${summary.amountDue === 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmtMoney(summary.amountDue)}</span></p>
              )}
              <p className="text-sm text-slate-600 mt-1">Report Value: <span className="font-bold text-rose-600">{fmtMoney(summary.report?.grandTotalEstimate || 0)}</span></p>
            </div>
          </div>

          {products.map((metalType) => {
            const metalItems = items.filter((item) => (item.metal_type || "Gold 24K") === metalType);
            if (!metalItems.length) return null;
            return (
              <div key={metalType} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <h4 className="font-black text-slate-800">{metalType}</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[620px]">
                    <thead>
                      <tr className="bg-white border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="text-left px-4 py-3 font-black">Category</th>
                        <th className="text-left px-4 py-3 font-black">Size</th>
                        <th className="text-right px-4 py-3 font-black">PCS</th>
                        <th className="text-right px-4 py-3 font-black">Weight</th>
                        <th className="text-right px-4 py-3 font-black">LC/pc</th>
                        <th className="text-right px-4 py-3 font-black">T. LC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metalItems.map((item, index) => {
                        const pcs = parseInt(item.pcs, 10) || 0;
                        const sizeValue = parseFloat(item.size_value) || 0;
                        const weight = sizeValue * pcs;
                        const totalLabour = (parseFloat(item.lc_pp) || 0) * pcs;
                        return (
                          <tr key={`${itemKey(item.metal_type, item.category, item.size_label)}-${index}`} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-4 py-3 text-slate-700 font-semibold">{item.category || "Standard"}</td>
                            <td className="px-4 py-3 text-slate-700">{item.size_label}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">{pcs}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(weight, 4)}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(item.lc_pp, 0)}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(totalLabour, 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ step, title, subtitle }) => (
  <div className="flex items-start gap-3 mb-4">
    {step && (
      <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
        {step}
      </div>
    )}
    <div>
      <h2 className="font-black text-slate-800 text-sm">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

// --- State ---
export default function OrderBills() {
  const { versions, markDirty } = useSellingSync();
  const initialSelectedDateRef = useRef(getTodayLocalISO());
  const latestBillsRequestRef = useRef(0);
  const dateDebounceRef = useRef(null);

// --- State ---
  const [view, setView] = useState("list");

// --- State ---
  const [bills, setBills]         = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listPage, setListPage]   = useState(1);
  const [listSort, setListSort]   = useState("newest");
  const [selectedDate, setSelectedDate] = useState(initialSelectedDateRef.current);
  // Separate display value for the date input so typing doesn't trigger fetches mid-edit
  const [dateInputValue, setDateInputValue] = useState(initialSelectedDateRef.current);

// --- State ---
  const [groupedCharges, setGroupedCharges] = useState({});
  const [initializing, setInitializing]     = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [editBill, setEditBill]             = useState(null);
  const [viewBill, setViewBill]             = useState(null);
  const [printBill, setPrintBill]           = useState(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [obNo, setObNo]             = useState("");
  const [formDate, setFormDate]     = useState(initialSelectedDateRef.current);
  const [product, setProduct]       = useState("");
  const [selectedProducts, setSelectedProducts] = useState(["Gold 24K"]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerName, setCustomerName]         = useState("");
  const [customerPhone, setCustomerPhone]       = useState("");
  const [customerAddress, setCustomerAddress]   = useState("");
  const [customerType, setCustomerType]         = useState("Retail");
  const [items, setItems]           = useState([]);
  const [paymentEntries, setPaymentEntries] = useState([createEmptyPaymentEntry()]);
  const [settlementRates, setSettlementRates] = useState(() => normalizeSettlementRates());
  const [discount, setDiscount] = useState("");
  const [stockValidation, setStockValidation] = useState({ valid: true, items: [] });
  const [validatingStock, setValidatingStock] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);

  // Keyboard-nav refs for PCS inputs
  const pcsInputRefs = useRef({});

// --- State ---
  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
  }, []);

  const loadBills = useCallback(async (date = getTodayLocalISO()) => {
    const requestId = latestBillsRequestRef.current + 1;
    latestBillsRequestRef.current = requestId;
    setListLoading(true);
    // Do NOT clear bills here — keep existing rows visible while the new date loads.
    // This prevents the table flash and makes date navigation feel instant.

    try {
      const data = await listOrderBills(date ? { date } : {});
      if (latestBillsRequestRef.current !== requestId) return;
      setBills(data || []);
    } finally {
      if (latestBillsRequestRef.current === requestId) {
        setListLoading(false);
      }
    }
  }, []);

  const loadCharges = useCallback(async () => {
    const data = await getLabourChargesGrouped();
    setGroupedCharges(data || {});
    return data || {};
  }, []);

  const resetForm = useCallback(async (charges = {}, nextDate = getTodayLocalISO()) => {
    const next      = await getNextObNo().catch(() => ({ ob_no: 1 }));
    const nextValue = next?.ob_no ?? next ?? 1;
    setEditBill(null);
    setObNo(String(nextValue));
    setFormDate(nextDate || getTodayLocalISO());
    setProduct("");
    setSelectedProducts(["Gold 24K"]);
    setSelectedCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerType("Retail");
    setPaymentEntries([createEmptyPaymentEntry()]);
    setSettlementRates(normalizeSettlementRates());
    setDiscount("");
    setItems(buildItemsFromCharges(charges, ["Gold 24K"], "Retail"));
  }, []);

// --- State ---
  useEffect(() => {
    const init = async () => {
      try {
        const initialDate = initialSelectedDateRef.current;
        const [charges] = await Promise.all([loadCharges(), loadBills(initialDate)]);
        await resetForm(charges, initialDate);
      } catch (error) {
        showToast(error?.message || "Failed to load Estimate module", "error");
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [loadBills, loadCharges, resetForm, showToast]);

  useEffect(() => {
    if (initializing) return;
    loadBills(selectedDate).catch(() => {});
  }, [initializing, loadBills, selectedDate, versions.estimates]);

// --- State ---
  const summary = useMemo(
    () => computeEstimateBalance(items, paymentEntries, discount, settlementRates),
    [items, paymentEntries, discount, settlementRates]
  );

  const stockValidationMap = useMemo(() => {
    const map = new Map();
    (stockValidation.items || []).forEach((item) => {
      // Items are sent with size_label = normalizeEstimateSizeLabel(metal_type, size_label),
      // so key on metal_type::normalized_size_label for reliable lookup.
      map.set(`${item.metal_type}::${item.size_label}`, item);
    });
    return map;
  }, [stockValidation.items]);

// --- Helper ---
  const shiftDate = useCallback((dateStr, delta) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return d.toISOString().split("T")[0];
  }, []);

  // List filtering + sorting + pagination - operates within the selected day data
  const filteredBills = useMemo(() => {
    let result = [...bills];
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase().trim();
      result = result.filter(
        (b) =>
          String(b.ob_no).includes(q) ||
          (b.customer_name || "").toLowerCase().includes(q) ||
          (b.customer_phone || "").includes(q) ||
          (b.date || "").includes(q)
      );
    }
    // Within a single day all dates are identical, so sort by ob_no for date modes
    result.sort((a, b) => {
      if (listSort === "newest")      return b.ob_no - a.ob_no;
      if (listSort === "oldest")      return a.ob_no - b.ob_no;
      if (listSort === "amount_desc") return (parseFloat(b.total_amount) || 0) - (parseFloat(a.total_amount) || 0);
      if (listSort === "amount_asc")  return (parseFloat(a.total_amount) || 0) - (parseFloat(b.total_amount) || 0);
      return 0;
    });
    return result;
  }, [bills, listSearch, listSort]);

  const totalBillPages = Math.ceil(filteredBills.length / BILLS_PER_PAGE);
  const pagedBills = useMemo(() => {
    const start = (listPage - 1) * BILLS_PER_PAGE;
    return filteredBills.slice(start, start + BILLS_PER_PAGE);
  }, [filteredBills, listPage]);

  // Reset to page 1 whenever the active filter set changes
  useEffect(() => { setListPage(1); }, [listSearch, listSort, selectedDate]);

  // Reset search when date changes so the new day opens clean
  useEffect(() => { setListSearch(""); }, [selectedDate]);

  // Keep the date input display value in sync when selectedDate changes programmatically
  // (e.g. from prev/next buttons or after save)
  useEffect(() => { setDateInputValue(selectedDate); }, [selectedDate]);

  // Stats scoped to the selected day
  const listStats = useMemo(() => ({
    total:        bills.length,
    totalValue:   bills.reduce((s, b) => s + (parseFloat(b.total_amount) || parseFloat(b.subtotal) || 0), 0),
    totalPending: bills.reduce((s, b) => s + (parseFloat(b.amt_baki) || 0), 0),
  }), [bills]);

// --- State ---
  useEffect(() => {
    if (view !== "form") return undefined;
    const visibleItems = items
      .map((item) => {
        const nl = normalizeEstimateSizeLabel(item.metal_type, item.size_label);
        return { metal_type: item.metal_type, category: nl, size_label: nl, pcs: parseInt(item.pcs, 10) || 0 };
      });
    if (!visibleItems.length) { setStockValidation({ valid: true, items: [] }); return undefined; }
    const t = setTimeout(async () => {
      setValidatingStock(true);
      try {
        const v = await validateOrderBillStock({ estimate_id: editBill?.id || null, items: visibleItems });
        setStockValidation(v || { valid: true, items: [] });
      } catch (error) {
        setStockValidation({
          valid: false,
          items: visibleItems.map((item) => ({
            ...item,
            available_pieces: 0,
            valid: item.pcs <= 0,
            message: error?.message || "Unable to validate",
          })),
        });
      } finally {
        setValidatingStock(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [editBill?.id, items, view]);

// --- State ---
  const handleProductToggle = useCallback((metalType) => {
    setSelectedProducts((cur) => {
      const next = cur.includes(metalType)
        ? cur.length === 1 ? cur : cur.filter((v) => v !== metalType)
        : [...cur, metalType];
      setItems((prev) => buildItemsFromCharges(groupedCharges, next, customerType, prev));
      return next;
    });
  }, [customerType, groupedCharges]);

  const handleCustomerTypeChange = useCallback((nextType) => {
    setCustomerType(nextType);
    setItems((prev) => buildItemsFromCharges(groupedCharges, selectedProducts, nextType, prev));
  }, [groupedCharges, selectedProducts]);

  const updatePieces = useCallback((targetKey, value) => {
    setItems((cur) => cur.map((item) =>
      itemKey(item.metal_type, item.category, item.size_label) === targetKey
        ? { ...item, pcs: value }
        : item
    ));
  }, []);

  const updateSettlementRate = useCallback((metalType, value) => {
    setSettlementRates((current) => ({
      ...current,
      [metalType]: value,
    }));
  }, []);

  const updatePaymentEntry = useCallback((index, field, value) => {
    setPaymentEntries((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== index) return entry;
      if (field === "payment_type") {
        if (value === "Metal") {
          return {
            payment_type: "Metal",
            amount: "",
            metal_type: entry.metal_type || "Gold 24K",
            weight: entry.weight || "",
            purity: entry.purity || "99.99",
            reference_rate: entry.reference_rate || "",
          };
        }
        return {
          payment_type: value,
          amount: entry.amount || "",
          metal_type: "Gold 24K",
          weight: "",
          purity: "",
          reference_rate: "",
        };
      }
      if (field === "metal_type") {
        const nextPurity = value === "Gold 22K" ? "91.67" : value === "Silver" ? "99.90" : "99.99";
        return { ...entry, metal_type: value, purity: nextPurity };
      }
      return { ...entry, [field]: value };
    }));
  }, []);

  const addPaymentEntry = useCallback(() => {
    setPaymentEntries((current) => [...current, createEmptyPaymentEntry()]);
  }, []);

  const removePaymentEntry = useCallback((index) => {
    setPaymentEntries((current) => current.length <= 1 ? current : current.filter((_, entryIndex) => entryIndex !== index));
  }, []);

  // PCS input keyboard navigation: Enter / ArrowDown -> next, ArrowUp -> prev
  const handlePcsKeyDown = useCallback((e, allKeys, currentIndex) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextKey = allKeys[currentIndex + 1];
      if (nextKey && pcsInputRefs.current[nextKey]) pcsInputRefs.current[nextKey].focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevKey = allKeys[currentIndex - 1];
      if (prevKey && pcsInputRefs.current[prevKey]) pcsInputRefs.current[prevKey].focus();
    }
  }, []);

  const openNew = useCallback(async () => {
    const charges = Object.keys(groupedCharges).length ? groupedCharges : await loadCharges();
    await resetForm(charges, selectedDate);
    setShowCustomerDetails(false);
    setView("form");
  }, [groupedCharges, loadCharges, resetForm, selectedDate]);

  const openEdit = useCallback(async (bill) => {
    try {
      const charges  = Object.keys(groupedCharges).length ? groupedCharges : await loadCharges();
      const full     = await getOrderBill(bill.id);
      const products = parseProducts(full.products);
      setEditBill(full);
      setObNo(String(full.ob_no || ""));
      setFormDate(full.date || new Date().toISOString().split("T")[0]);
      setProduct(full.product || "");
      setSelectedProducts(products);
      setSelectedCustomer(
        full.customer_id
          ? { id: full.customer_id, party_name: full.customer_name, phone_no: full.customer_phone, address: full.customer_address, customer_type: full.customer_type }
          : null
      );
      setCustomerName(full.customer_name || "");
      setCustomerPhone(full.customer_phone || "");
      setCustomerAddress(full.customer_address || "");
      setCustomerType(full.customer_type || "Retail");
      // Expand customer details if any extra info is present
      setShowCustomerDetails(!!(full.customer_phone || full.customer_address));
      setPaymentEntries(normalizePaymentEntries(full.payment_entries || [], full));
      setSettlementRates(extractSettlementRates(full));
      setDiscount(full.discount != null && parseFloat(full.discount) > 0 ? String(full.discount) : "");
      setItems(buildItemsFromCharges(charges, products, full.customer_type || "Retail", full.items || []));
      setView("form");
    } catch (error) {
      showToast(error?.message || "Failed to load estimate", "error");
    }
  }, [groupedCharges, loadCharges, showToast]);

  const openView = useCallback(async (bill) => {
    try {
      const full = await getOrderBill(bill.id);
      setViewBill(full);
    } catch (error) {
      showToast(error?.message || "Failed to load estimate", "error");
    }
  }, [showToast]);

  const handleSave = useCallback(async (andPrint = false) => {
    if (!formDate) { showToast("Date is required", "error"); return; }
    if (!obNo)     { showToast("Estimate number is required", "error"); return; }
    if (items.some((item) => {
      const rawPcs = item?.pcs;
      if (rawPcs == null || rawPcs === "") return false;
      const pcs = Number(rawPcs);
      return !Number.isInteger(pcs) || pcs < 0;
    })) {
      showToast("PCS must be a whole number 0 or greater", "error");
      return;
    }
    if (paymentEntries.some((entry) => {
      if (entry.payment_type === "Metal") {
        if (!entry.weight) return false;
        const weight = Number(entry.weight);
        return !Number.isFinite(weight) || weight < 0;
      }
      if (!entry.amount) return false;
      const amount = Number(entry.amount);
      return !Number.isFinite(amount) || amount < 0;
    })) {
      showToast("Payments cannot be negative", "error");
      return;
    }
    if (Object.values(settlementRates || {}).some((rate) => {
      if (rate == null || rate === "") return false;
      const parsedRate = Number(rate);
      return !Number.isFinite(parsedRate) || parsedRate < 0;
    })) {
      showToast("Settlement rates must be 0 or greater", "error");
      return;
    }

    const nonZeroItems = items
      .filter((item) => (parseInt(item.pcs, 10) || 0) > 0)
      .map((item) => {
        const nl = normalizeEstimateSizeLabel(item.metal_type, item.size_label);
        return {
          metal_type: item.metal_type, category: nl, size_label: nl,
          size_value: parseFloat(item.size_value) || 0,
          pcs: parseInt(item.pcs, 10) || 0,
          lc_pp: parseFloat(item.lc_pp) || 0,
          sort_order: item.sort_order,
        };
      });

    if (!nonZeroItems.length) { showToast("Enter quantity for at least one size", "error"); return; }
    if (stockValidation.items.length > 0 && !stockValidation.valid) {
      showToast("Insufficient stock available for selected size/category", "error"); return;
    }

    const hasCustomerDraft = customerName || customerPhone || customerAddress;
    if (!selectedCustomer && hasCustomerDraft && !customerName) {
      showToast("Customer name is required when adding a new customer", "error"); return;
    }

    // If any balance is due, a customer name is required for ledger tracking
    const isBalanceDue =
      summary.amountDue > 0 ||
      METAL_PAYMENT_TYPES.some((mt) => (summary.metalDueUnsettled?.[mt] || 0) > 0);
    if (isBalanceDue && !selectedCustomer && !customerName.trim()) {
      showToast("Please add the customer's name — there's a balance due and it needs to be tracked in the ledger.", "error");
      return;
    }

    const cleanedPaymentEntries = paymentEntries
      .map((entry) => {
        if (entry.payment_type === "Metal") {
          const weight = parseFloat(entry.weight) || 0;
          if (weight <= 0) return null;
          return {
            payment_type: "Metal",
            metal_type: entry.metal_type || "Gold 24K",
            weight,
            purity: (entry.purity || "").trim(),
            reference_rate: parseFloat(entry.reference_rate) || 0,
          };
        }

        const amount = parseFloat(entry.amount) || 0;
        if (amount <= 0) return null;
        return {
          payment_type: entry.payment_type || "Cash",
          amount,
        };
      })
      .filter(Boolean);

    const payload = {
      ob_no: parseInt(obNo, 10), date: formDate, product, products: selectedProducts,
      customer_id: selectedCustomer?.id || null,
      customer_name: customerName.trim(), customer_phone: customerPhone.trim(),
      customer_address: customerAddress.trim(), customer_city: "", customer_type: customerType,
      payment_entries: cleanedPaymentEntries,
      settlement_rates: normalizeSettlementRates(settlementRates),
      discount: parseFloat(discount) || 0,
      items: nonZeroItems,
    };

    setSaving(true);
    try {
      let saved;
      if (editBill) {
        saved = await updateOrderBill(editBill.id, payload);
        showToast("Estimate updated");
      } else {
        saved = await createOrderBill(payload);
        showToast("Estimate created");
      }
      markDirty(["inventory", "ledger", "customers", "estimates", "dashboard"]);
      setSelectedDate(payload.date);
      await loadBills(payload.date);
      if (andPrint) {
        const fullSaved = await getOrderBill(saved?.id || editBill?.id);
        setPrintBill(fullSaved);
        setView("print");
      } else {
        setView("list");
      }
    } catch (error) {
      showToast(error?.response?.data?.message || error?.message || "Failed to save estimate", "error");
    } finally {
      setSaving(false);
    }
  }, [customerAddress, customerName, customerPhone, customerType, discount, editBill, formDate, items, loadBills, obNo, paymentEntries, product, selectedCustomer, selectedProducts, settlementRates, showToast, stockValidation.items.length, stockValidation.valid, markDirty, summary.amountDue, summary.metalDueUnsettled]);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteOrderBill(id);
      setDeleteConfirm(null);
      showToast("Estimate deleted");
      markDirty(["inventory", "ledger", "customers", "estimates", "dashboard"]);
      await loadBills();
    } catch (error) {
      showToast(error?.message || "Failed to delete estimate", "error");
    }
  }, [loadBills, showToast, markDirty]);

// --- State ---
  // PRINT VIEW
// --- State ---
  if (view === "print" && printBill) {
    return <PrintView bill={printBill} onClose={() => { setPrintBill(null); setView("list"); }} />;
  }

// --- State ---
  // LOADING
// --- State ---
  if (initializing && view === "list") {
    return (
      <div className="flex items-center justify-center min-h-[360px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-500">Loading estimate module...</p>
        </div>
      </div>
    );
  }

// --- State ---
  // LIST VIEW
// --- State ---
  if (view === "list") {
    return (
      <div className="space-y-5">
        <Toast toast={toast} onClose={() => setToast((c) => ({ ...c, show: false }))} />
        <EstimateViewModal
          bill={viewBill}
          onClose={() => setViewBill(null)}
          onEdit={(bill) => {
            setViewBill(null);
            openEdit(bill);
          }}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
              <FileText className="text-white" size={19} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">Estimates</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {bills.length} estimate{bills.length !== 1 ? "s" : ""}  ·  customer order tracking
              </p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-colors flex-shrink-0"
          >
            <Plus size={16} /> New Estimate
          </button>
        </div>

        {/* Stats bar */}
        {(!listLoading || bills.length > 0) && bills.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Estimates", value: listStats.total, color: "indigo" },
              { label: "Total Value",     value: fmtMoney(listStats.totalValue),   color: "violet" },
              { label: "Pending Balance", value: fmtMoney(listStats.totalPending), color: "rose"   },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-base font-black text-${color}-600`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Date + Search + Sort */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate((current) => shiftDate(current, -1))}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
                aria-label="Previous date"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setDateInputValue(val);
                  // Debounce: only commit to selectedDate once the user stops typing
                  // (also fires immediately when using the browser date-picker)
                  clearTimeout(dateDebounceRef.current);
                  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                    dateDebounceRef.current = setTimeout(() => setSelectedDate(val), 300);
                  }
                }}
                onBlur={(e) => {
                  // Commit on blur in case debounce hasn't fired yet
                  const val = e.target.value;
                  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val) && val !== selectedDate) {
                    clearTimeout(dateDebounceRef.current);
                    setSelectedDate(val);
                  }
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 font-semibold text-slate-700"
              />
              <button
                onClick={() => setSelectedDate((current) => shiftDate(current, 1))}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
                aria-label="Next date"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
              <span>{fmtDate(selectedDate)}</span>
              {listLoading && (
                <div className="w-3.5 h-3.5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search by estimate no., customer name..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 placeholder:text-slate-400"
              />
              {listSearch && (
                <button onClick={() => setListSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SortAsc size={14} className="text-slate-400 flex-shrink-0" />
              <select
                value={listSort}
                onChange={(e) => setListSort(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 text-slate-600 font-semibold"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table — always rendered; date changes show inline spinner, no full-page flash */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-opacity duration-150 ${listLoading && bills.length > 0 ? "opacity-60 pointer-events-none" : ""}`}>
          {listLoading && bills.length === 0 ? (
            // First-time load: compact spinner
            <div className="flex items-center justify-center gap-3 py-14">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-400">Loading…</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="text-left px-4 py-3 font-black">No. / Date</th>
                      <th className="text-left px-4 py-3 font-black">Customer</th>
                      <th className="text-right px-4 py-3 font-black">Total</th>
                      <th className="text-right px-4 py-3 font-black">Cash Paid / Metal</th>
                      <th className="text-right px-4 py-3 font-black">Balance</th>
                      <th className="text-center px-3 py-3 font-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-16">
                          <div className="flex flex-col items-center justify-center gap-4 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                              <FileText size={28} className="text-slate-300" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-500">
                                {listSearch ? "No estimates match your search" : `No estimates for ${fmtDate(selectedDate)}`}
                              </p>
                              <p className="text-sm text-slate-400 mt-1">
                                {listSearch ? "Try a different search term." : "Nothing created on this date yet."}
                              </p>
                            </div>
                            {listSearch ? (
                              <button onClick={() => setListSearch("")} className="text-xs text-indigo-600 font-bold hover:underline">
                                Clear search
                              </button>
                            ) : (
                              <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
                                <Plus size={14} /> New Estimate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      pagedBills.map((bill) => {
                        const hasRefund  = parseFloat(bill.refund_due) > 0;
                        const hasPending = parseFloat(bill.amt_baki) > 0;
                        const metals     = parseProducts(bill.products);

                        // Metal received as payment on this estimate (from legacy columns)
                        const metalReceivedBadges = [
                          (parseFloat(bill.fine_jama)     || 0) > 0 ? `24K ${fmt(bill.fine_jama, 4)}g`     : null,
                          (parseFloat(bill.jama_gold_22k) || 0) > 0 ? `22K ${fmt(bill.jama_gold_22k, 4)}g` : null,
                          (parseFloat(bill.jama_silver)   || 0) > 0 ? `Ag ${fmt(bill.jama_silver, 4)}g`    : null,
                        ].filter(Boolean);

                        // Unsettled metal still owed by customer
                        const metalDueUnsettled = bill.balance_snapshot?.metal_due_unsettled || {};
                        const metalDueBadges = [
                          (parseFloat(metalDueUnsettled["Gold 24K"]) || 0) > 0 ? `24K ${fmt(metalDueUnsettled["Gold 24K"], 4)}g` : null,
                          (parseFloat(metalDueUnsettled["Gold 22K"]) || 0) > 0 ? `22K ${fmt(metalDueUnsettled["Gold 22K"], 4)}g` : null,
                          (parseFloat(metalDueUnsettled["Silver"])   || 0) > 0 ? `Ag ${fmt(metalDueUnsettled["Silver"], 4)}g`    : null,
                        ].filter(Boolean);

                        // Payment mode badge colour
                        const pmClass = {
                          "Cash":       "bg-emerald-100 text-emerald-700",
                          "Bank / UPI": "bg-blue-100 text-blue-600",
                          "Metal":      "bg-amber-100 text-amber-700",
                          "Mixed":      "bg-violet-100 text-violet-700",
                          "Unpaid":     "bg-slate-100 text-slate-400",
                        }[bill.payment_mode] || "bg-slate-100 text-slate-400";

                        return (
                          <tr
                            key={bill.id}
                            className="border-b border-slate-100 last:border-b-0 hover:bg-indigo-50/30 transition-colors align-middle"
                          >
                            {/* No. + date + metal types + payment mode */}
                            <td className="px-4 py-3 w-32">
                              <button
                                type="button"
                                onClick={() => openView(bill)}
                                className="font-black text-indigo-600 text-sm hover:text-indigo-800 hover:underline leading-tight"
                              >
                                #{bill.ob_no}
                              </button>
                              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{fmtDate(bill.date)}</p>
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {metals.map((mt) => (
                                  <span key={mt} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">{mt}</span>
                                ))}
                              </div>
                              {bill.payment_mode && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full mt-1 inline-block ${pmClass}`}>
                                  {bill.payment_mode}
                                </span>
                              )}
                            </td>

                            {/* Customer */}
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800 text-sm leading-tight">{bill.customer_name || "Walk-in"}</p>
                              {bill.customer_phone && (
                                <p className="text-[11px] text-slate-400 mt-0.5">{bill.customer_phone}</p>
                              )}
                              {bill.customer_type && bill.customer_type !== "Retail" && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 mt-1 inline-block">{bill.customer_type}</span>
                              )}
                            </td>

                            {/* Total */}
                            <td className="px-4 py-3 text-right">
                              <p className="font-black text-slate-800 text-sm">
                                {fmtMoney(bill.total_amount != null && parseFloat(bill.total_amount) > 0 ? bill.total_amount : bill.subtotal)}
                              </p>
                              {parseFloat(bill.discount) > 0 && (
                                <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">-{fmtMoney(bill.discount)} disc.</p>
                              )}
                            </td>

                            {/* Paid — cash amount + metal received badges */}
                            <td className="px-4 py-3 text-right">
                              <span className="font-semibold text-emerald-700 text-sm">{fmtMoney(bill.amt_jama)}</span>
                              {metalReceivedBadges.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-0.5 mt-1">
                                  {metalReceivedBadges.map((badge) => (
                                    <span key={badge} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                      {badge}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Remaining — cash balance + unsettled metal due */}
                            <td className="px-4 py-3 text-right">
                              {hasRefund ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">
                                  <TrendingUp size={9} /> Refund {fmtMoney(bill.refund_due)}
                                </span>
                              ) : hasPending ? (
                                <span className="font-black text-rose-600 text-sm">{fmtMoney(bill.amt_baki)}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-500">
                                  <CheckCircle size={9} /> Settled
                                </span>
                              )}
                              {metalDueBadges.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-0.5 mt-1">
                                  {metalDueBadges.map((badge) => (
                                    <span key={badge} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 whitespace-nowrap">
                                      {badge} owed
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => openView(bill)} title="View"
                                  className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                                  <Eye size={14} />
                                </button>
                                <button onClick={() => openEdit(bill)} title="Edit"
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={async () => { const full = await getOrderBill(bill.id); setPrintBill(full); setView("print"); }}
                                  title="Print"
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  <Printer size={14} />
                                </button>
                                <button onClick={() => setDeleteConfirm(bill.id)} title="Delete"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredBills.length > 0 && (
                <Pagination
                  page={listPage}
                  totalPages={totalBillPages}
                  onChange={setListPage}
                  label={`Showing ${(listPage - 1) * BILLS_PER_PAGE + 1}-${Math.min(listPage * BILLS_PER_PAGE, filteredBills.length)} of ${filteredBills.length}`}
                />
              )}
            </>
          )}
        </div>

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-rose-600" />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-1 text-center">Delete estimate?</h3>
              <p className="text-sm text-slate-500 mb-5 text-center">This will also reverse all ledger entries. This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

// --- State ---
  // FORM VIEW
// --- State ---

  // Collect all PCS input keys (for keyboard navigation)
  const allPcsKeys = items.map((item) => itemKey(item.metal_type, item.category, item.size_label));

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={() => setToast((c) => ({ ...c, show: false }))} />

      {/* Form header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-2 rounded-xl hover:border-indigo-200 transition-colors"
        >
          <ArrowLeft size={15} /> Estimates
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <FileText size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 leading-tight">
              {editBill ? `Edit Estimate #${obNo}` : "New Estimate"}
            </h1>
            <p className="text-xs text-slate-400">Labour charges auto-filled from Admin settings</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Left column Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="space-y-4">

          {/* Section 1: Estimate Details — compact single-row header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Date — primary, always visible */}
              <div className="flex-shrink-0">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Date</label>
                <input
                  type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 font-semibold text-slate-700"
                />
              </div>

              {/* Product description — grows to fill space */}
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Product / Description <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. Necklace set, Bangles, Ring..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                />
              </div>

              {/* Estimate No — secondary, tucked at end */}
              <div className="flex-shrink-0">
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Bill No.</label>
                <input
                  type="number" min="1" value={obNo} onChange={(e) => setObNo(e.target.value)}
                  className="w-20 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 text-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Customer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <SectionHeader step="2" title="Customer" subtitle="Search by name or phone — or just type in the customer's name below." />

            {/* Selected customer chip */}
            {selectedCustomer && (
              <div className="mb-3 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <div>
                  <p className="font-black text-indigo-800 text-sm">{selectedCustomer.party_name}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">{selectedCustomer.phone_no || "No phone"}  ·  {selectedCustomer.customer_type}</p>
                </div>
                <button
                  onClick={() => { setSelectedCustomer(null); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setShowCustomerDetails(false); }}
                  className="text-indigo-400 hover:text-rose-600 transition-colors p-1"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Search */}
            <CustomerLookup
              key={selectedCustomer?.id || "new-customer"}
              selectedCustomer={selectedCustomer}
              onSelect={(c) => {
                setSelectedCustomer(c);
                setCustomerName(c.party_name || "");
                setCustomerPhone(c.phone_no || "");
                setCustomerAddress(c.address || "");
                setCustomerType(c.customer_type || "Retail");
                setShowCustomerDetails(!!(c.phone_no || c.address));
              }}
              onClear={() => {
                setSelectedCustomer(null);
                setCustomerName(""); setCustomerPhone(""); setCustomerAddress("");
                setShowCustomerDetails(false);
              }}
            />

            {/* Name + Type row — always visible */}
            <div className="flex flex-col sm:flex-row gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Name</label>
                <input
                  type="text" value={customerName}
                  onChange={(e) => { setSelectedCustomer(null); setCustomerName(e.target.value); }}
                  placeholder="Customer name"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                />
              </div>
              <div className="flex-shrink-0">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Type</label>
                <div className="flex gap-1.5">
                  {CUSTOMER_TYPES.map((type) => (
                    <button
                      key={type} type="button" onClick={() => handleCustomerTypeChange(type)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${
                        customerType === type
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                    >{type}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Balance-due nudge: show when items entered, balance owed, no customer yet */}
            {summary.totalPcs > 0 && (() => {
              const hasDue =
                summary.amountDue > 0 ||
                METAL_PAYMENT_TYPES.some((mt) => (summary.metalDueUnsettled?.[mt] || 0) > 0);
              if (!hasDue || selectedCustomer || customerName.trim()) return null;
              return (
                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-semibold leading-snug">
                    Balance is due — add the customer's name above so this can be tracked in their ledger.
                  </p>
                </div>
              );
            })()}

            {/* Expandable: Phone + Address */}
            {!showCustomerDetails ? (
              <button
                type="button"
                onClick={() => setShowCustomerDetails(true)}
                className="mt-2 text-xs text-indigo-500 font-bold hover:text-indigo-700 flex items-center gap-1 transition-colors"
              >
                <Plus size={11} /> Add phone / address
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Phone</label>
                  <input
                    type="text" value={customerPhone}
                    onChange={(e) => { setSelectedCustomer(null); setCustomerPhone(e.target.value); }}
                    placeholder="Phone number"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Address</label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => { setSelectedCustomer(null); setCustomerAddress(e.target.value); }}
                    rows={2} placeholder="Customer address"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setShowCustomerDetails(false); setCustomerPhone(""); setCustomerAddress(""); }}
                  className="text-xs text-slate-400 font-semibold hover:text-rose-500 transition-colors"
                >
                  Remove phone / address
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Metal Types */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <SectionHeader step="3" title="Metal Types" subtitle="Which metal is the customer ordering in?" />
            <div className="flex gap-2 flex-wrap">
              {METAL_TYPES.map((metalType) => {
                const selected = selectedProducts.includes(metalType);
                return (
                  <button
                    key={metalType} type="button" onClick={() => handleProductToggle(metalType)}
                    className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${
                      selected
                        ? "bg-amber-50 border-amber-400 text-amber-800 shadow-sm"
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {metalType}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Items per metal */}
          {selectedProducts.map((metalType) => {
            const categories = groupedCharges?.[metalType] || {};
            return (
              <div key={metalType} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0"></div>
                    <h3 className="font-black text-slate-800">{metalType}</h3>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">
                    {items.filter((i) => i.metal_type === metalType).reduce((s, i) => s + (parseInt(i.pcs, 10) || 0), 0)} pcs total
                  </p>
                </div>

                {Object.keys(categories).length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-400">
                    No categories configured for {metalType}. Add them in Admin / Labour Charges.
                  </div>
                ) : (
                  <div className="p-3">
                  <div className="space-y-3 max-w-2xl">
                    {Object.entries(categories).map(([category, sizeRows]) => {
                      const categoryItems = items.filter((i) => i.metal_type === metalType && i.category === category);
                      const catTotals = categoryItems.reduce(
                        (acc, item) => {
                          const pcs = parseInt(item.pcs, 10) || 0;
                          return {
                            pcs:    acc.pcs + pcs,
                            weight: acc.weight + (parseFloat(item.size_value) || 0) * pcs,
                            labour: acc.labour + (parseFloat(item.lc_pp) || 0) * pcs,
                          };
                        },
                        { pcs: 0, weight: 0, labour: 0 }
                      );

                      return (
                        <div key={`${metalType}-${category}`} className="border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <p className="font-black text-slate-700 text-sm">{category}</p>
                            {catTotals.pcs > 0 && (
                              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                                <span className="text-indigo-600 font-black">{catTotals.pcs} pcs</span>
                                <span>{fmt(catTotals.weight, 3)}g</span>
                                <span>{fmtMoney(catTotals.labour)}</span>
                              </div>
                            )}
                          </div>
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col style={{width:"32%"}} />
                              <col style={{width:"16%"}} />
                              <col style={{width:"12%"}} />
                              <col style={{width:"18%"}} />
                              <col style={{width:"22%"}} />
                            </colgroup>
                              <thead>
                                <tr className="uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-white">
                                  <th className="text-left px-3 py-2 font-black text-[10px]">Size</th>
                                  <th className="text-right px-3 py-2 font-black text-[10px]">LC/pc</th>
                                  <th className="text-center px-2 py-2 font-black text-[10px] w-16">Qty</th>
                                  <th className="text-right px-3 py-2 font-black text-[10px]">Wt (g)</th>
                                  <th className="text-right px-3 py-2 font-black text-[10px]">Labour</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(sizeRows || []).map((row) => {
                                  const currentItem = categoryItems.find((i) => i.size_label === row.size_label) || null;
                                  const pcs         = parseInt(currentItem?.pcs, 10) || 0;
                                  const sizeValue   = parseFloat(currentItem?.size_value ?? row.size_value) || 0;
                                  const weight      = parseFloat((sizeValue * pcs).toFixed(4));
                                  const totalLabour = parseFloat(((parseFloat(currentItem?.lc_pp) || 0) * pcs).toFixed(2));
                                  const key         = itemKey(metalType, category, row.size_label);
                                  const normalizedSL = normalizeEstimateSizeLabel(metalType, row.size_label);
                                  const validation  = stockValidationMap.get(`${metalType}::${normalizedSL}`);
                                  const isActive    = pcs > 0;
                                  const globalIndex = allPcsKeys.indexOf(key);

                                  return (
                                    <tr
                                      key={key}
                                      className={`border-b border-slate-100 last:border-b-0 transition-colors ${
                                        isActive ? "bg-indigo-50/50" : "hover:bg-slate-50/60"
                                      }`}
                                    >
                                      {/* Size + stock info */}
                                      <td className="px-3 py-2">
                                        <p className={`font-semibold text-sm ${isActive ? "text-indigo-700" : "text-slate-700"}`}>
                                          {row.size_label}
                                        </p>
                                        {validation !== undefined && (
                                          <p className={`text-[10px] font-bold mt-0.5 ${
                                            !validation.valid
                                              ? "text-rose-600"
                                              : (validation.available_pieces || 0) === 0
                                                ? "text-slate-400"
                                                : "text-emerald-600"
                                          }`}>
                                            {!validation.valid
                                              ? `Only ${validation.available_pieces} avail.`
                                              : (validation.available_pieces || 0) === 0
                                                ? "Not in stock"
                                                : `${validation.available_pieces} in stock`}
                                          </p>
                                        )}
                                      </td>

                                      <td className="px-4 py-2.5 text-right font-mono text-slate-500 text-xs">
                                        {row.size_value != null ? fmt(row.size_value, 3) : "-"}
                                      </td>

                                      {/* LC/pc */}
                                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">
                                        {fmt(currentItem?.lc_pp || getRateForCustomerType(row, customerType), 0)}
                                      </td>

                                      {/* PCS input */}
                                      <td className="px-2 py-2 text-center">
                                        <input
                                          ref={(el) => { if (el) pcsInputRefs.current[key] = el; }}
                                          type="number" min="0" step="1"
                                          value={currentItem?.pcs || ""}
                                          onChange={(e) => updatePieces(key, e.target.value)}
                                          onKeyDown={(e) => handlePcsKeyDown(e, allPcsKeys, globalIndex)}
                                          className={`w-14 text-center text-sm border rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-2 transition-colors ${
                                            validation && !validation.valid
                                              ? "border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-300"
                                              : isActive
                                                ? "border-indigo-300 bg-white text-indigo-700 font-bold focus:ring-indigo-300"
                                                : "border-slate-200 bg-slate-50 focus:ring-indigo-300"
                                          }`}
                                          placeholder="0"
                                        />
                                      </td>

                                      {/* Weight */}
                                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                                        {isActive ? fmt(weight, 4) : <span className="text-slate-300">-</span>}
                                      </td>

                                      {/* T. LC */}
                                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                                        {isActive ? (
                                          <span className="font-bold text-slate-800">{fmt(totalLabour, 0)}</span>
                                        ) : <span className="text-slate-300">-</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                )}
              </div>
            );
          })}

        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Right column: sticky summary Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="xl:sticky xl:top-4 space-y-4 h-fit">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Summary header */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
              <h2 className="font-black text-slate-800 text-sm">Estimate Summary</h2>
              {summary.totalPcs > 0 && (
                <p className="text-xs text-indigo-500 font-semibold mt-0.5">{summary.totalPcs} pcs  ·  {fmt(summary.totalWeight, 4)}g</p>
              )}
            </div>

            <div className="px-5 py-4 space-y-2.5">

              {/* ── Payment Status Badge (checkout-style) ── */}
              {summary.totalPcs > 0 && (() => {
                const isFullyPaid = summary.amountDue === 0 && summary.amountGiven === 0 && summary.refundDue === 0 &&
                  !Object.values(summary.metalDueUnsettled || {}).some((v) => v > 0);
                const hasRefund   = summary.refundDue > 0 || summary.amountGiven > 0;
                const isPartial   = !isFullyPaid && !hasRefund && summary.moneyPaid > 0;

                const cfg = isFullyPaid
                  ? { bg: "bg-emerald-50", border: "border-emerald-200", label: "✓ Fully Paid",   labelCls: "text-emerald-700",  sub: "All settled" }
                  : hasRefund
                  ? { bg: "bg-amber-50",   border: "border-amber-200",   label: "↩ Return to Customer", labelCls: "text-amber-700",    sub: `Give back ${fmtMoney(summary.amountGiven || summary.refundDue)}` }
                  : isPartial
                  ? { bg: "bg-blue-50",    border: "border-blue-200",    label: "⏳ Partial",       labelCls: "text-blue-700",     sub: `${fmtMoney(summary.moneyPaid)} paid` }
                  : { bg: "bg-rose-50",    border: "border-rose-200",    label: "⬤ Payment Due",   labelCls: "text-rose-700",     sub: "Nothing received yet" };

                return (
                  <div className={`rounded-xl border ${cfg.bg} ${cfg.border} px-4 py-3`}>
                    {/* 3-column checkout readout */}
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total</p>
                        <p className="text-sm font-black text-slate-800 mt-0.5">{fmtMoney(summary.totalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Paid</p>
                        <p className="text-sm font-black text-emerald-600 mt-0.5">{fmtMoney(summary.moneyPaid)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          {hasRefund ? "Return" : "Remaining"}
                        </p>
                        <p className={`text-sm font-black mt-0.5 ${isFullyPaid ? "text-emerald-600" : hasRefund ? "text-amber-600" : "text-rose-600"}`}>
                          {isFullyPaid
                            ? fmtMoney(0)
                            : hasRefund
                              ? fmtMoney(summary.amountGiven || summary.refundDue)
                              : fmtMoney(summary.amountDue)}
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {summary.totalAmount > 0 && (
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all ${isFullyPaid ? "bg-emerald-500" : isPartial ? "bg-blue-500" : "bg-slate-300"}`}
                          style={{ width: `${Math.min(100, (summary.moneyPaid / summary.totalAmount) * 100)}%` }}
                        />
                      </div>
                    )}
                    <p className={`text-xs font-black text-center ${cfg.labelCls}`}>{cfg.label}</p>
                  </div>
                );
              })()}

              {/* Stock validation status */}
              {validatingStock ? (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border bg-slate-50 border-slate-200 text-xs font-bold text-slate-500">
                  <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                  Validating stock...
                </div>
              ) : stockValidation.items.length > 0 && !stockValidation.valid ? (
                <div className="rounded-xl px-3 py-2.5 border bg-rose-50 border-rose-200 text-xs text-rose-700">
                  <p className="font-black">Insufficient stock</p>
                  <p className="mt-0.5">Reduce PCS or replenish counter stock.</p>
                </div>
              ) : stockValidation.items.length > 0 ? (
                <div className="rounded-xl px-3 py-2.5 border bg-emerald-50 border-emerald-200 text-xs font-bold text-emerald-700">
                  ✓ All sizes available in stock
                </div>
              ) : null}

              {/* Labour total */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Labour Charges</span>
                <span className="font-bold text-slate-800">{fmtMoney(summary.labourTotal)}</span>
              </div>

              {/* Per-metal breakdown — Rate/10g inputs removed (now in Payment section) */}
              {Object.entries(summary.requiredMetal || {}).some(([mt, w]) =>
                (w || 0) > 0 || (summary.metalReceived?.[mt] || 0) > 0
              ) && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  {Object.entries(summary.requiredMetal).map(([mt, w]) => {
                    const metalGiven    = summary.metalReceived?.[mt] || 0;
                    const metalDueUns   = summary.metalDueUnsettled?.[mt] || 0;
                    const metalSettled  = summary.metalShortfallSettled?.[mt] || 0;
                    const metalExcess   = summary.metalCredit?.[mt] || 0;
                    const shortfallVal  = summary.metalValueDue?.[mt] || 0;
                    const excessCredit  = summary.metalValueCredit?.[mt] || 0;
                    if ((w || 0) === 0 && metalGiven === 0) return null;
                    return (
                      <div key={mt} className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{mt}</p>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Metal Needed</span>
                          <span className="font-bold text-slate-700">{fmt(w, 4)}g</span>
                        </div>
                        {metalGiven > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Received</span>
                            <span className="font-bold text-slate-700">{fmt(metalGiven, 4)}g</span>
                          </div>
                        )}
                        {metalDueUns > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Still Owed</span>
                            <span className="font-bold text-rose-600">{fmt(metalDueUns, 4)}g</span>
                          </div>
                        )}
                        {metalSettled > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-amber-600 italic">&#8627; Paid in Cash</span>
                            <span className="font-bold text-amber-600">{fmt(metalSettled, 4)}g</span>
                          </div>
                        )}
                        {metalExcess > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Extra Metal</span>
                            <span className="font-bold text-emerald-600">{fmt(metalExcess, 4)}g</span>
                          </div>
                        )}
                        {/* Rate display-only (input has moved to Payment section) */}
                        {summary.settlementRate?.[mt] > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Rate / 10g</span>
                            <span className="font-bold text-slate-600">{fmtMoney(summary.settlementRate[mt])}</span>
                          </div>
                        )}
                        {shortfallVal > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Cash Value Due</span>
                            <span className="font-bold text-slate-700">{fmtMoney(shortfallVal)}</span>
                          </div>
                        )}
                        {excessCredit > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Extra Metal Value</span>
                            <span className="font-bold text-emerald-700">{fmtMoney(excessCredit)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(summary.totalMetalValueDue || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Cash for Metal</span>
                  <span className="font-bold text-slate-800">{fmtMoney(summary.totalMetalValueDue)}</span>
                </div>
              )}

              {(summary.totalMetalValueCredit || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Extra Metal Value</span>
                  <span className="font-bold text-emerald-700">{fmtMoney(summary.totalMetalValueCredit)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-600 font-semibold">Subtotal</span>
                <span className="font-bold text-slate-800">{fmtMoney(summary.subtotal)}</span>
              </div>

              {/* Discount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Discount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">Rs.</span>
                  <input
                    type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                    placeholder="0.00"
                  />
                </div>
                {summary.discount > 0 && (
                  <p className="flex justify-between text-xs text-emerald-700 font-semibold mt-1">
                    <span>Discount</span><span>- {fmtMoney(summary.discount)}</span>
                  </p>
                )}
              </div>

              {/* Final Payable */}
              <div className="flex justify-between items-center bg-indigo-50 rounded-xl px-3 py-2.5">
                <span className="font-black text-indigo-800">Final Payable</span>
                <span className="font-black text-indigo-800 text-base">{fmtMoney(summary.totalAmount)}</span>
              </div>

              {/* ── Payment Received — integrated into summary ── */}
              <div className="border-t-2 border-dashed border-slate-200 pt-3 mt-1 space-y-2">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  💰 How did the customer pay?
                </p>

                {/* Metal rate strip — only when items have qty */}
                {items.some((item) => (parseInt(item.pcs, 10) || 0) > 0) &&
                 selectedProducts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 space-y-1.5">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Gold / Silver Rate per 10g</p>
                    {selectedProducts.map((mt) => (
                      <div key={mt} className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-amber-600 w-16 shrink-0">{mt}</span>
                        <input
                          type="number" min="0" step="1"
                          value={settlementRates?.[mt] || ""}
                          onChange={(e) => updateSettlementRate(mt, e.target.value)}
                          className="flex-1 px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          placeholder="Rate / 10g"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment entries */}
                <div className="space-y-2">
                  {paymentEntries.map((entry, index) => {
                    const isMetal = entry.payment_type === "Metal";
                    return (
                      <div key={`payment-entry-${index}`}
                        className={`rounded-xl border p-3 transition-colors ${isMetal ? "bg-amber-50/60 border-amber-200" : "bg-slate-50 border-slate-200"}`}
                      >
                        {/* Type pills + amount */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex gap-1 shrink-0">
                            {["Cash", "Bank / UPI", "Metal"].map((type) => (
                              <button
                                key={type} type="button"
                                onClick={() => updatePaymentEntry(index, "payment_type", type)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black border-2 transition-all ${
                                  entry.payment_type === type
                                    ? type === "Metal"
                                      ? "bg-amber-500 border-amber-500 text-white"
                                      : "bg-indigo-600 border-indigo-600 text-white"
                                    : "bg-white border-slate-200 text-slate-400 hover:border-indigo-300"
                                }`}
                              >{type}</button>
                            ))}
                          </div>
                          {!isMetal ? (
                            <div className="relative flex-1 min-w-[80px]">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">₹</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={entry.amount || ""}
                                onChange={(e) => updatePaymentEntry(index, "amount", e.target.value)}
                                className="w-full pl-5 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white font-semibold"
                                placeholder="0.00"
                                autoComplete="off"
                              />
                            </div>
                          ) : (
                            <select
                              value={entry.metal_type}
                              onChange={(e) => updatePaymentEntry(index, "metal_type", e.target.value)}
                              className="flex-1 min-w-[80px] px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white font-semibold text-amber-800"
                            >
                              {METAL_TYPES.map((mt) => (
                                <option key={mt} value={mt}>{mt}</option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => removePaymentEntry(index)}
                            disabled={paymentEntries.length <= 1}
                            className="p-1 text-slate-300 hover:text-rose-500 rounded-lg transition-colors disabled:opacity-20 shrink-0"
                          ><X size={13} /></button>
                        </div>

                        {/* Metal details row */}
                        {isMetal && (
                          <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-amber-200">
                            <div>
                              <p className="text-[9px] font-black text-amber-600 mb-1">Weight (g)</p>
                              <input type="number" min="0" step="0.001"
                                value={entry.weight || ""}
                                onChange={(e) => updatePaymentEntry(index, "weight", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white font-semibold"
                                placeholder="0.000"
                              />
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-amber-600 mb-1">Purity</p>
                              <input type="text"
                                value={entry.purity || ""}
                                onChange={(e) => updatePaymentEntry(index, "purity", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                                placeholder="99.99"
                              />
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-amber-600 mb-1">Rate / 10g</p>
                              <input type="number" min="0" step="1"
                                value={entry.reference_rate || ""}
                                onChange={(e) => updatePaymentEntry(index, "reference_rate", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                                placeholder="opt."
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addPaymentEntry}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 py-1.5 px-1 transition-colors"
                  >
                    <Plus size={11} /> Add payment method
                  </button>
                </div>
              </div>

              {/* Money received */}
              <div className="rounded-xl px-3 py-2.5 border bg-slate-50 border-slate-200 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Total Paid So Far</span>
                <span className="text-sm font-black text-slate-800">{fmtMoney(summary.moneyPaid)}</span>
              </div>

              {/* Settlement outcome — mutually exclusive */}
              {summary.amountGiven > 0 ? (
                <div className="rounded-xl px-3 py-2.5 border bg-amber-50 border-amber-200 flex justify-between items-center">
                  <span className="text-sm font-bold text-amber-700">Amount Given to Customer</span>
                  <span className="text-sm font-black text-amber-800">{fmtMoney(summary.amountGiven)}</span>
                </div>
              ) : summary.refundDue > 0 ? (
                <>
                  <div className="rounded-xl px-3 py-2.5 border bg-emerald-50 border-emerald-200 text-emerald-800 font-black flex justify-between items-center">
                    <span>Refund Due</span>
                    <span className="text-base">{fmtMoney(summary.refundDue)}</span>
                  </div>
                  <p className="text-[11px] text-emerald-600 -mt-1.5 leading-relaxed">
                    Customer over-paid by {fmtMoney(summary.refundDue)}. Adjust accordingly.
                  </p>
                </>
              ) : (
                <div className={`rounded-xl px-3 py-2.5 border font-black flex justify-between items-center ${
                  summary.amountDue === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}>
                  <span>Amount Still Owed</span>
                  <span className="text-base">{fmtMoney(summary.amountDue)}</span>
                </div>
              )}

              {/* OFG status */}
              <div className="rounded-xl px-3 py-2.5 border bg-slate-50 border-slate-200">
                <p className="font-black text-slate-700 text-sm">{summary.ofgStatus === "OF.G AFSL" ? "Fine Carry Forward (OF.G AFSL)" : "Order Fulfilled (OF.G HDF)"}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {summary.carryFine > 0
                    ? `Fine to carry: ${fmt(summary.carryFine, 4)}g`
                    : "No fine to carry"}
                </p>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving || validatingStock || !stockValidation.valid}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Save size={14} />
                  {saving ? "Saving..." : editBill ? "Update Estimate" : "Save Estimate"}
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || validatingStock || !stockValidation.valid}
                  className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Printer size={14} />
                  {saving ? "Saving..." : "Save & Print"}
                </button>
                <button
                  onClick={() => setView("list")}
                  disabled={saving}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Quick hint */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Quick Tips</p>
            <ul className="space-y-1.5 text-[11px] text-slate-500">
              <li>Press Enter after typing a number to jump to the next size</li>
              <li>Rows with a quantity entered will turn blue</li>
              <li>Stock is checked automatically as you type</li>
              <li>Payment status updates live in the summary panel →</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
