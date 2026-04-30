import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import {
  createCustomerLedgerEntry,
  getCustomerLedger,
  getCustomersPaginated,
} from "../api/customerService";
import Toast from "../components/Toast";
import { useSellingSync } from "../context/SellingSyncContext";
import { METAL_PAYMENT_TYPES, METAL_PURITY } from "../utils/sellingPayments";

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtMoney = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtWeight = (value) => `${Number(value || 0).toFixed(4)}g`;

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const [y, m, d] = String(dateStr).split("-");
  if (!y || !m || !d) return dateStr;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
};

const getPaymentModeClass = (paymentMode) => {
  if (paymentMode === "Metal") return "bg-amber-100 text-amber-700";
  if (paymentMode === "Bank / UPI") return "bg-blue-100 text-blue-600";
  if (paymentMode === "Mixed") return "bg-violet-100 text-violet-700";
  return "bg-emerald-100 text-emerald-700";
};

const describeMetalBalance = (balance) => {
  if (balance > 0) return "customer owes metal";
  if (balance < 0) return "customer metal credit";
  return "balanced";
};

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMERS_PER_PAGE = 15;
const LEDGER_PER_PAGE    = 30;

const TYPE_CONFIG = {
  Retail:    { pill: "bg-blue-100 text-blue-700",     avatar: "from-blue-400 to-blue-600"     },
  Showroom:  { pill: "bg-purple-100 text-purple-700", avatar: "from-purple-400 to-purple-600" },
  Wholesale: { pill: "bg-amber-100 text-amber-700",   avatar: "from-amber-400 to-amber-600"   },
};
const defaultTypeCfg = TYPE_CONFIG.Retail;

const EMPTY_FORM = {
  entry_date:           new Date().toISOString().split("T")[0],
  transaction_type:     "Payment",
  payment_mode:         "Cash",
  balance_type:         "Money",
  amount:               "",
  weight:               "",
  metal_type:           "Gold 24K",
  metal_purity:         METAL_PURITY["Gold 24K"],
  reference_rate:       "",
  adjustment_direction: "credit",
  reference_no:         "",
  notes:                "",
};

// ─── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce(value, delay) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

const CustomerSkeleton = () => (
  <div className="animate-pulse flex items-center gap-3 px-3 py-3 border-l-2 border-transparent">
    <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0" />
    <div className="flex-1 space-y-1.5 min-w-0">
      <div className="h-3 bg-slate-200 rounded w-3/4" />
      <div className="h-2.5 bg-slate-100 rounded w-1/2" />
    </div>
    <div className="h-4 bg-slate-200 rounded w-14 flex-shrink-0" />
  </div>
);

const TableSkeleton = () => (
  <div className="flex flex-col gap-2 p-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="animate-pulse h-11 bg-slate-100 rounded-xl"
        style={{ opacity: 1 - i * 0.12 }}
      />
    ))}
  </div>
);

// ─── Entry Modal ──────────────────────────────────────────────────────────────

const EntryModal = ({ customer, onClose, onSubmit, submitting }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const cfg = TYPE_CONFIG[customer?.customer_type] || defaultTypeCfg;
  const isMetalPayment = form.transaction_type === "Payment" && form.payment_mode === "Metal";
  const isMetalAdjustment = form.transaction_type === "Adjustment" && form.balance_type === "Metal";
  const needsMoneyAmount = (form.transaction_type === "Payment" && !isMetalPayment) || (form.transaction_type === "Adjustment" && form.balance_type !== "Metal");
  const needsMetalFields = isMetalPayment || isMetalAdjustment;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Drag handle for mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.avatar} flex items-center justify-center text-white text-sm font-black flex-shrink-0`}
            >
              {getInitials(customer?.party_name)}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">Add Ledger Entry</h2>
              <p className="text-xs text-slate-500">
                for{" "}
                <span className="font-bold text-slate-700">{customer?.party_name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Date</label>
              <input
                type="date"
                value={form.entry_date}
                onChange={set("entry_date")}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Type</label>
              <select
                value={form.transaction_type}
                onChange={set("transaction_type")}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
              >
                <option value="Payment">Payment</option>
                <option value="Adjustment">Adjustment</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                {needsMoneyAmount ? "Amount (Rs.)" : "Weight (g)"}
              </label>
              {needsMoneyAmount ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={set("amount")}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                />
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.weight}
                  onChange={set("weight")}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                {form.transaction_type === "Payment" ? "Mode" : "Direction / Type"}
              </label>
              {form.transaction_type === "Payment" ? (
                <select
                  value={form.payment_mode}
                  onChange={set("payment_mode")}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank / UPI">Bank / UPI</option>
                  <option value="Metal">Metal</option>
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.adjustment_direction}
                    onChange={set("adjustment_direction")}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                  >
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                  </select>
                  <select
                    value={form.balance_type}
                    onChange={set("balance_type")}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                  >
                    <option value="Money">Money</option>
                    <option value="Metal">Metal</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {needsMetalFields && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Metal</label>
                <select
                  value={form.metal_type}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    metal_type: e.target.value,
                    metal_purity: METAL_PURITY[e.target.value] || prev.metal_purity,
                  }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                >
                  {METAL_PAYMENT_TYPES.map((metalType) => (
                    <option key={metalType} value={metalType}>{metalType}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Purity</label>
                <input
                  type="text"
                  value={form.metal_purity}
                  onChange={set("metal_purity")}
                  placeholder="99.99"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Ref Rate / 10g</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.reference_rate}
                  onChange={set("reference_rate")}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Reference No.</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={set("reference_no")}
                placeholder="Receipt / note no."
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={set("notes")}
                placeholder="Optional note"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (needsMoneyAmount ? Number(form.amount) <= 0 : Number(form.weight) <= 0)}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {submitting ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Pagination strip ─────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 flex-shrink-0">
      {label ? (
        <span className="text-xs text-slate-400 font-semibold hidden sm:block">{label}</span>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1 mx-auto sm:mx-0">
        <button
          onClick={() => onChange(1)}
          disabled={page <= 1}
          className="px-1.5 py-1 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-black"
        >
          «
        </button>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={15} />
        </button>
        {buildPages().map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
              p === page
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          className="px-1.5 py-1 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-black"
        >
          »
        </button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const SellingLedger = () => {
  const { versions, markDirty } = useSellingSync();

  // Customer list state
  const [customers, setCustomers]           = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [customerPage, setCustomerPage]     = useState(1);
  const [sortBy, setSortBy]                 = useState("name"); // "name" | "balance"

  // Ledger state
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [ledgerData, setLedgerData]                 = useState(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("all");

  // Ledger pagination
  const [ledgerPage, setLedgerPage] = useState(1);

  // Loading / submitting
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingLedger, setLoadingLedger]       = useState(false);
  const [submitting, setSubmitting]             = useState(false);

  // UI
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast]         = useState(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Data fetchers ────────────────────────────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const res   = await getCustomersPaginated(debouncedSearch, customerPage, CUSTOMERS_PER_PAGE);
      const data  = res?.data;
      const rows  = data?.customers ?? [];
      const total = data?.total     ?? rows.length;
      setCustomers(rows);
      setTotalCustomers(total);
      setSelectedCustomerId((cur) => cur ?? rows[0]?.id ?? null);
    } catch (err) {
      showToast(err?.message || "Failed to load customers", "error");
    } finally {
      setLoadingCustomers(false);
    }
  }, [debouncedSearch, customerPage, showToast]);

  const fetchLedger = useCallback(async (id) => {
    if (!id) { setLedgerData(null); return; }
    setLoadingLedger(true);
    try {
      const res = await getCustomerLedger(id);
      setLedgerData(res?.data || res);
    } catch (err) {
      showToast(err?.message || "Failed to load ledger", "error");
    } finally {
      setLoadingLedger(false);
    }
  }, [showToast]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => { fetchCustomers(); }, [fetchCustomers, versions.customers]);
  useEffect(() => { fetchLedger(selectedCustomerId); }, [fetchLedger, selectedCustomerId, versions.ledger]);
  useEffect(() => { setCustomerPage(1); }, [debouncedSearch]);
  useEffect(() => { setLedgerPage(1); }, [selectedCustomerId]);
  useEffect(() => { setLedgerPage(1); }, [dateFrom, dateTo, typeFilter]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || ledgerData?.customer || null,
    [customers, ledgerData, selectedCustomerId]
  );

  const sortedCustomers = useMemo(() => {
    const arr = [...customers];
    if (sortBy === "balance") {
      arr.sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0));
    }
    return arr;
  }, [customers, sortBy]);

  const rawStatement = useMemo(() => ledgerData?.statement || [], [ledgerData]);
  const summary = ledgerData?.ledger_summary || {
    total_payable: 0, total_paid: 0, remaining_balance: 0, metal_balances: {},
  };
  const metalBalances = summary.metal_balances || {};

  const filteredStatement = useMemo(() => {
    return rawStatement.filter((row) => {
      if (dateFrom && row.transaction_date < dateFrom) return false;
      if (dateTo   && row.transaction_date > dateTo)   return false;
      if (typeFilter !== "all" &&
          row.transaction_type?.toLowerCase() !== typeFilter) return false;
      return true;
    });
  }, [rawStatement, dateFrom, dateTo, typeFilter]);

  const totalLedgerPages   = Math.ceil(filteredStatement.length / LEDGER_PER_PAGE);
  const totalCustomerPages = Math.ceil(totalCustomers / CUSTOMERS_PER_PAGE);
  const hasActiveFilters   = dateFrom || dateTo || typeFilter !== "all";

  const pagedStatement = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_PER_PAGE;
    return filteredStatement.slice(start, start + LEDGER_PER_PAGE);
  }, [filteredStatement, ledgerPage]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectCustomer = (id) => {
    setSelectedCustomerId(id);
    setDateFrom("");
    setDateTo("");
    setTypeFilter("all");
  };

  const handleEntrySubmit = async (form) => {
    if (!selectedCustomerId) return;
    setSubmitting(true);
    try {
      await createCustomerLedgerEntry(selectedCustomerId, form);
      showToast(`${form.transaction_type} recorded successfully`);
      setShowModal(false);
      markDirty(["ledger", "customers", "dashboard"]);
      fetchLedger(selectedCustomerId);
      fetchCustomers();
    } catch (err) {
      showToast(err?.message || "Failed to record entry", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setTypeFilter("all");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const typeConfig = TYPE_CONFIG[selectedCustomer?.customer_type] || defaultTypeCfg;

  return (
    <div className="space-y-4">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
      {showModal && (
        <EntryModal
          customer={selectedCustomer}
          onClose={() => setShowModal(false)}
          onSubmit={handleEntrySubmit}
          submitting={submitting}
        />
      )}

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
            <BookOpen className="text-white" size={19} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Customer Ledger</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {loadingCustomers
                ? "Loading…"
                : `${totalCustomers} customer${totalCustomers !== 1 ? "s" : ""} · live balances`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { fetchCustomers(); fetchLedger(selectedCustomerId); }}
            className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-3.5 py-2 rounded-xl hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={!selectedCustomerId}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Plus size={14} /> Add Entry
          </button>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">

        {/* ═══════ LEFT: Customer panel ═══════ */}
        <div className="lg:sticky lg:top-6 flex flex-col gap-3">

          {/* Search + sort */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2.5">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, firm, city, phone…"
                className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-slate-50 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {[["name", "A – Z"], ["balance", "By Balance"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSortBy(val)}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${
                    sortBy === val
                      ? "bg-emerald-100 text-emerald-700"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* List header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Customers
              </span>
              {totalCustomers > 0 && (
                <span className="text-[10px] text-slate-400 font-semibold">
                  {(customerPage - 1) * CUSTOMERS_PER_PAGE + 1}–
                  {Math.min(customerPage * CUSTOMERS_PER_PAGE, totalCustomers)} /{" "}
                  {totalCustomers}
                </span>
              )}
            </div>

            {/* Scrollable list body */}
            <div className="divide-y divide-slate-50 max-h-[420px] lg:max-h-[calc(100vh-340px)] overflow-y-auto overscroll-contain">
              {loadingCustomers ? (
                Array.from({ length: 7 }).map((_, i) => <CustomerSkeleton key={i} />)
              ) : sortedCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2.5">
                  <User size={30} className="text-slate-200" />
                  <p className="text-sm font-bold text-slate-400">No customers found</p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="text-xs text-emerald-600 font-bold hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                sortedCustomers.map((customer) => {
                  const active   = customer.id === selectedCustomerId;
                  const balance  = customer.outstanding_balance || 0;
                  const cfg      = TYPE_CONFIG[customer.customer_type] || defaultTypeCfg;
                  const initials = getInitials(customer.party_name);

                  return (
                    <button
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer.id)}
                      className={`w-full text-left px-3 py-3 transition-all border-l-2 group ${
                        active
                          ? "bg-emerald-50 border-emerald-500"
                          : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-all ${
                            active
                              ? `bg-gradient-to-br ${cfg.avatar} text-white shadow-sm`
                              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                          }`}
                        >
                          {initials}
                        </div>

                        {/* Name + type */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p
                              className={`font-bold text-sm truncate ${
                                active ? "text-emerald-800" : "text-slate-800"
                              }`}
                            >
                              {customer.party_name}
                            </p>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.pill}`}
                            >
                              {customer.customer_type?.[0] ?? "R"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {customer.firm_name || customer.city || "—"}
                          </p>
                        </div>

                        {/* Balance */}
                        <div className="text-right flex-shrink-0">
                          {balance > 0 ? (
                            <>
                              <p className="text-xs font-black text-rose-600">
                                {fmtMoney(balance)}
                              </p>
                              <p className="text-[9px] text-slate-400 font-semibold">due</p>
                            </>
                          ) : (
                            <p className="text-xs font-black text-emerald-600">Clear</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Customer pagination */}
            <Pagination
              page={customerPage}
              totalPages={totalCustomerPages}
              onChange={setCustomerPage}
            />
          </div>
        </div>
        {/* ═══════ END left panel ═══════ */}

        {/* ═══════ RIGHT: Ledger panel ═══════ */}
        <div className="flex flex-col gap-4">

          {/* Customer info card */}
          {selectedCustomer ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Avatar + identity */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${typeConfig.avatar} flex items-center justify-center text-white text-lg font-black shadow-md flex-shrink-0`}
                  >
                    {getInitials(selectedCustomer.party_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black text-slate-800 text-base leading-tight">
                        {selectedCustomer.party_name}
                      </h2>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${typeConfig.pill}`}>
                        {selectedCustomer.customer_type || "Retail"}
                      </span>
                    </div>
                    {selectedCustomer.firm_name && (
                      <p className="text-xs text-slate-500 truncate">{selectedCustomer.firm_name}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      {selectedCustomer.phone_no && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Phone size={10} className="text-slate-400" />
                          {selectedCustomer.phone_no}
                        </span>
                      )}
                      {selectedCustomer.city && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <MapPin size={10} className="text-slate-400" />
                          {selectedCustomer.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="flex items-center gap-4 flex-shrink-0 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-center sm:text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Billed</p>
                    <p className="text-sm font-black text-slate-700">{fmtMoney(summary.total_payable)}</p>
                  </div>
                  <div className="w-px h-7 bg-slate-100 hidden sm:block" />
                  <div className="text-center sm:text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Collected</p>
                    <p className="text-sm font-black text-emerald-600">{fmtMoney(summary.total_paid)}</p>
                  </div>
                  <div className="w-px h-7 bg-slate-100 hidden sm:block" />
                  <div className="text-center sm:text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding</p>
                    <p className={`text-sm font-black ${summary.remaining_balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {summary.remaining_balance > 0 ? fmtMoney(summary.remaining_balance) : "Clear"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {METAL_PAYMENT_TYPES.map((metalType) => {
                  const balance = Number(metalBalances?.[metalType] || 0);
                  return (
                    <div key={metalType} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{metalType}</p>
                      <p className={`text-sm font-black mt-1 ${balance > 0 ? "text-rose-600" : balance < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                        {fmtWeight(balance)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {describeMetalBalance(balance)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <User size={20} className="text-slate-300" />
                </div>
                <div>
                  <p className="font-bold text-slate-500 text-sm">No customer selected</p>
                  <p className="text-xs text-slate-400">
                    Pick a customer from the list to view their ledger
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Ledger card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-500 flex-shrink-0">
                <Filter size={12} /> Filter
              </div>

              {/* Date range */}
              <div className="flex items-center gap-1.5">
                <Calendar size={12} className="text-slate-400 flex-shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300 bg-slate-50 text-slate-600 w-32"
                />
                <span className="text-slate-400 text-xs">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300 bg-slate-50 text-slate-600 w-32"
                />
              </div>

              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300 bg-slate-50 text-slate-600 font-semibold"
              >
                <option value="all">All types</option>
                <option value="estimate">Estimate</option>
                <option value="payment">Payment</option>
                <option value="adjustment">Adjustment</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-bold px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <X size={11} /> Clear
                </button>
              )}

              <div className="ml-auto text-xs text-slate-400 font-semibold flex-shrink-0">
                {filteredStatement.length}{" "}
                {filteredStatement.length === 1 ? "entry" : "entries"}
                {hasActiveFilters && rawStatement.length !== filteredStatement.length && (
                  <span className="text-slate-300"> / {rawStatement.length} total</span>
                )}
              </div>
            </div>

            {/* Table area */}
            <div className="overflow-x-auto">
              {loadingLedger ? (
                <TableSkeleton />
              ) : !selectedCustomer ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <BookOpen size={24} className="text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-400 text-sm">
                    Select a customer to view their ledger
                  </p>
                </div>
              ) : filteredStatement.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                    <BookOpen size={22} className="text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-500 text-sm">
                    {rawStatement.length > 0
                      ? "No entries match the filters"
                      : "No ledger activity yet"}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-emerald-600 font-bold hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm min-w-[980px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-black">Date</th>
                      <th className="text-left px-4 py-3 font-black">Type</th>
                      <th className="text-left px-4 py-3 font-black">Payment</th>
                      <th className="text-left px-4 py-3 font-black">Reference</th>
                      <th className="text-left px-4 py-3 font-black">Metal</th>
                      <th className="text-right px-4 py-3 font-black text-rose-400">Debit</th>
                      <th className="text-right px-4 py-3 font-black text-emerald-500">Credit</th>
                      <th className="text-right px-4 py-3 font-black">Cash Bal</th>
                      <th className="text-left px-4 py-3 font-black">Metal Bal</th>
                      <th className="text-center px-4 py-3 font-black">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStatement.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`border-b border-slate-50 align-middle hover:bg-slate-50/80 transition-colors ${
                          idx % 2 === 1 ? "bg-slate-50/30" : ""
                        }`}
                      >
                        {/* Date */}
                        <td className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                          {fmtDate(row.transaction_date)}
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800 text-xs">{row.transaction_type}</p>
                        </td>

                        {/* Payment mode */}
                        <td className="px-4 py-3">
                          {row.payment_mode ? (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block ${getPaymentModeClass(row.payment_mode)}`}
                            >
                              {row.payment_mode}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Reference + notes */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="font-semibold text-slate-700 text-xs truncate">
                            {row.reference_no || (
                              <span className="text-slate-300 italic">—</span>
                            )}
                          </p>
                          {row.notes && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {row.notes}
                            </p>
                          )}
                        </td>

                        {/* Metal movement */}
                        <td className="px-4 py-3">
                          {row.metal_movements?.length ? (
                            <div className="space-y-1">
                              {row.metal_movements.map((movement, movementIndex) => (
                                <div key={`${row.id}-metal-${movementIndex}`} className="text-[10px] leading-tight">
                                  <p className="font-bold text-slate-700">
                                    {movement.metal_type} {movement.weight_delta > 0 ? "Dr" : "Cr"} {fmtWeight(Math.abs(movement.weight_delta))}
                                  </p>
                                  <p className="text-slate-400">
                                    {movement.metal_purity || "—"}{movement.reference_rate ? ` • Ref ${fmtMoney(movement.reference_rate)}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Debit */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {row.debit_amount ? (
                            <span className="font-black text-rose-600 text-xs font-mono">
                              {fmtMoney(row.debit_amount)}
                            </span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>

                        {/* Credit */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {row.credit_amount ? (
                            <span className="font-black text-emerald-600 text-xs font-mono">
                              {fmtMoney(row.credit_amount)}
                            </span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>

                        {/* Running cash balance */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className={`font-black text-xs font-mono ${
                              row.running_balance > 0 ? "text-rose-700" : "text-emerald-600"
                            }`}
                          >
                            {fmtMoney(row.running_balance)}
                          </span>
                        </td>

                        {/* Running metal balances */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {METAL_PAYMENT_TYPES.map((metalType) => {
                              const balance = Number(row.running_metal_balances?.[metalType] || 0);
                              return (
                                <div key={`${row.id}-${metalType}`} className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="text-slate-400">{metalType}</span>
                                  <span className={`font-bold ${balance > 0 ? "text-rose-600" : balance < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                    {fmtWeight(balance)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black whitespace-nowrap ${
                              row.payment_status === "Completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : row.payment_status === "Partial"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-600"
                            }`}
                          >
                            {row.payment_status === "Completed" && <CheckCircle size={9} />}
                            {row.payment_status === "Partial"   && <Clock size={9} />}
                            {row.payment_status === "Pending"   && <AlertCircle size={9} />}
                            {row.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Ledger pagination */}
            <Pagination
              page={ledgerPage}
              totalPages={totalLedgerPages}
              onChange={setLedgerPage}
              label={
                filteredStatement.length > 0
                  ? `Showing ${(ledgerPage - 1) * LEDGER_PER_PAGE + 1}–${Math.min(
                      ledgerPage * LEDGER_PER_PAGE,
                      filteredStatement.length
                    )} of ${filteredStatement.length}`
                  : ""
              }
            />
          </div>
        </div>
        {/* ═══════ END right panel ═══════ */}
      </div>
    </div>
  );
};

export default SellingLedger;
