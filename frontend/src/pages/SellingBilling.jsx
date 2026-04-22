import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Trash2, Printer, ArrowLeft, Search, X, CheckCircle,
  AlertCircle, Edit2
} from "lucide-react";
import {
  getNextBillNo, listSellingBills, getSellingBill,
  createSellingBill, updateSellingBill, deleteSellingBill,
} from "../api/sellingBillApiService";
import { getLabourCharges } from "../api/labourChargeService";
import { getCustomers } from "../api/customerService";

// ─── Constants ────────────────────────────────────────────────────────────────

const METAL_TYPES = ["Gold 24K", "Gold 22K", "Silver"];
const CUSTOMER_TYPES = ["Wholesale", "Showroom", "Retail"];
const PURITY_FACTORS = { "99.99": 0.9999, "91.60": 0.916 };
const METAL_PURITY_OPTIONS = {
  "Gold 24K": ["99.99", "91.60"],
  "Gold 22K": ["99.99", "91.60"],
  Silver: ["99.99"],
};

const parseUnitWeight = (product) => {
  if (!product) return null;
  const t = product.trim();
  if (t === "Mix" || t === "Other" || t === "Custom") return null;
  const m = t.match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeMetalEntry = (metalType = "Gold 24K") => ({
  _key: `${Date.now()}-${Math.random()}`,
  metal_type: metalType,
  purity: metalType === "Gold 22K" ? "91.60" : "99.99",
  weight: "",
  rate: "",
});

// Given a labour_charges row and current customer type, return the appropriate tier rate.
const pickTierRate = (row, customerType) => {
  if (!row) return 0;
  if (customerType === "Wholesale") return parseFloat(row.lc_pp_wholesale) || 0;
  if (customerType === "Showroom") return parseFloat(row.lc_pp_showroom) || 0;
  return parseFloat(row.lc_pp_retail) || 0;
};

// Build a pristine item row from a labour_charges row + current tier.
// `item.category` stores the LC category (e.g. "Standard", "Bar"),
// `item.custom_label` stores the size label (e.g. "1g"),
// `item.size` stores the numeric grams/pc.
const makeItemFromLc = (lcRow, customerType, sortOrder = 0) => ({
  _key: `${Date.now()}-${Math.random()}-${sortOrder}`,
  lc_id: lcRow.id,
  metal_type: lcRow.metal_type,
  category: lcRow.category,
  custom_label: lcRow.size_label, // semantic reuse: holds the size label
  size: lcRow.size_value != null ? parseFloat(lcRow.size_value) : parseUnitWeight(lcRow.size_label),
  custom_size: "",
  pieces: "",
  lc_pp: pickTierRate(lcRow, customerType),
  sort_order: sortOrder,
});

const computeItem = (item, rate) => {
  const pieces = parseInt(item.pieces) || 0;
  const size = item.size != null ? parseFloat(item.size) : parseFloat(item.custom_size) || 0;
  const weight = parseFloat((size * pieces).toFixed(4));
  const metal_value = parseFloat((weight * (parseFloat(rate) || 0)).toFixed(2));
  const t_lc = parseFloat(((parseFloat(item.lc_pp) || 0) * pieces).toFixed(2));
  return { pieces, size: item.size != null ? item.size : (parseFloat(item.custom_size) || null), weight, metal_value, t_lc };
};

const computeTotals = (items, rates, payment) => {
  let subtotal = 0;
  let total_lc = 0;
  items.forEach((item) => {
    const { metal_value, t_lc } = computeItem(item, rates[item.metal_type] || 0);
    subtotal += metal_value;
    total_lc += t_lc;
  });
  const gross_amount = parseFloat((subtotal + total_lc).toFixed(2));
  const discount = parseFloat(payment.discount) || 0;
  const total_amount = parseFloat(Math.max(0, gross_amount - discount).toFixed(2));

  let metal_value_paid = 0;
  (payment.metal_entries || []).forEach((entry) => {
    const factor = PURITY_FACTORS[entry.purity] || 0;
    metal_value_paid += (parseFloat(entry.weight) || 0) * (parseFloat(entry.rate) || 0) * factor;
  });
  metal_value_paid = parseFloat(metal_value_paid.toFixed(2));

  const cash = parseFloat(payment.cash_amount) || 0;
  const online = parseFloat(payment.online_amount) || 0;
  const amount_paid = parseFloat((cash + online + metal_value_paid).toFixed(2));
  const outstanding = parseFloat((total_amount - amount_paid).toFixed(2));

  return { subtotal: parseFloat(subtotal.toFixed(2)), total_lc: parseFloat(total_lc.toFixed(2)), gross_amount, discount, total_amount, metal_value_paid, amount_paid, outstanding };
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

// ─── Customer Search Dropdown ─────────────────────────────────────────────────

const CustomerSearch = ({ value, onSelect, onWalkIn }) => {
  const [query, setQuery] = useState(value?.party_name || "");
  const [prevValue, setPrevValue] = useState(value);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef(null);
  const containerRef = useRef(null);

  // Derived reset: if parent-controlled `value` changes, sync the local query.
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value?.party_name || "");
  }

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q) => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const resp = await getCustomers(q.trim());
        setResults(resp?.data || resp || []);
        setOpen(true);
      } catch { setResults([]); }
    }, 300);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            onFocus={() => { if (results.length) setOpen(true); }}
            placeholder="Search customer by name / phone…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        {value && (
          <button onClick={() => { onWalkIn(); setQuery(""); setResults([]); setOpen(false); }}
            className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} onClick={() => { onSelect(c); setQuery(c.party_name); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
              <p className="text-sm font-bold text-slate-800">{c.party_name}</p>
              <p className="text-xs text-slate-500">{c.firm_name} · {c.phone_no} · <span className={`font-semibold ${c.customer_type === 'Wholesale' ? 'text-blue-600' : c.customer_type === 'Showroom' ? 'text-purple-600' : 'text-slate-500'}`}>{c.customer_type || 'Retail'}</span></p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Print View ───────────────────────────────────────────────────────────────

const PrintView = ({ bill, onClose }) => {
  useEffect(() => { setTimeout(() => window.print(), 200); }, []);
  const includeLC = bill.customer_type !== "Retail";
  const itemsByMetal = METAL_TYPES.reduce((acc, mt) => {
    const its = (bill.items || []).filter((i) => i.metal_type === mt);
    if (its.length) acc[mt] = its;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-white p-8 print:p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-6 print:hidden">
          <button onClick={onClose} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg bg-slate-100 hover:bg-indigo-50 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors">
            <Printer size={16} /> Print
          </button>
        </div>

        {/* Bill Header */}
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">JEWEL POS</h1>
          <p className="text-xs text-slate-500">Selling Counter Bill</p>
        </div>
        <div className="flex justify-between text-sm mb-4">
          <div>
            <p className="font-bold text-slate-800">Bill No.: {bill.bill_no}</p>
            <p className="text-slate-600">Date: {bill.date}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-800">{bill.customer_name || "Walk-in Customer"}</p>
            {bill.customer_type && <p className="text-xs text-slate-500">{bill.customer_type}</p>}
          </div>
        </div>

        {/* Items per metal */}
        {Object.entries(itemsByMetal).map(([mt, its]) => (
          <div key={mt} className="mb-4">
            <h3 className="font-black text-slate-700 text-sm mb-1 uppercase tracking-wider">{mt}</h3>
            <table className="w-full text-xs border border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 px-2 py-1 text-left">Category</th>
                  <th className="border border-slate-200 px-2 py-1 text-center">Pcs</th>
                  <th className="border border-slate-200 px-2 py-1 text-right">Weight (g)</th>
                  <th className="border border-slate-200 px-2 py-1 text-right">Rate/g</th>
                  <th className="border border-slate-200 px-2 py-1 text-right">Metal Value</th>
                  {includeLC && <th className="border border-slate-200 px-2 py-1 text-right">LC/Pc</th>}
                  {includeLC && <th className="border border-slate-200 px-2 py-1 text-right">T.LC</th>}
                </tr>
              </thead>
              <tbody>
                {its.map((item, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-2 py-1">{item.custom_label || item.category}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{item.pieces}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">{fmt(item.weight, 4)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">₹{fmt(item.rate_per_gram)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">₹{fmt(item.metal_value)}</td>
                    {includeLC && <td className="border border-slate-200 px-2 py-1 text-right">₹{fmt(item.lc_pp)}</td>}
                    {includeLC && <td className="border border-slate-200 px-2 py-1 text-right">₹{fmt(item.t_lc)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Summary */}
        <div className="ml-auto w-64 text-sm">
          <div className="flex justify-between py-1 border-b"><span className="text-slate-600">Metal Value</span><span className="font-bold">{fmtINR(bill.subtotal)}</span></div>
          {includeLC && <div className="flex justify-between py-1 border-b"><span className="text-slate-600">Labour Charges</span><span className="font-bold">{fmtINR(bill.total_lc)}</span></div>}
          {bill.discount > 0 && <div className="flex justify-between py-1 border-b"><span className="text-slate-600">Gross Total</span><span className="font-semibold">{fmtINR((bill.subtotal || 0) + (bill.total_lc || 0))}</span></div>}
          {bill.discount > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span className="font-semibold">Discount</span><span className="font-bold">-{fmtINR(bill.discount)}</span></div>}
          <div className="flex justify-between py-1.5 text-base font-black border-b-2 border-slate-800"><span>Total</span><span>{fmtINR(bill.total_amount)}</span></div>
          {bill.cash_amount > 0 && <div className="flex justify-between py-1"><span className="text-slate-600">Cash</span><span>{fmtINR(bill.cash_amount)}</span></div>}
          {bill.online_amount > 0 && <div className="flex justify-between py-1"><span className="text-slate-600">Online/RTGS</span><span>{fmtINR(bill.online_amount)}</span></div>}
          {(bill.metal_payments && bill.metal_payments.length > 0)
            ? bill.metal_payments.map((mp, i) => (
                <div key={i} className="flex justify-between py-0.5 text-xs">
                  <span className="text-slate-500">{mp.metal_type} ({mp.purity}) {fmt(mp.weight, 3)}g @₹{fmt(mp.rate)}</span>
                  <span className="font-semibold">{fmtINR(mp.metal_value)}</span>
                </div>
              ))
            : bill.metal_value > 0 && (
                <div className="flex justify-between py-1"><span className="text-slate-600">Metal Exchange</span><span>{fmtINR(bill.metal_value)}</span></div>
              )}
          <div className="flex justify-between py-1 border-t"><span className="text-slate-600">Amount Paid</span><span className="font-bold text-green-700">{fmtINR(bill.amount_paid)}</span></div>
          <div className={`flex justify-between py-1 font-black text-base ${bill.outstanding_amount > 0 ? "text-red-600" : "text-green-600"}`}>
            <span>Outstanding</span><span>{fmtINR(bill.outstanding_amount)}</span>
          </div>
        </div>
        {bill.notes && <p className="text-xs text-slate-500 mt-4 border-t pt-2">Note: {bill.notes}</p>}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SellingBilling() {
  // View: 'list' | 'form' | 'print'
  const [view, setView] = useState("list");
  const [bills, setBills] = useState([]);
  const [labourCharges, setLabourCharges] = useState([]); // flat array from DB
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [printBill, setPrintBill] = useState(null);
  const [editBill, setEditBill] = useState(null); // null = new bill

  // Form state
  const [nextBillNo, setNextBillNo] = useState(1);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInAddress, setWalkInAddress] = useState("");
  const [customerType, setCustomerType] = useState("Retail");
  // Currently active category per metal type in the picker: { [metalType]: "Standard" }
  const [activeCategoryByMetal, setActiveCategoryByMetal] = useState({});
  const [selectedMetals, setSelectedMetals] = useState(new Set(["Gold 24K"]));
  const [rates, setRates] = useState({ "Gold 24K": "", "Gold 22K": "", Silver: "" });
  const [items, setItems] = useState([]);
  const [payment, setPayment] = useState({
    cash_amount: "",
    online_amount: "",
    metal_entries: [],
    discount: "",
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Build lcTree: { metalType: { category: { size_label: lcRow } } }
  // Each lcRow contains all 3-tier rates, sort_order and size_value.
  const lcTree = useMemo(() => {
    const tree = {};
    labourCharges.forEach((lc) => {
      if (!tree[lc.metal_type]) tree[lc.metal_type] = {};
      if (!tree[lc.metal_type][lc.category]) tree[lc.metal_type][lc.category] = {};
      tree[lc.metal_type][lc.category][lc.size_label] = lc;
    });
    return tree;
  }, [labourCharges]);

  // Ordered list of categories per metal type (for dropdown rendering)
  const categoriesByMetal = useMemo(() => {
    const byMetal = {};
    labourCharges.forEach((lc) => {
      if (!byMetal[lc.metal_type]) byMetal[lc.metal_type] = [];
      if (!byMetal[lc.metal_type].includes(lc.category)) byMetal[lc.metal_type].push(lc.category);
    });
    return byMetal;
  }, [labourCharges]);

  // Ordered list of sizes within a metal+category (sorted by sort_order, then size_value).
  const sizesFor = useCallback((metal, category) => {
    const rows = (lcTree[metal]?.[category]) ? Object.values(lcTree[metal][category]) : [];
    return rows
      .slice()
      .sort((a, b) => {
        const so = (a.sort_order || 0) - (b.sort_order || 0);
        if (so !== 0) return so;
        return (a.size_value || 0) - (b.size_value || 0);
      });
  }, [lcTree]);

  const totals = useMemo(() => computeTotals(items, rates, payment), [items, rates, payment]);

  const showToast = useCallback((message, type = "success") =>
    setToast({ show: true, message, type }), []);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadBills = useCallback(async () => {
    setLoading(true);
    try { setBills(await listSellingBills()); }
    catch { showToast("Failed to load bills", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  const loadLabourCharges = useCallback(async () => {
    try { setLabourCharges(await getLabourCharges()); }
    catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadBills();
    loadLabourCharges();
  }, [loadBills, loadLabourCharges]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(async () => {
    const next = await getNextBillNo().catch(() => 1);
    setNextBillNo(next.bill_no ?? next);
    setFormDate(new Date().toISOString().split("T")[0]);
    setSelectedCustomer(null);
    setWalkInName("");
    setWalkInPhone("");
    setWalkInAddress("");
    setCustomerType("Retail");
    setSelectedMetals(new Set(["Gold 24K"]));
    setRates({ "Gold 24K": "", "Gold 22K": "", Silver: "" });
    setItems([]);
    setActiveCategoryByMetal({});
    setPayment({ cash_amount: "", online_amount: "", metal_entries: [], discount: "" });
    setNotes("");
  }, []);

  const openNew = useCallback(async () => {
    setEditBill(null);
    await resetForm();
    setView("form");
  }, [resetForm]);

  const openEdit = useCallback(async (bill) => {
    setLoading(true);
    try {
      const full = await getSellingBill(bill.id);
      setEditBill(full);
      setNextBillNo(full.bill_no);
      setFormDate(full.date);
      setSelectedCustomer(full.customer_id ? { id: full.customer_id, party_name: full.customer_party_name || full.customer_name, phone_no: full.customer_phone } : null);
      setWalkInName(full.customer_id ? "" : full.customer_name);
      setWalkInPhone("");
      setWalkInAddress("");
      setCustomerType(full.customer_type || "Retail");
      // Rebuild selected metals from items
      const metals = new Set((full.items || []).map((i) => i.metal_type));
      if (metals.size === 0) metals.add("Gold 24K");
      setSelectedMetals(metals);
      // Rebuild rates from first item of each metal
      const newRates = { "Gold 24K": "", "Gold 22K": "", Silver: "" };
      (full.items || []).forEach((i) => { if (newRates[i.metal_type] === "") newRates[i.metal_type] = i.rate_per_gram?.toString() || ""; });
      setRates(newRates);
      // Rebuild items
      setItems((full.items || []).map((i) => ({
        _key: `${Date.now()}-${Math.random()}`,
        metal_type: i.metal_type,
        category: i.category,
        custom_label: i.custom_label || "",
        size: i.size,
        custom_size: i.size?.toString() || "",
        pieces: i.pieces?.toString() || "",
        lc_pp: i.lc_pp?.toString() || "0",
        sort_order: i.sort_order,
      })));
      const metalEntries = (full.metal_payments || []).map((mp) => ({
        _key: `${Date.now()}-${Math.random()}`,
        metal_type: mp.metal_type || "Gold 24K",
        purity: mp.purity || "99.99",
        weight: mp.weight?.toString() || "",
        rate: mp.rate?.toString() || "",
      }));
      setPayment({
        cash_amount: full.cash_amount?.toString() || "",
        online_amount: full.online_amount?.toString() || "",
        metal_entries: metalEntries,
        discount: full.discount > 0 ? full.discount.toString() : "",
      });
      setNotes(full.notes || "");
      setView("form");
    } catch { showToast("Failed to load bill", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  // ── Metal selection ───────────────────────────────────────────────────────

  // Toggle uses three SIBLING state updates (not nested) so React 18 batches
  // them into a single render and strict-mode re-invocation can't drop or
  // duplicate a side-effect inside an updater.
  const toggleMetal = useCallback((mt) => {
    const alreadyOn = selectedMetals.has(mt);
    setSelectedMetals((prev) => {
      const next = new Set(prev);
      if (next.has(mt)) next.delete(mt); else next.add(mt);
      return next;
    });
    if (alreadyOn) {
      // Remove items of this metal when un-checking.
      setItems((its) => its.filter((i) => i.metal_type !== mt));
    } else {
      // Pre-seed activeCategory with the first REAL category for this metal
      // (falls back to the first defined category, never to a hard-coded
      // "Standard" that may not exist — e.g. Silver has Bar / C|B / Colour).
      setActiveCategoryByMetal((p) => {
        if (p[mt]) return p;
        const firstCat = categoriesByMetal[mt]?.[0];
        if (!firstCat) return p; // will be set by the normalizer effect once labourCharges load
        return { ...p, [mt]: firstCat };
      });
    }
  }, [selectedMetals, categoriesByMetal]);

  // Normalizer: whenever selectedMetals or categoriesByMetal changes, make
  // sure every selected metal has a valid activeCategory. This rescues the
  // case where the user toggled a metal before labourCharges finished loading
  // (firstCat was undefined at toggle time) — otherwise the size grid would
  // stay empty and the first PCS keystroke would silently no-op.
  useEffect(() => {
    setActiveCategoryByMetal((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const mt of selectedMetals) {
        const cats = categoriesByMetal[mt] || [];
        const cur = next[mt];
        if (!cur || !cats.includes(cur)) {
          const firstCat = cats[0];
          if (firstCat && firstCat !== cur) {
            next[mt] = firstCat;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [selectedMetals, categoriesByMetal]);

  // Set/change which pieces value we have for a given size row.
  // If pieces > 0 and no item exists for this size, create one. If pieces is cleared, remove the row.
  const setPiecesForSize = useCallback((metalType, category, size_label, piecesStr) => {
    const lcRow = lcTree[metalType]?.[category]?.[size_label];
    if (!lcRow) return;
    // Sanity: the lookup key MUST match the row's own metadata. Guarantees we
    // never create an item tagged with the wrong metal_type (which would make
    // its weight bleed into the wrong metal's subtotal).
    if (
      lcRow.metal_type !== metalType ||
      lcRow.category !== category ||
      lcRow.size_label !== size_label
    ) {
      return;
    }
    const pieces = parseInt(piecesStr);
    setItems((its) => {
      const idx = its.findIndex(
        (i) => i.metal_type === metalType && i.category === category && i.custom_label === size_label
      );
      if (idx === -1) {
        if (!piecesStr || Number.isNaN(pieces) || pieces <= 0) return its;
        // Add new item — metal_type is taken from the lcRow, not the caller.
        const sortOrder = its.filter((i) => i.metal_type === lcRow.metal_type).length;
        const newItem = makeItemFromLc(lcRow, customerType, sortOrder);
        newItem.pieces = piecesStr;
        return [...its, newItem];
      }
      // Existing row: update pieces. If cleared or 0, remove row.
      if (!piecesStr || Number.isNaN(pieces) || pieces <= 0) {
        return its.filter((_, i) => i !== idx);
      }
      const updated = [...its];
      updated[idx] = {
        ...updated[idx],
        metal_type: lcRow.metal_type, // re-assert in case an older item was mis-tagged
        category: lcRow.category,
        custom_label: lcRow.size_label,
        pieces: piecesStr,
        lc_pp: pickTierRate(lcRow, customerType),
        size: lcRow.size_value != null ? parseFloat(lcRow.size_value) : updated[idx].size,
      };
      return updated;
    });
  }, [lcTree, customerType]);

  const removeItemRow = useCallback((key) => {
    setItems((its) => its.filter((i) => i._key !== key));
  }, []);

  // When customer type changes, recompute lc_pp on every existing item using the new tier.
  useEffect(() => {
    setItems((its) =>
      its.map((item) => {
        const lcRow = lcTree[item.metal_type]?.[item.category]?.[item.custom_label];
        if (!lcRow) return item;
        return { ...item, lc_pp: pickTierRate(lcRow, customerType) };
      })
    );
  }, [customerType, lcTree]);

  const updateRate = useCallback((metalType, value) => {
    setRates((prev) => ({ ...prev, [metalType]: value }));
  }, []);

  const addMetalEntry = useCallback(() => {
    setPayment((p) => ({ ...p, metal_entries: [...p.metal_entries, makeMetalEntry()] }));
  }, []);

  const removeMetalEntry = useCallback((_key) => {
    setPayment((p) => ({ ...p, metal_entries: p.metal_entries.filter((e) => e._key !== _key) }));
  }, []);

  const updateMetalEntry = useCallback((_key, field, value) => {
    setPayment((p) => ({
      ...p,
      metal_entries: p.metal_entries.map((e) => {
        if (e._key !== _key) return e;
        const updated = { ...e, [field]: value };
        if (field === "metal_type") updated.purity = value === "Gold 22K" ? "91.60" : "99.99";
        return updated;
      }),
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (andPrint = false) => {
    if (!formDate) { showToast("Date is required", "error"); return; }
    if (items.length === 0) { showToast("Add at least one item", "error"); return; }

    // At least one size row must have a positive qty
    const hasQty = items.some((i) => (parseInt(i.pieces) || 0) > 0);
    if (!hasQty) { showToast("Enter pieces on at least one item", "error"); return; }

    // Rate must be set for each metal used
    const usedMetals = new Set(items.filter((i) => (parseInt(i.pieces) || 0) > 0).map((i) => i.metal_type));
    for (const mt of usedMetals) {
      if (!(parseFloat(rates[mt]) > 0)) {
        showToast(`${mt}: enter a per-gram rate`, "error");
        return;
      }
    }

    const finalItems = items.map((item, i) => {
      const { pieces, size, weight, metal_value, t_lc } = computeItem(item, rates[item.metal_type] || 0);
      return {
        metal_type: item.metal_type,
        category: item.category,
        custom_label: item.custom_label || "",
        size,
        pieces,
        weight,
        rate_per_gram: parseFloat(rates[item.metal_type]) || 0,
        metal_value,
        lc_pp: parseFloat(item.lc_pp) || 0,
        t_lc,
        sort_order: i,
      };
    });

    const { subtotal, total_lc, discount, total_amount, metal_value_paid, amount_paid, outstanding } = totals;
    const metalPaymentsPayload = payment.metal_entries
      .filter((e) => (parseFloat(e.weight) || 0) > 0)
      .map((e) => ({
        metal_type: e.metal_type,
        purity: e.purity,
        weight: parseFloat(e.weight) || 0,
        rate: parseFloat(e.rate) || 0,
      }));
    const hasCash = (parseFloat(payment.cash_amount) || 0) > 0;
    const hasOnline = (parseFloat(payment.online_amount) || 0) > 0;
    const hasMetal = metalPaymentsPayload.length > 0;
    let payment_mode = "Cash";
    if (hasMetal && !hasCash && !hasOnline) payment_mode = "Metal";
    else if (!hasMetal && !hasCash && hasOnline) payment_mode = "Online";
    else if (hasCash || hasOnline || hasMetal) payment_mode = "Mixed";

    const payload = {
      date: formDate,
      customer_id: selectedCustomer?.id || null,
      customer_name: selectedCustomer ? selectedCustomer.party_name : (walkInName || "Walk-in"),
      // Walk-in auto-create fields — picked up by backend if customer_id is null
      customer_phone: selectedCustomer ? selectedCustomer.phone_no : (walkInPhone || ""),
      customer_address: selectedCustomer ? "" : (walkInAddress || ""),
      customer_type: customerType,
      payment_mode,
      cash_amount: parseFloat(payment.cash_amount) || 0,
      online_amount: parseFloat(payment.online_amount) || 0,
      metal_value: metal_value_paid,
      metal_payments: metalPaymentsPayload,
      subtotal,
      total_lc,
      discount,
      total_amount,
      amount_paid,
      outstanding_amount: Math.max(outstanding, 0),
      notes,
      items: finalItems,
    };

    setSaving(true);
    try {
      let saved;
      if (editBill) {
        saved = await updateSellingBill(editBill.id, payload);
        showToast("Bill updated successfully");
      } else {
        saved = await createSellingBill(payload);
        showToast("Bill created successfully");
      }
      await loadBills();
      if (andPrint) {
        setPrintBill(saved);
        setView("print");
      } else {
        setView("list");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to save bill", "error");
    } finally {
      setSaving(false);
    }
  }, [formDate, items, rates, totals, selectedCustomer, walkInName, walkInPhone, walkInAddress, customerType, payment, notes, editBill, loadBills, showToast]);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteSellingBill(id);
      setDeleteConfirm(null);
      showToast("Bill deleted");
      loadBills();
    } catch { showToast("Failed to delete bill", "error"); }
  }, [loadBills, showToast]);

  // ── RENDER: List ─────────────────────────────────────────────────────────

  if (view === "print" && printBill) {
    return <PrintView bill={printBill} onClose={() => { setPrintBill(null); setView("list"); }} />;
  }

  if (view === "list") {
    return (
      <div className="space-y-6">
        <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Selling Bills</h1>
            <p className="text-sm text-slate-500 mt-0.5">Create and manage selling counter bills</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Plus size={16} /> New Bill
          </button>
        </div>

        {/* Bills Table */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>
        ) : bills.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-5xl mb-3">🧾</p>
            <p className="font-bold text-lg">No bills yet</p>
            <p className="text-sm">Click <span className="text-indigo-600 font-semibold">New Bill</span> to create your first selling bill.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Bill #</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Paid</th>
                    <th className="text-right px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Outstanding</th>
                    <th className="text-center px-4 py-3 font-black text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill, idx) => (
                    <tr key={bill.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                      <td className="px-4 py-3 font-black text-indigo-600">#{bill.bill_no}</td>
                      <td className="px-4 py-3 text-slate-600">{bill.date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{bill.customer_name || "Walk-in"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          bill.customer_type === "Wholesale" ? "bg-blue-100 text-blue-700" :
                          bill.customer_type === "Showroom" ? "bg-purple-100 text-purple-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{bill.customer_type || "Retail"}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtINR(bill.total_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{fmtINR(bill.amount_paid)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${bill.outstanding_amount > 0 ? "text-red-600" : "text-green-600"}`}>
                          {fmtINR(bill.outstanding_amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(bill)} title="Edit" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={14} /></button>
                          <button onClick={async () => { const full = await getSellingBill(bill.id); setPrintBill(full); setView("print"); }} title="Print" className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Printer size={14} /></button>
                          <button onClick={() => setDeleteConfirm(bill.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-black text-slate-800 mb-2">Delete Bill?</h3>
              <p className="text-sm text-slate-500 mb-5">This action cannot be undone. Any linked outstanding balance will also be reversed.</p>
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

  const includeLC = customerType !== "Retail";
  const metalList = Array.from(selectedMetals);

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />

      {/* Form Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => setView("list")} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-200 px-3 py-2 rounded-xl transition-colors">
          <ArrowLeft size={16} /> Bills
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">{editBill ? `Edit Bill #${nextBillNo}` : `New Bill #${nextBillNo}`}</h1>
          <p className="text-xs text-slate-400">{editBill ? "Update selling bill" : "Create a new selling counter bill"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ─── Left Column (2/3) ─── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Section: Bill Info + Customer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Bill Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Date *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Walk-in Name (if no customer)</label>
                <input type="text" value={walkInName} onChange={(e) => setWalkInName(e.target.value)}
                  disabled={!!selectedCustomer} placeholder="e.g. Walk-in Customer"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
            </div>
            {!selectedCustomer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number (auto-saves as customer)</label>
                  <input type="tel" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="10-digit phone, e.g. 9876543210"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <p className="text-[10px] text-slate-400 mt-1">When name + phone entered, a new customer is auto-created on save.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Address (optional)</label>
                  <input type="text" value={walkInAddress} onChange={(e) => setWalkInAddress(e.target.value)}
                    placeholder="e.g. 221B Baker Street"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Customer (optional)</label>
              <CustomerSearch
                value={selectedCustomer}
                onSelect={(c) => { setSelectedCustomer(c); setCustomerType(c.customer_type || "Retail"); }}
                onWalkIn={() => setSelectedCustomer(null)}
              />
              {selectedCustomer && (
                <div className="mt-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-semibold text-indigo-700 flex items-center gap-2">
                  <CheckCircle size={13} />
                  {selectedCustomer.party_name} · {selectedCustomer.phone_no}
                  {selectedCustomer.outstanding_balance > 0 && (
                    <span className="ml-auto text-red-600">Balance: {fmtINR(selectedCustomer.outstanding_balance)}</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Customer Type</label>
              <div className="flex gap-2">
                {CUSTOMER_TYPES.map((ct) => (
                  <button key={ct} onClick={() => setCustomerType(ct)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      customerType === ct
                        ? ct === "Wholesale" ? "bg-blue-600 text-white" : ct === "Showroom" ? "bg-purple-600 text-white" : "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}>{ct}</button>
                ))}
              </div>
              {customerType !== "Retail" && (
                <p className="text-xs text-blue-600 font-semibold mt-1.5">Labour charges will be included in the bill.</p>
              )}
            </div>
          </div>

          {/* Section: Metal Selection + Rates */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Product & Rates</h2>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Select Metal Type(s)</label>
              <div className="flex flex-wrap gap-2">
                {METAL_TYPES.map((mt) => (
                  <button key={mt} onClick={() => toggleMetal(mt)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                      selectedMetals.has(mt)
                        ? mt.includes("Gold") ? "bg-amber-50 border-amber-400 text-amber-700" : "bg-slate-100 border-slate-400 text-slate-700"
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${selectedMetals.has(mt) ? "bg-current text-white" : "border-2 border-current"}`}>
                      {selectedMetals.has(mt) ? "✓" : ""}
                    </span>
                    {mt}
                  </button>
                ))}
              </div>
            </div>
            {metalList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {metalList.map((mt) => (
                  <div key={mt}>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{mt} Rate/gram (₹)</label>
                    <input type="number" min="0" step="0.01" value={rates[mt]}
                      onChange={(e) => updateRate(mt, e.target.value)}
                      placeholder="e.g. 6500"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Items per metal — cascading picker (Metal → Category → Size + PCS) */}
          {metalList.map((mt) => {
            const rate = parseFloat(rates[mt]) || 0;
            const metalItems = items.filter((i) => i.metal_type === mt);
            let metalSubtotal = 0, metalLC = 0;
            metalItems.forEach((item) => {
              const { metal_value, t_lc } = computeItem(item, rate);
              metalSubtotal += metal_value;
              metalLC += t_lc;
            });
            const categories = categoriesByMetal[mt] || [];
            const activeCategory = activeCategoryByMetal[mt] || categories[0] || "";
            const sizes = activeCategory ? sizesFor(mt, activeCategory) : [];
            // Quick lookup of current pieces by size label for this metal+category
            const piecesBySize = {};
            metalItems.forEach((i) => {
              if (i.category === activeCategory) piecesBySize[i.custom_label] = i.pieces;
            });

            return (
              <div key={mt} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={`px-5 py-3 flex items-center justify-between border-b border-slate-100 ${mt.includes("Gold") ? "bg-amber-50" : "bg-slate-50"}`}>
                  <h3 className="font-black text-sm text-slate-700">{mt} — Pick Products</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                    {categories.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No categories configured</span>
                    ) : (
                      <select
                        value={activeCategory}
                        onChange={(e) => setActiveCategoryByMetal((p) => ({ ...p, [mt]: e.target.value }))}
                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    )}
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs text-slate-400">
                    No labour charges defined for <span className="font-bold">{mt}</span>. Configure them in Admin → Labour Charges.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 text-xs">
                          <th className="text-left px-3 py-2 font-black text-slate-500">Size</th>
                          <th className="text-right px-3 py-2 font-black text-slate-500">g / pc</th>
                          <th className="text-right px-3 py-2 font-black text-slate-500">LC/pc ({customerType})</th>
                          <th className="text-center px-3 py-2 font-black text-slate-500">Pcs</th>
                          <th className="text-right px-3 py-2 font-black text-slate-500">Weight (g)</th>
                          <th className="text-right px-3 py-2 font-black text-slate-500">Metal Value</th>
                          {includeLC && <th className="text-right px-3 py-2 font-black text-slate-500">T.LC</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sizes.map((lcRow) => {
                          const piecesStr = piecesBySize[lcRow.size_label] || "";
                          const piecesN = parseInt(piecesStr) || 0;
                          const sizeVal = lcRow.size_value != null ? parseFloat(lcRow.size_value) : 0;
                          const weight = parseFloat((sizeVal * piecesN).toFixed(4));
                          const metalValue = parseFloat((weight * rate).toFixed(2));
                          const lcPerPc = pickTierRate(lcRow, customerType);
                          const tLc = parseFloat((lcPerPc * piecesN).toFixed(2));
                          const hasQty = piecesN > 0;

                          return (
                            <tr key={lcRow.id} className={`border-t border-slate-100 ${hasQty ? "bg-indigo-50/40" : "hover:bg-slate-50/60"}`}>
                              <td className="px-3 py-2 font-bold text-slate-800">{lcRow.size_label}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 text-xs">
                                {lcRow.size_value != null ? lcRow.size_value : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">₹{fmt(lcPerPc)}</td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={piecesStr}
                                  onChange={(e) => setPiecesForSize(mt, activeCategory, lcRow.size_label, e.target.value)}
                                  className="w-16 text-center text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">{hasQty ? fmt(weight, 4) : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-800">{hasQty ? `₹${fmt(metalValue)}` : <span className="text-slate-300">—</span>}</td>
                              {includeLC && (
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">
                                  {hasQty ? `₹${fmt(tLc)}` : <span className="text-slate-300">—</span>}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {sizes.length === 0 && (
                          <tr><td colSpan={includeLC ? 7 : 6} className="px-4 py-4 text-center text-xs text-slate-400">
                            No sizes under <span className="font-bold">{activeCategory}</span>.
                          </td></tr>
                        )}
                      </tbody>
                      {metalItems.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-black text-slate-600">
                            <td className="px-3 py-2" colSpan={5}>Subtotal — {mt}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(metalSubtotal)}</td>
                            {includeLC && <td className="px-3 py-2 text-right">₹{fmt(metalLC)}</td>}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {/* Selected items summary (picks across all categories for this metal) */}
                {metalItems.length > 0 && (
                  <div className="px-4 py-2.5 bg-indigo-50/50 border-t border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-1.5">Selected for {mt}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {metalItems.map((item) => (
                        <span key={item._key}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-lg">
                          {item.category} / {item.custom_label} × {item.pieces || 0}
                          <button onClick={() => removeItemRow(item._key)}
                            className="text-slate-300 hover:text-red-500">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <label className="block text-xs font-bold text-slate-500 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
        </div>

        {/* ─── Right Column (1/3) ─── */}
        <div className="space-y-5">
          {/* Payment Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Payment</h2>

            {/* Cash & Online */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Cash (₹)</label>
                <input type="number" min="0" step="0.01" value={payment.cash_amount}
                  onChange={(e) => setPayment((p) => ({ ...p, cash_amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Online / RTGS (₹)</label>
                <input type="number" min="0" step="0.01" value={payment.online_amount}
                  onChange={(e) => setPayment((p) => ({ ...p, online_amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            {/* Metal Payments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metal Payments</label>
                <button onClick={addMetalEntry}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors">
                  <Plus size={11} /> Add Metal
                </button>
              </div>

              {payment.metal_entries.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
                  No metal payment — click <span className="font-bold text-indigo-500">Add Metal</span> to add
                </p>
              ) : (
                <div className="space-y-2">
                  {payment.metal_entries.map((entry) => {
                    const factor = PURITY_FACTORS[entry.purity] || 0;
                    const entryValue = (parseFloat(entry.weight) || 0) * (parseFloat(entry.rate) || 0) * factor;
                    return (
                      <div key={entry._key} className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Metal</label>
                            <select value={entry.metal_type}
                              onChange={(e) => updateMetalEntry(entry._key, "metal_type", e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                              {METAL_TYPES.map((mt) => <option key={mt} value={mt}>{mt}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Purity</label>
                            <select value={entry.purity}
                              onChange={(e) => updateMetalEntry(entry._key, "purity", e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                              {(METAL_PURITY_OPTIONS[entry.metal_type] || ["99.99"]).map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Weight (g)</label>
                            <input type="number" min="0" step="0.001" value={entry.weight}
                              onChange={(e) => updateMetalEntry(entry._key, "weight", e.target.value)}
                              placeholder="0.000"
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase">Rate/g (₹)</label>
                            <input type="number" min="0" step="0.01" value={entry.rate}
                              onChange={(e) => updateMetalEntry(entry._key, "rate", e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-700">
                            Value: {fmtINR(entryValue)}
                            {entryValue > 0 && <span className="text-[10px] font-semibold text-amber-500 ml-1">({entry.purity} × {fmt(parseFloat(entry.weight)||0,3)}g)</span>}
                          </span>
                          <button onClick={() => removeMetalEntry(entry._key)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {payment.metal_entries.length > 0 && (
                    <div className="flex justify-between px-3 py-2 bg-amber-100 border border-amber-300 rounded-lg text-xs font-black text-amber-800">
                      <span>Total Metal Value</span>
                      <span>{fmtINR(totals.metal_value_paid)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bill Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2 sticky top-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider mb-3">Bill Summary</h2>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Metal Value</span>
              <span className="font-bold text-slate-800">{fmtINR(totals.subtotal)}</span>
            </div>
            {includeLC && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Labour Charges</span>
                <span className="font-bold text-slate-800">{fmtINR(totals.total_lc)}</span>
              </div>
            )}
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-500">Gross Total</span>
                <span className="font-semibold text-slate-700">{fmtINR(totals.gross_amount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm gap-3">
              <span className="text-red-500 font-bold shrink-0">Discount (₹)</span>
              <input
                type="number" min="0" step="0.01"
                value={payment.discount}
                onChange={(e) => setPayment((p) => ({ ...p, discount: e.target.value }))}
                placeholder="0.00"
                className="w-28 text-right px-2 py-1.5 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200 bg-red-50 placeholder-slate-300"
              />
            </div>
            <div className="flex justify-between text-base font-black border-t border-slate-200 pt-2 mt-1">
              <span>Total Bill</span>
              <span className="text-slate-900">{fmtINR(totals.total_amount)}</span>
            </div>
            {(parseFloat(payment.cash_amount) || 0) > 0 && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Cash</span><span className="font-semibold">{fmtINR(payment.cash_amount)}</span></div>
            )}
            {(parseFloat(payment.online_amount) || 0) > 0 && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Online</span><span className="font-semibold">{fmtINR(payment.online_amount)}</span></div>
            )}
            {totals.metal_value_paid > 0 && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Metal Exchange</span><span className="font-semibold text-amber-700">{fmtINR(totals.metal_value_paid)}</span></div>
            )}
            <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
              <span className="text-slate-500">Amount Paid</span>
              <span className="font-bold text-green-700">{fmtINR(totals.amount_paid)}</span>
            </div>
            <div className={`flex justify-between text-base font-black rounded-xl px-3 py-2.5 mt-1 ${totals.outstanding > 0 ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
              <span>Outstanding</span>
              <span>{fmtINR(Math.max(totals.outstanding, 0))}</span>
            </div>
            {totals.outstanding < 0 && (
              <div className="text-xs text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Return to customer: {fmtINR(Math.abs(totals.outstanding))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 space-y-2">
              <button onClick={() => handleSave(false)} disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm rounded-xl transition-colors">
                {saving ? "Saving…" : editBill ? "Update Bill" : "Save Bill"}
              </button>
              <button onClick={() => handleSave(true)} disabled={saving}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
                <Printer size={14} /> {saving ? "Saving…" : "Save & Print"}
              </button>
              <button onClick={() => setView("list")} disabled={saving}
                className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
