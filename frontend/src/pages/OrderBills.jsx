import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Edit2,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
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

const METAL_TYPES = ["Gold 24K", "Gold 22K", "Silver"];
const CUSTOMER_TYPES = ["Retail", "Showroom", "Wholesale"];

const fmt = (value, digits = 3) => Number(value || 0).toFixed(digits);
const fmtMoney = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const itemKey = (metalType, category, sizeLabel) => `${metalType}::${category}::${sizeLabel}`;

const getRateForCustomerType = (row, customerType) => {
  if (!row) return 0;
  if (customerType === "Wholesale") return parseFloat(row.lc_pp_wholesale) || 0;
  if (customerType === "Showroom") return parseFloat(row.lc_pp_showroom) || 0;
  return parseFloat(row.lc_pp_retail) || 0;
};

const buildItemsFromCharges = (groupedCharges, selectedMetals, customerType, existingItems = []) => {
  const existingMap = new Map(
    (existingItems || []).map((item) => [
      itemKey(item.metal_type || "Gold 24K", item.category || "Standard", item.size_label || ""),
      item,
    ])
  );

  const rows = [];
  selectedMetals.forEach((metalType) => {
    const categories = groupedCharges?.[metalType] || {};
    let sortOrder = 0;
    Object.entries(categories).forEach(([category, sizeRows]) => {
      (sizeRows || []).forEach((row) => {
        const existing = existingMap.get(itemKey(metalType, category, row.size_label));
        rows.push({
          metal_type: metalType,
          category,
          size_label: row.size_label,
          size_value:
            row.size_value != null && row.size_value !== ""
              ? parseFloat(row.size_value)
              : existing?.size_value != null && existing?.size_value !== ""
                ? parseFloat(existing.size_value)
                : 0,
          pcs: existing?.pcs != null ? String(existing.pcs) : "",
          lc_pp:
            existing?.pcs != null
              ? parseFloat(existing.lc_pp) || 0
              : getRateForCustomerType(row, customerType),
          sort_order: sortOrder,
        });
        sortOrder += 1;
      });
    });
  });
  return rows;
};

const computeSummary = (items, metalPayments, amtJama, discount = 0) => {
  let totalPcs = 0;
  let totalWeight = 0;
  let labourTotal = 0;
  const metalWeightTotals = {};

  (items || []).forEach((item) => {
    const pcs = parseInt(item.pcs, 10) || 0;
    const sizeValue = parseFloat(item.size_value) || 0;
    const weight = parseFloat((sizeValue * pcs).toFixed(4));
    const totalLabour = parseFloat(((parseFloat(item.lc_pp) || 0) * pcs).toFixed(2));
    totalPcs += pcs;
    totalWeight = parseFloat((totalWeight + weight).toFixed(4));
    labourTotal = parseFloat((labourTotal + totalLabour).toFixed(2));

    const mt = item.metal_type || "Gold 24K";
    metalWeightTotals[mt] = parseFloat(((metalWeightTotals[mt] || 0) + weight).toFixed(4));
  });

  let totalMetalRs = 0;
  const metalDiffs = {};
  const metalRsMap = {};

  const relevantMetals = new Set([
    ...Object.keys(metalWeightTotals),
    ...METAL_TYPES.filter((metalType) => {
      const payment = metalPayments[metalType] || {};
      return (parseFloat(payment.jama) || 0) > 0 || (parseFloat(payment.rate) || 0) > 0;
    }),
  ]);

  for (const metalType of relevantMetals) {
    const weight = metalWeightTotals[metalType] || 0;
    const payment = metalPayments[metalType] || {};
    const jama = parseFloat(payment.jama) || 0;
    const rate = parseFloat(payment.rate) || 0;
    const diff = parseFloat((weight - jama).toFixed(4));
    metalDiffs[metalType] = diff;
    const rawRs = (diff * rate) / 10;
    const rs = Math.round(rawRs / 10) * 10;
    metalRsMap[metalType] = rs;
    totalMetalRs += rs;
  }

  const amountPaid = parseFloat(amtJama) || 0;
  const subtotal = parseFloat((labourTotal + totalMetalRs).toFixed(2));

  // Cap discount at subtotal so the totals never go below zero.
  const rawDiscount = Math.max(0, parseFloat(discount) || 0);
  const effectiveDiscount = parseFloat(Math.min(rawDiscount, Math.max(subtotal, 0)).toFixed(2));
  const totalAmount = parseFloat((subtotal - effectiveDiscount).toFixed(2));

  // If customer paid more than total, surface the surplus as refundDue.
  const net = parseFloat((totalAmount - amountPaid).toFixed(2));
  const amountDue = net > 0 ? net : 0;
  const refundDue = net < 0 ? parseFloat((-net).toFixed(2)) : 0;

  const fineDiff = metalDiffs["Gold 24K"] || 0;
  const carryFine = totalMetalRs <= 0 && fineDiff > 0 ? parseFloat(fineDiff.toFixed(4)) : 0;

  return {
    totalPcs,
    totalWeight,
    labourTotal,
    fineDiff,
    goldRs: totalMetalRs,
    subtotal,
    discount: effectiveDiscount,
    totalAmount,
    amountDue,
    refundDue,
    carryFine,
    ofgStatus: carryFine > 0 ? "OF.G AFSL" : "OF.G HDF",
    metalWeightTotals,
    metalDiffs,
    metalRsMap,
  };
};

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast.show) return undefined;
    const timeout = setTimeout(onClose, 3500);
    return () => clearTimeout(timeout);
  }, [toast.show, onClose]);

  if (!toast.show) return null;

  return (
    <div
      className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold ${
        toast.type === "success"
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-800"
      }`}
    >
      {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.message}
      <button onClick={onClose} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
};

const CustomerLookup = ({ selectedCustomer, onSelect, onClear }) => {
  const [query, setQuery] = useState(selectedCustomer?.party_name || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const handleSearch = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await getCustomers(value.trim());
        const customers = response?.data || [];
        setResults(customers);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(false);
      }
    }, 250);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            onFocus={() => {
              if (results.length) setOpen(true);
            }}
            placeholder="Search existing customer by name or phone"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        {selectedCustomer && (
          <button
            onClick={() => {
              onClear();
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="px-3 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-red-100 hover:text-red-600"
          >
            Clear
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {results.map((customer) => (
            <button
              key={customer.id}
              onClick={() => {
                onSelect(customer);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-50 last:border-b-0"
            >
              <p className="text-sm font-bold text-slate-800">{customer.party_name}</p>
              <p className="text-xs text-slate-500">
                {customer.phone_no || "No phone"}{customer.city ? ` - ${customer.city}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PrintView = ({ bill, onClose }) => {
  const items = bill.items || [];
  const products = parseProducts(bill.products);
  const printMetalPayments = {
    "Gold 24K": { jama: bill.fine_jama || 0, rate: bill.rate_10g || 0 },
    "Gold 22K": { jama: bill.jama_gold_22k || 0, rate: bill.rate_gold_22k || 0 },
    "Silver": { jama: bill.jama_silver || 0, rate: bill.rate_silver || 0 },
  };
  const summary = computeSummary(items, printMetalPayments, bill.amt_jama, bill.discount);

  useEffect(() => {
    const timeout = setTimeout(() => window.print(), 150);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen bg-white p-8 print:p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-6 print:hidden">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg bg-slate-100"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg"
          >
            <Printer size={16} /> Print
          </button>
        </div>

        <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ESTIMATE</h1>
          <p className="text-xs text-slate-500">Jewellery estimate sheet</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div className="space-y-1">
            <p><span className="font-bold text-slate-600">Estimate No.:</span> {bill.ob_no}</p>
            <p><span className="font-bold text-slate-600">Date:</span> {bill.date}</p>
            <p><span className="font-bold text-slate-600">Metal:</span> {products.join(", ")}</p>
            {bill.product ? <p><span className="font-bold text-slate-600">Product:</span> {bill.product}</p> : null}
          </div>
          <div className="text-right space-y-1">
            <p className="font-bold text-slate-800 text-base">{bill.customer_name || "Walk-in Customer"}</p>
            {bill.customer_phone ? <p className="text-slate-600">{bill.customer_phone}</p> : null}
            {bill.customer_address ? <p className="text-slate-600">{bill.customer_address}</p> : null}
          </div>
        </div>

        {products.map((metalType) => {
          const metalItems = items.filter((item) => (item.metal_type || "Gold 24K") === metalType);
          if (!metalItems.length) return null;

          const categories = [...new Set(metalItems.map((item) => item.category || "Standard"))];

          return (
            <div key={metalType} className="mb-4">
              <h3 className="font-black text-slate-700 text-sm mb-2 uppercase tracking-wider">{metalType}</h3>
              {categories.map((category) => {
                const categoryItems = metalItems.filter((item) => (item.category || "Standard") === category);
                return (
                  <div key={`${metalType}-${category}`} className="mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{category}</p>
                    <table className="w-full text-xs border border-slate-200">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-200 px-2 py-1 text-left">Size</th>
                          <th className="border border-slate-200 px-2 py-1 text-center">Pcs</th>
                          <th className="border border-slate-200 px-2 py-1 text-right">Weight (g)</th>
                          <th className="border border-slate-200 px-2 py-1 text-right">LC/pc</th>
                          <th className="border border-slate-200 px-2 py-1 text-right">T. LC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryItems.map((item) => {
                          const pcs = parseInt(item.pcs, 10) || 0;
                          const weight = (parseFloat(item.size_value) || 0) * pcs;
                          const totalLabour = (parseFloat(item.lc_pp) || 0) * pcs;
                          return (
                            <tr key={itemKey(item.metal_type, item.category, item.size_label)}>
                              <td className="border border-slate-200 px-2 py-1">{item.size_label}</td>
                              <td className="border border-slate-200 px-2 py-1 text-center">{pcs}</td>
                              <td className="border border-slate-200 px-2 py-1 text-right">{fmt(weight, 4)}</td>
                              <td className="border border-slate-200 px-2 py-1 text-right">{fmt(item.lc_pp, 0)}</td>
                              <td className="border border-slate-200 px-2 py-1 text-right">{fmt(totalLabour, 0)}</td>
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

        <div className="ml-auto w-72 text-sm space-y-1">
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Total Pcs</span>
            <span className="font-bold">{summary.totalPcs}</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Total Weight</span>
            <span className="font-bold">{fmt(summary.totalWeight, 4)}g</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Labour Total</span>
            <span className="font-bold">{fmtMoney(summary.labourTotal)}</span>
          </div>
          {summary.metalWeightTotals && Object.entries(summary.metalWeightTotals).map(([mt]) => (
            <div key={mt} className="py-1 border-b">
              <div className="flex justify-between">
                <span className="text-slate-600">{mt} Diff</span>
                <span className="font-bold">{fmt(summary.metalDiffs?.[mt] || 0, 4)}g</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{mt} Rs.</span>
                <span className="font-bold">{fmtMoney(summary.metalRsMap?.[mt] || 0)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Total Metal Rs.</span>
            <span className="font-bold">{fmtMoney(summary.goldRs)}</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-bold">{fmtMoney(summary.subtotal)}</span>
          </div>
          {summary.discount > 0 && (
            <div className="flex justify-between py-1 border-b text-emerald-700">
              <span>Discount</span>
              <span className="font-bold">- {fmtMoney(summary.discount)}</span>
            </div>
          )}
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Total Amount</span>
            <span className="font-bold">{fmtMoney(summary.totalAmount)}</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-slate-600">Advance</span>
            <span className="font-bold">{fmtMoney(bill.amt_jama)}</span>
          </div>
          {summary.refundDue > 0 ? (
            <div className="flex justify-between py-1.5 text-base font-black border-b-2 border-slate-800 text-emerald-700">
              <span>Refund Due</span>
              <span>{fmtMoney(summary.refundDue)}</span>
            </div>
          ) : (
            <div className="flex justify-between py-1.5 text-base font-black border-b-2 border-slate-800">
              <span>Balance</span>
              <span>{fmtMoney(summary.amountDue)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function OrderBills() {
  const { versions, markDirty } = useSellingSync();
  const [view, setView] = useState("list");
  const [bills, setBills] = useState([]);
  const [groupedCharges, setGroupedCharges] = useState({});
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [printBill, setPrintBill] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [obNo, setObNo] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [product, setProduct] = useState("");
  const [selectedProducts, setSelectedProducts] = useState(["Gold 24K"]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerType, setCustomerType] = useState("Retail");
  const [items, setItems] = useState([]);
  const emptyMetalPayments = { "Gold 24K": { jama: "", rate: "" }, "Gold 22K": { jama: "", rate: "" }, "Silver": { jama: "", rate: "" } };
  const [metalPayments, setMetalPayments] = useState({ ...emptyMetalPayments });
  const [amtJama, setAmtJama] = useState("");
  const [discount, setDiscount] = useState("");
  const [stockValidation, setStockValidation] = useState({ valid: true, items: [] });
  const [validatingStock, setValidatingStock] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
  }, []);

  const loadBills = useCallback(async () => {
    const data = await listOrderBills();
    setBills(data || []);
  }, []);

  const loadCharges = useCallback(async () => {
    const data = await getLabourChargesGrouped();
    setGroupedCharges(data || {});
    return data || {};
  }, []);

  const resetForm = useCallback(async (charges = {}) => {
    const next = await getNextObNo().catch(() => ({ ob_no: 1 }));
    const nextValue = next?.ob_no ?? next ?? 1;
    setEditBill(null);
    setObNo(String(nextValue));
    setFormDate(new Date().toISOString().split("T")[0]);
    setProduct("");
    setSelectedProducts(["Gold 24K"]);
    setSelectedCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerType("Retail");
    setMetalPayments({ "Gold 24K": { jama: "", rate: "" }, "Gold 22K": { jama: "", rate: "" }, "Silver": { jama: "", rate: "" } });
    setAmtJama("");
    setDiscount("");
    setItems(buildItemsFromCharges(charges, ["Gold 24K"], "Retail"));
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [charges] = await Promise.all([loadCharges(), loadBills()]);
        await resetForm(charges);
      } catch (error) {
        showToast(error?.message || "Failed to load Estimate module", "error");
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [loadBills, loadCharges, resetForm, showToast]);

  useEffect(() => {
    loadBills().catch(() => {});
  }, [loadBills, versions.estimates]);

  const summary = useMemo(
    () => computeSummary(items, metalPayments, amtJama, discount),
    [items, metalPayments, amtJama, discount]
  );
  const stockValidationMap = useMemo(
    () =>
      new Map(
        (stockValidation.items || []).map((item) => [
          itemKey(item.metal_type, item.category, item.size_label),
          item,
        ])
      ),
    [stockValidation.items]
  );

  useEffect(() => {
    if (view !== "form") return undefined;

    const nonZeroItems = items
      .filter((item) => (parseInt(item.pcs, 10) || 0) > 0)
      .map((item) => ({
        metal_type: item.metal_type,
        category: item.category,
        size_label: item.size_label,
        pcs: parseInt(item.pcs, 10) || 0,
      }));

    if (!nonZeroItems.length) {
      setStockValidation({ valid: true, items: [] });
      return undefined;
    }

    const timeout = setTimeout(async () => {
      setValidatingStock(true);
      try {
        const validation = await validateOrderBillStock({
          estimate_id: editBill?.id || null,
          items: nonZeroItems,
        });
        setStockValidation(validation || { valid: true, items: [] });
      } catch (error) {
        setStockValidation({
          valid: false,
          items: nonZeroItems.map((item) => ({
            ...item,
            available_pieces: 0,
            valid: false,
            message: error?.message || "Unable to validate stock",
          })),
        });
      } finally {
        setValidatingStock(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [editBill?.id, items, view]);

  const handleProductToggle = useCallback((metalType) => {
    setSelectedProducts((current) => {
      const nextProducts = current.includes(metalType)
        ? current.length === 1
          ? current
          : current.filter((value) => value !== metalType)
        : [...current, metalType];

      setItems((prevItems) => buildItemsFromCharges(groupedCharges, nextProducts, customerType, prevItems));
      return nextProducts;
    });
  }, [customerType, groupedCharges]);

  const handleCustomerTypeChange = useCallback((nextType) => {
    setCustomerType(nextType);
    setItems((prevItems) => buildItemsFromCharges(groupedCharges, selectedProducts, nextType, prevItems));
  }, [groupedCharges, selectedProducts]);

  const updatePieces = useCallback((targetKey, value) => {
    setItems((current) =>
      current.map((item) =>
        itemKey(item.metal_type, item.category, item.size_label) === targetKey
          ? { ...item, pcs: value }
          : item
      )
    );
  }, []);

  const openNew = useCallback(async () => {
    const charges = Object.keys(groupedCharges).length ? groupedCharges : await loadCharges();
    await resetForm(charges);
    setView("form");
  }, [groupedCharges, loadCharges, resetForm]);

  const openEdit = useCallback(async (bill) => {
    try {
      const charges = Object.keys(groupedCharges).length ? groupedCharges : await loadCharges();
      const full = await getOrderBill(bill.id);
      const products = parseProducts(full.products);

      setEditBill(full);
      setObNo(String(full.ob_no || ""));
      setFormDate(full.date || new Date().toISOString().split("T")[0]);
      setProduct(full.product || "");
      setSelectedProducts(products);
      setSelectedCustomer(
        full.customer_id
          ? {
              id: full.customer_id,
              party_name: full.customer_name,
              phone_no: full.customer_phone,
              address: full.customer_address,
              customer_type: full.customer_type,
            }
          : null
      );
      setCustomerName(full.customer_name || "");
      setCustomerPhone(full.customer_phone || "");
      setCustomerAddress(full.customer_address || "");
      setCustomerType(full.customer_type || "Retail");
      setMetalPayments({
        "Gold 24K": { jama: full.fine_jama != null ? String(full.fine_jama) : "", rate: full.rate_10g != null ? String(full.rate_10g) : "" },
        "Gold 22K": { jama: full.jama_gold_22k != null ? String(full.jama_gold_22k) : "", rate: full.rate_gold_22k != null ? String(full.rate_gold_22k) : "" },
        "Silver": { jama: full.jama_silver != null ? String(full.jama_silver) : "", rate: full.rate_silver != null ? String(full.rate_silver) : "" },
      });
      setAmtJama(full.amt_jama != null ? String(full.amt_jama) : "");
      setDiscount(full.discount != null && parseFloat(full.discount) > 0 ? String(full.discount) : "");
      setItems(buildItemsFromCharges(charges, products, full.customer_type || "Retail", full.items || []));
      setView("form");
    } catch (error) {
      showToast(error?.message || "Failed to load estimate", "error");
    }
  }, [groupedCharges, loadCharges, showToast]);

  const handleSave = useCallback(async (andPrint = false) => {
    if (!formDate) {
      showToast("Date is required", "error");
      return;
    }
    if (!obNo) {
      showToast("Estimate number is required", "error");
      return;
    }

    const nonZeroItems = items
      .filter((item) => (parseInt(item.pcs, 10) || 0) > 0)
      .map((item) => ({
        metal_type: item.metal_type,
        category: item.category,
        size_label: item.size_label,
        size_value: parseFloat(item.size_value) || 0,
        pcs: parseInt(item.pcs, 10) || 0,
        lc_pp: parseFloat(item.lc_pp) || 0,
        sort_order: item.sort_order,
      }));

    if (!nonZeroItems.length) {
      showToast("Enter quantity for at least one size", "error");
      return;
    }

    if (stockValidation.items.length > 0 && !stockValidation.valid) {
      showToast("Insufficient stock available for selected size/category", "error");
      return;
    }

    const hasCustomerDraft = customerName || customerPhone || customerAddress;
    if (!selectedCustomer && hasCustomerDraft && (!customerName || !customerPhone || !customerAddress)) {
      showToast("New customer entries need name, phone number, and address", "error");
      return;
    }

    const payload = {
      ob_no: parseInt(obNo, 10),
      date: formDate,
      product,
      products: selectedProducts,
      customer_id: selectedCustomer?.id || null,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_address: customerAddress.trim(),
      customer_city: "",
      customer_type: customerType,
      fine_jama: parseFloat(metalPayments["Gold 24K"]?.jama) || 0,
      rate_10g: parseFloat(metalPayments["Gold 24K"]?.rate) || 0,
      jama_gold_22k: parseFloat(metalPayments["Gold 22K"]?.jama) || 0,
      rate_gold_22k: parseFloat(metalPayments["Gold 22K"]?.rate) || 0,
      jama_silver: parseFloat(metalPayments["Silver"]?.jama) || 0,
      rate_silver: parseFloat(metalPayments["Silver"]?.rate) || 0,
      amt_jama: parseFloat(amtJama) || 0,
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
      await loadBills();

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
  }, [
    amtJama,
    customerAddress,
    customerName,
    customerPhone,
    customerType,
    discount,
    editBill,
    metalPayments,
    formDate,
    items,
    loadBills,
    obNo,
    product,
    selectedCustomer,
    selectedProducts,
    showToast,
    stockValidation.items.length,
    stockValidation.valid,
    markDirty,
  ]);

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

  if (view === "print" && printBill) {
    return <PrintView bill={printBill} onClose={() => { setPrintBill(null); setView("list"); }} />;
  }

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

  if (view === "list") {
    return (
      <div className="space-y-6">
        <Toast toast={toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Estimate</h1>
            <p className="text-sm text-slate-500 mt-0.5">Create and manage customer estimates</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm"
          >
            <Plus size={16} /> New Estimate
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {bills.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-lg font-bold text-slate-600">No estimates yet</p>
              <p className="text-sm mt-1">Create the first estimate to start this workflow.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Estimate</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Metals</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Advance</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Balance / Refund</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill, index) => (
                    <tr key={bill.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                      <td className="px-4 py-3">
                        <p className="font-black text-indigo-600">#{bill.ob_no}</p>
                        <p className="text-xs text-slate-400">{bill.date}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{bill.customer_name || "Walk-in Customer"}</p>
                        {bill.customer_phone ? <p className="text-xs text-slate-400">{bill.customer_phone}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{parseProducts(bill.products).join(", ")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {fmtMoney(bill.total_amount != null && parseFloat(bill.total_amount) > 0 ? bill.total_amount : bill.subtotal)}
                        {parseFloat(bill.discount) > 0 && (
                          <span className="block text-[10px] text-emerald-600 font-semibold">disc {fmtMoney(bill.discount)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{fmtMoney(bill.amt_jama)}</td>
                      <td className="px-4 py-3 text-right font-bold">
                        {parseFloat(bill.refund_due) > 0 ? (
                          <span className="text-emerald-600">+ {fmtMoney(bill.refund_due)}<span className="block text-[10px] font-semibold">refund</span></span>
                        ) : (
                          <span className="text-red-600">{fmtMoney(bill.amt_baki)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(bill)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              const full = await getOrderBill(bill.id);
                              setPrintBill(full);
                              setView("print");
                            }}
                            className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                            title="Print"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(bill.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-black text-slate-800 mb-2">Delete estimate?</h3>
              <p className="text-sm text-slate-500 mb-5">This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

      <div className="flex items-center gap-4">
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-2 rounded-xl"
        >
          <ArrowLeft size={16} /> Estimates
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">{editBill ? `Edit Estimate #${obNo}` : "New Estimate"}</h1>
          <p className="text-xs text-slate-400">Dynamic estimate flow driven by admin labour charges</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Estimate Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Estimate No.</label>
                <input
                  type="number"
                  min="1"
                  value={obNo}
                  onChange={(event) => setObNo(event.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Product / Description</label>
              <input
                type="text"
                value={product}
                onChange={(event) => setProduct(event.target.value)}
                placeholder="Optional description for this estimate"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Customer</h2>
              <p className="text-xs text-slate-400 mt-1">
                Search an existing customer or enter a new one. New customer details are auto-added to Customers on save.
              </p>
            </div>

            <CustomerLookup
              key={selectedCustomer?.id || "new-customer"}
              selectedCustomer={selectedCustomer}
              onSelect={(customer) => {
                setSelectedCustomer(customer);
                setCustomerName(customer.party_name || "");
                setCustomerPhone(customer.phone_no || "");
                setCustomerAddress(customer.address || "");
                setCustomerType(customer.customer_type || "Retail");
              }}
              onClear={() => {
                setSelectedCustomer(null);
                setCustomerName("");
                setCustomerPhone("");
                setCustomerAddress("");
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => {
                    setSelectedCustomer(null);
                    setCustomerName(event.target.value);
                  }}
                  placeholder="Customer name"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(event) => {
                    setSelectedCustomer(null);
                    setCustomerPhone(event.target.value);
                  }}
                  placeholder="Phone number"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Address</label>
              <textarea
                value={customerAddress}
                onChange={(event) => {
                  setSelectedCustomer(null);
                  setCustomerAddress(event.target.value);
                }}
                rows={2}
                placeholder="Customer address"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Customer Type</label>
              <div className="flex gap-3">
                {CUSTOMER_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => handleCustomerTypeChange(type)}
                    type="button"
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 ${
                      customerType === type
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider mb-1">Metal Types</h2>
            <p className="text-xs text-slate-400 mb-3">Select one or more metals. Categories and sizes load from Admin labour charges.</p>
            <div className="flex gap-3 flex-wrap">
              {METAL_TYPES.map((metalType) => {
                const selected = selectedProducts.includes(metalType);
                return (
                  <button
                    key={metalType}
                    onClick={() => handleProductToggle(metalType)}
                    type="button"
                    className={`px-4 py-2.5 rounded-xl text-sm font-black border-2 ${
                      selected
                        ? "bg-amber-50 border-amber-400 text-amber-800"
                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {metalType}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedProducts.map((metalType) => {
            const categories = groupedCharges?.[metalType] || {};
            return (
              <div key={metalType} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-black text-slate-800">{metalType}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Enter only PCS. Labour and calculations are auto-filled from Admin.</p>
                </div>

                {Object.keys(categories).length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-slate-400">
                    No categories configured for {metalType}. Add them in Admin.
                  </div>
                ) : (
                  <div className="space-y-5 p-5">
                    {Object.entries(categories).map(([category, sizeRows]) => {
                      const categoryItems = items.filter(
                        (item) => item.metal_type === metalType && item.category === category
                      );
                      const categoryTotals = categoryItems.reduce((accumulator, item) => {
                        const pcs = parseInt(item.pcs, 10) || 0;
                        const weight = (parseFloat(item.size_value) || 0) * pcs;
                        const totalLabour = (parseFloat(item.lc_pp) || 0) * pcs;
                        return {
                          pcs: accumulator.pcs + pcs,
                          weight: accumulator.weight + weight,
                          labour: accumulator.labour + totalLabour,
                        };
                      }, { pcs: 0, weight: 0, labour: 0 });

                      return (
                        <div key={`${metalType}-${category}`} className="border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <p className="font-black text-slate-700">{category}</p>
                            <p className="text-xs font-semibold text-slate-500">
                              {categoryTotals.pcs} pcs - {fmt(categoryTotals.weight, 4)}g
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-white border-b border-slate-100 text-xs">
                                  <th className="text-left px-4 py-2.5 font-black text-slate-500">Size</th>
                                  <th className="text-right px-4 py-2.5 font-black text-slate-500">g / pc</th>
                                  <th className="text-right px-4 py-2.5 font-black text-slate-500">LC / pc</th>
                                  <th className="text-center px-4 py-2.5 font-black text-slate-500">PCS</th>
                                  <th className="text-right px-4 py-2.5 font-black text-slate-500">Weight</th>
                                  <th className="text-right px-4 py-2.5 font-black text-slate-500">T. LC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(sizeRows || []).map((row) => {
                                  const currentItem =
                                    categoryItems.find((item) => item.size_label === row.size_label) || null;
                                  const pcs = parseInt(currentItem?.pcs, 10) || 0;
                                  const sizeValue = parseFloat(currentItem?.size_value ?? row.size_value) || 0;
                                  const weight = parseFloat((sizeValue * pcs).toFixed(4));
                                  const totalLabour = parseFloat(((parseFloat(currentItem?.lc_pp) || 0) * pcs).toFixed(2));
                                  const key = itemKey(metalType, category, row.size_label);
                                  const validation = stockValidationMap.get(key);

                                  return (
                                    <tr key={key} className="border-b border-slate-100 last:border-b-0">
                                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                                        <div>
                                          <p>{row.size_label}</p>
                                          {pcs > 0 && validation ? (
                                            <p className={`text-[11px] font-bold mt-1 ${validation.valid ? "text-emerald-600" : "text-red-600"}`}>
                                              Available: {validation.available_pieces} pcs
                                            </p>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                                        {row.size_value != null ? fmt(row.size_value, 3) : "-"}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                                        {fmt(currentItem?.lc_pp || getRateForCustomerType(row, customerType), 0)}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={currentItem?.pcs || ""}
                                          onChange={(event) => updatePieces(key, event.target.value)}
                                          className={`w-20 text-center text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 ${
                                            validation && !validation.valid
                                              ? "border-red-300 bg-red-50 text-red-700 focus:ring-red-300"
                                              : "border-slate-200 focus:ring-indigo-300"
                                          }`}
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                                        {pcs ? fmt(weight, 4) : "-"}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                                        {pcs ? fmt(totalLabour, 0) : "-"}
                                      </td>
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
                )}
              </div>
            );
          })}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Metal Payment (Customer JAMA)</h2>
            <p className="text-xs text-slate-400">Enter metal weight deposited by the customer and the rate per 10g for each metal type.</p>
            {selectedProducts.map((metalType) => {
              const colorMap = { "Gold 24K": "amber", "Gold 22K": "yellow", "Silver": "slate" };
              const color = colorMap[metalType] || "slate";
              return (
                <div key={metalType} className={`border border-${color}-200 rounded-xl p-4 bg-${color}-50/30`}>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">{metalType}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">JAMA (g)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={metalPayments[metalType]?.jama || ""}
                        onChange={(event) =>
                          setMetalPayments((prev) => ({
                            ...prev,
                            [metalType]: { ...prev[metalType], jama: event.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        placeholder="0.000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Rate / 10g</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={metalPayments[metalType]?.rate || ""}
                        onChange={(event) =>
                          setMetalPayments((prev) => ({
                            ...prev,
                            [metalType]: { ...prev[metalType], rate: event.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 sticky top-4">
            <h2 className="font-black text-slate-700 text-sm uppercase tracking-wider">Estimate Summary</h2>
            {validatingStock ? (
              <div className="rounded-xl px-4 py-3 border bg-slate-50 border-slate-200 text-xs font-bold text-slate-500">
                Validating stock against selling counter inventory...
              </div>
            ) : stockValidation.items.length > 0 && !stockValidation.valid ? (
              <div className="rounded-xl px-4 py-3 border bg-red-50 border-red-200 text-sm text-red-700">
                <p className="font-black">Insufficient stock available for selected size/category</p>
                <p className="text-xs mt-1">Reduce PCS or update counter stock before saving the estimate.</p>
              </div>
            ) : stockValidation.items.length > 0 ? (
              <div className="rounded-xl px-4 py-3 border bg-emerald-50 border-emerald-200 text-xs font-bold text-emerald-700">
                Stock validated for all selected estimate items.
              </div>
            ) : null}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Pcs</span>
              <span className="font-bold text-slate-800">{summary.totalPcs}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Weight</span>
              <span className="font-bold text-slate-800">{fmt(summary.totalWeight, 4)}g</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Labour Total</span>
              <span className="font-bold text-slate-800">{fmtMoney(summary.labourTotal)}</span>
            </div>

            {/* Per-metal breakdown */}
            {summary.metalWeightTotals && Object.keys(summary.metalWeightTotals).length > 0 && (
              <div className="border-t border-slate-100 pt-2 space-y-2">
                {Object.entries(summary.metalWeightTotals).map(([metalType, weight]) => (
                  <div key={metalType} className="bg-slate-50 rounded-lg p-2.5 space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{metalType}</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Weight</span>
                      <span className="font-bold text-slate-700">{fmt(weight, 4)}g</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Diff (+/-)</span>
                      <span className="font-bold text-slate-700">{fmt(summary.metalDiffs?.[metalType] || 0, 4)}g</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Metal Rs.</span>
                      <span className="font-bold text-slate-700">{fmtMoney(summary.metalRsMap?.[metalType] || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Metal Rs.</span>
              <span className="font-bold text-slate-800">{fmtMoney(summary.goldRs)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-bold text-slate-800">{fmtMoney(summary.subtotal)}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Discount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="0.00"
              />
              {summary.discount > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 font-semibold mt-1">
                  <span>Discount applied</span>
                  <span>- {fmtMoney(summary.discount)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between text-base font-black border-t border-slate-200 pt-2">
              <span>Total Amount</span>
              <span>{fmtMoney(summary.totalAmount)}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Advance Paid (Amt Jama)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amtJama}
                onChange={(event) => setAmtJama(event.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="0.00"
              />
            </div>

            {summary.refundDue > 0 ? (
              <div className="rounded-xl px-4 py-3 border bg-emerald-50 border-emerald-200 text-emerald-800 font-black flex justify-between items-center text-base">
                <span>Refund Due</span>
                <span>{fmtMoney(summary.refundDue)}</span>
              </div>
            ) : (
              <div className="rounded-xl px-4 py-3 border bg-red-50 border-red-200 text-red-700 font-black flex justify-between items-center text-base">
                <span>Balance</span>
                <span>{fmtMoney(summary.amountDue)}</span>
              </div>
            )}
            {summary.refundDue > 0 && (
              <p className="text-[11px] text-emerald-700 -mt-2">
                Customer over-paid by {fmtMoney(summary.refundDue)} (cash + metal exceeds bill total). Hand back / adjust accordingly.
              </p>
            )}

            <div className="rounded-xl px-4 py-3 border bg-slate-50 border-slate-200 text-sm">
              <p className="font-black text-slate-700">{summary.ofgStatus}</p>
              {summary.carryFine > 0 ? (
                <p className="text-xs text-slate-500 mt-1">Carry forward fine: {fmt(summary.carryFine, 4)}g</p>
              ) : (
                <p className="text-xs text-slate-500 mt-1">No fine carry forward on this estimate.</p>
              )}
            </div>

            <div className="pt-3 space-y-2">
              <button
                onClick={() => handleSave(false)}
                disabled={saving || validatingStock || !stockValidation.valid}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2"
              >
                <Save size={14} /> {saving ? "Saving..." : editBill ? "Update Estimate" : "Save Estimate"}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || validatingStock || !stockValidation.valid}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2"
              >
                <Printer size={14} /> {saving ? "Saving..." : "Save and Print"}
              </button>
              <button
                onClick={() => setView("list")}
                disabled={saving}
                className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
