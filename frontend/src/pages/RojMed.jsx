import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Plus, ChevronLeft, ChevronRight, Lock, UnlockKeyhole,
  Trash2, Edit2, X, CheckCircle2, AlertTriangle, Coins,
  Wallet, TrendingUp, TrendingDown, ShoppingBag, Wrench,
  RefreshCw, Calendar, User, ArrowDownCircle, ArrowUpCircle,
  Receipt, ExternalLink, ChevronDown, ChevronUp, UserPlus, Search,
} from "lucide-react";
import {
  getDay, addEntry, editEntry, deleteEntry,
  closeDay, reopenDay,
} from "../api/rojMedService";
import { getCustomers, createCustomer } from "../api/customerService";
import { useAuth } from "../context/AuthContext";
import { useSellingSync } from "../context/SellingSyncContext";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";

// ─── constants ───────────────────────────────────────────────────────────────

const ENTRY_TYPES = [
  { value: "CASH_IN",        label: "Cash In",       icon: "↓", color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
  { value: "CASH_OUT",       label: "Cash Out",      icon: "↑", color: "text-red-600",     bg: "bg-red-50",      border: "border-red-200" },
  { value: "METAL_IN",       label: "Metal In",      icon: "↓", color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-200" },
  { value: "METAL_OUT",      label: "Metal Out",     icon: "↑", color: "text-orange-600",  bg: "bg-orange-50",   border: "border-orange-200" },
  { value: "EXPENSE",        label: "Expense",       icon: "↑", color: "text-violet-600",  bg: "bg-violet-50",   border: "border-violet-200" },
  { value: "COUNTER_SALE",   label: "Counter Sale",  icon: "↓", color: "text-blue-600",    bg: "bg-blue-50",     border: "border-blue-200" },
  { value: "METAL_PURCHASE", label: "Metal Buy",     icon: "↓", color: "text-yellow-700",  bg: "bg-yellow-50",   border: "border-yellow-300" },
];

const METAL_TYPES   = ["Gold 24K", "Gold 22K", "Silver"];
const PAYMENT_MODES = ["Cash", "Bank / UPI", "Other"];
const EXPENSE_CATS  = ["Labour", "Rent", "Electricity", "Travel", "Misc / Other"];

const getEntryMeta = (type) => ENTRY_TYPES.find(t => t.value === type) || ENTRY_TYPES[0];

const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWt = (v, d = 3) => `${Number(v || 0).toFixed(d)}g`;

// YYYY-MM-DD helpers
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDisplay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ─── Blank entry form state ───────────────────────────────────────────────────
const blankForm = () => ({
  entry_type: "CASH_IN",
  party_id: "",
  payment_mode: "Cash",
  amount: "",
  metal_type: "Gold 24K",
  metal_purity: "",
  metal_weight: "",
  metal_rate: "",
  expense_category: "Labour",
  reference_type: "manual",
  reference_no: "",
  notes: "",
  entry_time: "",
});

// ─── PartyCombo — search existing customers or quick-add a new one ────────────

function PartyCombo({ selectedParty, onSelect, customers, onCustomerCreated }) {
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);
  const [addMode,  setAddMode]  = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [adding,   setAdding]   = useState(false);
  const containerRef            = useRef(null);

  // Sync display text when selected party changes externally (reset / edit open)
  useEffect(() => {
    setQuery(selectedParty?.party_name || "");
    setAddMode(false);
    setAddError("");
  }, [selectedParty]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setAddMode(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q        = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter(c =>
        c.party_name.toLowerCase().includes(q) ||
        (c.firm_name || "").toLowerCase().includes(q) ||
        (c.phone_no  || "").includes(q)
      )
    : customers.slice(0, 10);
  const exactMatch = customers.some(c => c.party_name.toLowerCase() === q);
  const canAddNew  = q.length > 0 && !exactMatch;

  const handleSelect = (c) => {
    onSelect(c);
    setQuery(c.party_name);
    setOpen(false);
    setAddMode(false);
  };

  const handleUnlink = () => {
    onSelect(null);
    setQuery("");
    setAddMode(false);
    setOpen(false);
  };

  const handleOpenAdd = () => {
    setNewName(query.trim());
    setNewPhone("");
    setAddError("");
    setAddMode(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setAddError("Name is required"); return; }
    if (newPhone.trim() && !/^\d{10,15}$/.test(newPhone.trim())) {
      setAddError("Phone must be 10–15 digits (numbers only)");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      const result = await createCustomer({
        party_name:    newName.trim(),
        firm_name:     newName.trim(),   // default same as party name
        address:       "-",
        city:          "-",
        phone_no:      newPhone.trim(),
        customer_type: "Retail",
      });
      const created = result?.data || result?.customer || result;
      onCustomerCreated(created);
      onSelect(created);
      setQuery(created.party_name || newName.trim());
      setOpen(false);
      setAddMode(false);
    } catch (err) {
      setAddError(err?.message || "Failed to create customer — check details and retry");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedParty) onSelect(null);
            setOpen(true);
            setAddMode(false);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search or add new party / customer…"
          className={`w-full pl-9 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white transition-colors ${
            selectedParty ? "border-indigo-300 pr-24" : "border-slate-200 pr-4"
          }`}
        />
        {selectedParty && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 leading-tight">
              linked
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleUnlink}
              className="text-slate-300 hover:text-rose-500 transition-colors p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">

          {/* Existing customers list */}
          {!addMode && (
            <div className="max-h-48 overflow-y-auto">
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-b-0 transition-colors"
                >
                  <p className="text-sm font-bold text-slate-800">{c.party_name}</p>
                  {(c.phone_no || c.customer_type) && (
                    <p className="text-xs text-slate-400">
                      {c.phone_no || ""}
                      {c.phone_no && c.customer_type ? " · " : ""}
                      {c.customer_type || ""}
                    </p>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-400">No customers found</p>
              )}
            </div>
          )}

          {/* "+ Add new" trigger row */}
          {!addMode && canAddNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleOpenAdd}
              className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center gap-2 border-t border-slate-100 transition-colors"
            >
              <UserPlus size={14} />
              Add &quot;{query.trim()}&quot; as new customer
            </button>
          )}

          {/* Quick-add mini form */}
          {addMode && (
            <div className="p-4 space-y-3 bg-emerald-50/40">
              <p className="text-xs font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus size={12} /> New Customer
              </p>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Party / customer name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                  Phone <span className="text-slate-400 font-semibold normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="10–15 digit mobile number"
                  maxLength={15}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                />
              </div>

              {addError && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
                  <AlertTriangle size={11} /> {addError}
                </p>
              )}

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setAddMode(false); setAddError(""); }}
                  className="flex-1 py-1.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCreate}
                  disabled={adding}
                  className="flex-1 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <UserPlus size={12} />
                  {adding ? "Adding…" : "Create & Link"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AddEditEntry modal ───────────────────────────────────────────────────────

function EntryModal({ open, onClose, onSave, initialData, customers, saving, onCustomerCreated }) {
  const [form,          setForm]          = useState(blankForm());
  const [selectedParty, setSelectedParty] = useState(null);

  useEffect(() => {
    if (open) {
      const f = initialData ? { ...blankForm(), ...initialData } : blankForm();
      setForm(f);
      // Restore linked customer when editing
      if (f.party_id) {
        const found = customers.find(c => c.id === Number(f.party_id));
        setSelectedParty(
          found ||
          (initialData?.party_name
            ? { id: Number(f.party_id), party_name: initialData.party_name }
            : null)
        );
      } else {
        setSelectedParty(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isMetal    = ["METAL_IN",  "METAL_OUT"].includes(form.entry_type);
  const isCash     = ["CASH_IN",   "CASH_OUT",  "EXPENSE", "COUNTER_SALE"].includes(form.entry_type);
  const isExpense  = form.entry_type === "EXPENSE";
  const isPurchase = form.entry_type === "METAL_PURCHASE";
  const meta       = getEntryMeta(form.entry_type);

  // METAL_PURCHASE: total cost = weight × rate / 10; balance = cost − amount_paid
  const purchaseTotalCost  = isPurchase && form.metal_weight && form.metal_rate
    ? Math.round(((parseFloat(form.metal_weight) * parseFloat(form.metal_rate)) / 10) * 100) / 100
    : 0;
  const purchaseBalanceDue = isPurchase
    ? Math.max(0, purchaseTotalCost - (parseFloat(form.amount) || 0))
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    // Coerce numerics
    payload.amount       = parseFloat(payload.amount)       || 0;
    payload.metal_weight = parseFloat(payload.metal_weight) || 0;
    payload.metal_rate   = parseFloat(payload.metal_rate)   || 0;
    payload.party_id     = selectedParty?.id ? parseInt(selectedParty.id, 10) : null;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between ${meta.bg} border-b ${meta.border}`}>
          <h2 className={`text-base font-black ${meta.color}`}>
            {initialData ? "Edit Entry" : "Add New Entry"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Entry Type */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Entry Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ENTRY_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("entry_type", t.value)}
                  className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                    form.entry_type === t.value
                      ? `${t.bg} ${t.color} ${t.border} shadow-sm`
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Party */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Party / Customer</label>
            <PartyCombo
              selectedParty={selectedParty}
              onSelect={(c) => setSelectedParty(c)}
              customers={customers}
              onCustomerCreated={onCustomerCreated}
            />
            {!selectedParty && (
              <p className="text-[10px] text-slate-400 mt-1 ml-0.5">
                Leave blank for a general / walk-in entry
              </p>
            )}
          </div>

          {/* Cash / Amount row */}
          {isCash && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Payment Mode</label>
                <select
                  value={form.payment_mode}
                  onChange={e => set("payment_mode", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Expense category */}
          {isExpense && (
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Expense Category</label>
              <select
                value={form.expense_category}
                onChange={e => set("expense_category", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 bg-white"
              >
                {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Metal fields — METAL_IN / METAL_OUT */}
          {isMetal && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Metal Type <span className="text-red-500">*</span></label>
                  <select
                    value={form.metal_type}
                    onChange={e => set("metal_type", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 bg-white"
                  >
                    {METAL_TYPES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Purity</label>
                  <input
                    type="text"
                    value={form.metal_purity}
                    onChange={e => set("metal_purity", e.target.value)}
                    placeholder="e.g. 22K, 99.9"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Weight (g) <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="number" min="0" step="0.001"
                    value={form.metal_weight}
                    onChange={e => set("metal_weight", e.target.value)}
                    placeholder="0.000"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Rate (₹/10g)</label>
                  <input
                    type="number" min="0" step="1"
                    value={form.metal_rate}
                    onChange={e => set("metal_rate", e.target.value)}
                    placeholder="optional"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              {form.metal_weight && form.metal_rate && (
                <p className="text-xs text-amber-700 font-bold bg-amber-50 px-3 py-1.5 rounded-lg">
                  Estimated value: {fmtINR((parseFloat(form.metal_weight) * parseFloat(form.metal_rate)) / 10)}
                </p>
              )}
            </>
          )}

          {/* ── METAL_PURCHASE dedicated form ── */}
          {isPurchase && (
            <>
              {/* Metal details */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-black text-yellow-700 uppercase tracking-wider">Metal Purchased</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Metal Type <span className="text-red-500">*</span></label>
                    <select
                      value={form.metal_type}
                      onChange={e => set("metal_type", e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 bg-white"
                    >
                      {METAL_TYPES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Purity</label>
                    <input
                      type="text"
                      value={form.metal_purity}
                      onChange={e => set("metal_purity", e.target.value)}
                      placeholder="e.g. 24K, 99.9"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Weight (g) <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="number" min="0.001" step="0.001"
                      value={form.metal_weight}
                      onChange={e => set("metal_weight", e.target.value)}
                      placeholder="0.000"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Rate (₹/10g) <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="number" min="1" step="1"
                      value={form.metal_rate}
                      onChange={e => set("metal_rate", e.target.value)}
                      placeholder="e.g. 72000"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>
                </div>
                {purchaseTotalCost > 0 && (
                  <div className="bg-white rounded-lg border border-yellow-200 px-3 py-2 text-xs font-bold text-yellow-800">
                    Total Cost: {fmtINR(purchaseTotalCost)}
                  </div>
                )}
              </div>

              {/* Payment details */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-black text-red-700 uppercase tracking-wider">Payment Made Now</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">
                      Amount Paid (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number" min="0" step="0.01"
                      value={form.amount}
                      onChange={e => set("amount", e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300"
                    />
                    {purchaseTotalCost > 0 && (parseFloat(form.amount) || 0) < purchaseTotalCost && (
                      <p className="text-[10px] text-slate-500 mt-0.5">Can be partial — rest tracked as credit</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Payment Mode</label>
                    <select
                      value={form.payment_mode}
                      onChange={e => set("payment_mode", e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 bg-white"
                    >
                      {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {purchaseTotalCost > 0 && (
                  <div className={`rounded-lg border px-3 py-2 text-xs font-bold flex justify-between ${purchaseBalanceDue > 0 ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                    <span>{purchaseBalanceDue > 0 ? "Balance Due (Credit)" : "Fully Paid"}</span>
                    {purchaseBalanceDue > 0 && <span>{fmtINR(purchaseBalanceDue)}</span>}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Reference & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Ref No.</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={e => set("reference_no", e.target.value)}
                placeholder="Bill / voucher no."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Time</label>
              <input
                type="time"
                value={form.entry_time}
                onChange={e => set("entry_time", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Optional description..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all ${meta.bg.replace("bg-", "bg-").replace("50", "600")} hover:opacity-90 disabled:opacity-50`}
              style={{ backgroundColor: form.entry_type === "CASH_IN" ? "#059669" : form.entry_type === "CASH_OUT" ? "#dc2626" : form.entry_type === "METAL_IN" ? "#d97706" : form.entry_type === "METAL_OUT" ? "#ea580c" : form.entry_type === "EXPENSE" ? "#7c3aed" : form.entry_type === "METAL_PURCHASE" ? "#854d0e" : "#2563eb" }}
            >
              {saving ? "Saving…" : initialData ? "Update Entry" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Close Day modal ──────────────────────────────────────────────────────────

function CloseDayModal({ open, onClose, onConfirm, dayData, saving }) {
  const [notes, setNotes] = useState("");
  if (!open || !dayData) return null;

  const t        = dayData.live_totals || {};
  const netCash  = (t.total_cash_in  || 0) - (t.total_cash_out  || 0);
  const netBank  = (t.total_bank_in  || 0) - (t.total_bank_out  || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 bg-indigo-50 rounded-t-2xl border-b border-indigo-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-indigo-600" />
            <h2 className="text-base font-black text-indigo-700">Close Day — {fmtDisplay(dayData.day_date)}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-500"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Review today's summary before locking the day. Once closed, entries cannot be added or edited.</p>

          {/* Summary grid */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between font-bold text-slate-700 border-b border-slate-200 pb-2">
              <span>Opening Cash</span>
              <span>{fmtINR(dayData.opening_cash)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>+ Cash In</span>
              <span>{fmtINR(t.total_cash_in)}</span>
            </div>
            <div className="flex justify-between text-red-600 font-bold">
              <span>– Cash Out</span>
              <span>{fmtINR(t.total_cash_out)}</span>
            </div>
            {(t.total_expenses || 0) > 0 && (
              <div className="flex justify-between text-violet-600 text-xs pl-3">
                <span>  (incl. Expenses {fmtINR(t.total_expenses)})</span>
              </div>
            )}
            {(t.total_metal_purchase_value || 0) > 0 && (
              <div className="flex justify-between text-yellow-700 text-xs pl-3">
                <span>  (incl. Metal Purchases {fmtINR(t.total_metal_purchase_value)})</span>
              </div>
            )}
            <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-2 text-base">
              <span>Closing Cash</span>
              <span className={netCash >= 0 ? "text-emerald-700" : "text-red-700"}>
                {fmtINR((dayData.opening_cash || 0) + netCash)}
              </span>
            </div>
          </div>

          {/* Bank balance summary */}
          {((t.total_bank_in || 0) + (t.total_bank_out || 0)) > 0 && (
            <div className="bg-blue-50 rounded-xl p-4 space-y-2 text-sm">
              <p className="text-xs font-black text-blue-700 uppercase tracking-wider">Bank / UPI</p>
              <div className="flex justify-between font-bold text-slate-700 border-b border-blue-100 pb-2">
                <span>Opening Bank</span>
                <span>{fmtINR(dayData.opening_bank || 0)}</span>
              </div>
              <div className="flex justify-between text-blue-600 font-bold">
                <span>+ Bank In</span>
                <span>{fmtINR(t.total_bank_in)}</span>
              </div>
              <div className="flex justify-between text-orange-600 font-bold">
                <span>– Bank Out</span>
                <span>{fmtINR(t.total_bank_out)}</span>
              </div>
              <div className="flex justify-between font-black text-slate-800 border-t border-blue-100 pt-2">
                <span>Closing Bank</span>
                <span className={netBank >= 0 ? "text-blue-700" : "text-red-700"}>
                  {fmtINR((dayData.opening_bank || 0) + netBank)}
                </span>
              </div>
            </div>
          )}

          {/* Metal summary */}
          {(t.metal_bal_gold24k || t.metal_bal_gold22k || t.metal_bal_silver) ? (
            <div className="bg-amber-50 rounded-xl p-4 text-sm space-y-1">
              <p className="text-xs font-black text-amber-600 uppercase tracking-wider mb-2">Metal Balances</p>
              {t.metal_bal_gold24k !== undefined && <div className="flex justify-between text-amber-800 font-bold"><span>Gold 24K</span><span>{fmtWt(t.metal_bal_gold24k)}</span></div>}
              {t.metal_bal_gold22k !== undefined && <div className="flex justify-between text-orange-800 font-bold"><span>Gold 22K</span><span>{fmtWt(t.metal_bal_gold22k)}</span></div>}
              {t.metal_bal_silver  !== undefined && <div className="flex justify-between text-slate-700 font-bold"><span>Silver</span><span>{fmtWt(t.metal_bal_silver)}</span></div>}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Day Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any observations for this day…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button
              onClick={() => onConfirm(notes)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Lock size={14} />
              {saving ? "Closing…" : "Close & Lock Day"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main RojMed component ────────────────────────────────────────────────────

export default function RojMed() {
  const { isAdmin }      = useAuth();
  const { markDirty }    = useSellingSync();

  const [selectedDate, setSelectedDate]     = useState(today());
  const [dayData, setDayData]               = useState(null);
  const [customers, setCustomers]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState(null);
  const [entryModal, setEntryModal]         = useState({ open: false, editing: null });
  const [closeDayOpen, setCloseDayOpen]     = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load customers once
  useEffect(() => {
    getCustomers().then(r => setCustomers(r?.data || r || [])).catch(() => {});
  }, []);

  const loadDay = useCallback(async (date) => {
    setLoading(true);
    try {
      const d = await getDay(date);
      setDayData(d);
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to load day", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDay(selectedDate); }, [selectedDate, loadDay]);

  const goDay = (delta) => {
    const next = addDays(selectedDate, delta);
    if (next > today()) return; // Don't navigate into the future
    setSelectedDate(next);
  };

  // ── Entry actions ──────────────────────────────────────────────────────────

  const handleSaveEntry = async (formData) => {
    setSaving(true);
    try {
      let result;
      if (entryModal.editing) {
        result = await editEntry(entryModal.editing.id, formData);
      } else {
        result = await addEntry(selectedDate, formData);
      }
      setDayData(result);
      setEntryModal({ open: false, editing: null });
      markDirty(["dashboard"]);
      showToast(entryModal.editing ? "Entry updated" : "Entry added");
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to save entry", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    setSaving(true);
    try {
      const result = await deleteEntry(entryId);
      setDayData(result);
      setConfirmDelete(null);
      markDirty(["dashboard"]);
      showToast("Entry deleted");
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to delete", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Day close / reopen ─────────────────────────────────────────────────────

  const handleCloseDay = async (notes) => {
    setSaving(true);
    try {
      const result = await closeDay(selectedDate, notes);
      setDayData(result);
      setCloseDayOpen(false);
      markDirty(["dashboard"]);
      showToast("Day closed & locked ✓", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to close day", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReopenDay = async () => {
    setSaving(true);
    try {
      const result = await reopenDay(selectedDate);
      setDayData(result);
      markDirty(["dashboard"]);
      showToast("Day reopened", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to reopen", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const isClosed        = dayData?.status === "CLOSED";
  const t               = dayData?.live_totals || {};
  // manual_totals available but not displayed in current UI
  void dayData?.manual_totals;
  const et              = dayData?.estimate_totals || {};
  const entries         = dayData?.entries || [];
  const estimateEntries = dayData?.estimate_entries || [];
  const hasBankActivity = (t.total_bank_in || 0) + (t.total_bank_out || 0) > 0;

  const isToday  = selectedDate === today();

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BookOpen className="text-white" size={20} />
            </div>
            Roj Med
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-[52px]">Daily Debit &amp; Credit Accounting</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Navigator */}
          <button
            onClick={() => goDay(-1)}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="relative">
            <input
              type="date"
              max={today()}
              value={selectedDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white cursor-pointer w-40"
            />
          </div>

          <button
            onClick={() => goDay(1)}
            disabled={selectedDate >= today()}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>

          {!isToday && (
            <button
              onClick={() => setSelectedDate(today())}
              className="px-3 py-2 text-xs font-black rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Date + Status bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl px-5 py-3.5 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-indigo-500" />
          <span className="text-sm font-bold text-slate-700">{fmtDisplay(selectedDate)}</span>
          {isToday && (
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Today</span>
          )}
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${isClosed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
            {isClosed ? "Closed" : "Open"}
          </span>
        </div>

        <div className="flex gap-2">
          {!isClosed && (
            <button
              onClick={() => setEntryModal({ open: true, editing: null })}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-xl shadow-sm shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <Plus size={15} />
              Add Entry
            </button>
          )}

          {!isClosed && entries.length > 0 && (
            <button
              onClick={() => setCloseDayOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-black rounded-xl active:scale-95 transition-all"
            >
              <Lock size={14} />
              Close Day
            </button>
          )}

          {isClosed && isAdmin && (
            <button
              onClick={handleReopenDay}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-black rounded-xl active:scale-95 transition-all disabled:opacity-50"
            >
              <UnlockKeyhole size={14} />
              Re-open Day
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-semibold">Loading day…</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Cash Balance */}
            <SummaryCard
              icon={<Wallet size={18} />}
              label="Cash Balance"
              value={fmtINR(t.cash_balance)}
              sub={`Open: ${fmtINR(dayData?.opening_cash)} · In: ${fmtINR(t.total_cash_in)} · Out: ${fmtINR(t.total_cash_out)}`}
              accent="indigo"
            />

            {/* Bank Balance */}
            <SummaryCard
              icon={<ArrowDownCircle size={18} />}
              label="Bank / UPI Balance"
              value={fmtINR(t.bank_balance)}
              sub={`Open: ${fmtINR(dayData?.opening_bank || 0)} · In: ${fmtINR(t.total_bank_in)} · Out: ${fmtINR(t.total_bank_out)}`}
              accent={hasBankActivity ? "blue" : "slate"}
            />

            {/* Counter Sales (combined) */}
            <SummaryCard
              icon={<ShoppingBag size={18} />}
              label="Counter Sales"
              value={fmtINR(t.total_counter_sales)}
              sub={`${et.bill_count || 0} bill${et.bill_count !== 1 ? "s" : ""} · Outst: ${fmtINR(et.est_outstanding)}`}
              accent="emerald"
            />
          </div>

          {/* Cash / Bank breakdown bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <ArrowDownCircle size={14} className="text-emerald-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Cash In</p>
                <p className="text-sm font-black text-emerald-700 truncate">{fmtINR(t.total_cash_in)}</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <ArrowUpCircle size={14} className="text-red-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-wider">Cash Out</p>
                <p className="text-sm font-black text-red-600 truncate">{fmtINR(t.total_cash_out)}</p>
                {(t.total_expenses || 0) > 0 && <p className="text-[10px] text-slate-400">Exp: {fmtINR(t.total_expenses)}</p>}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <ArrowDownCircle size={14} className="text-blue-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Bank / UPI In</p>
                <p className="text-sm font-black text-blue-700 truncate">{fmtINR(t.total_bank_in)}</p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <ArrowUpCircle size={14} className="text-orange-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider">Bank / UPI Out</p>
                <p className="text-sm font-black text-orange-600 truncate">{fmtINR(t.total_bank_out)}</p>
              </div>
            </div>
          </div>

          {/* Metal summary row */}
          {(t.total_metal_in_gold24k || t.total_metal_in_gold22k || t.total_metal_in_silver ||
            t.total_metal_out_gold24k || t.total_metal_out_gold22k || t.total_metal_out_silver) ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetalCard metal="Gold 24K" bal={t.metal_bal_gold24k} inW={t.total_metal_in_gold24k} outW={t.total_metal_out_gold24k} opening={dayData?.opening_metal_gold24k} />
              <MetalCard metal="Gold 22K" bal={t.metal_bal_gold22k} inW={t.total_metal_in_gold22k} outW={t.total_metal_out_gold22k} opening={dayData?.opening_metal_gold22k} />
              <MetalCard metal="Silver"   bal={t.metal_bal_silver}  inW={t.total_metal_in_silver}  outW={t.total_metal_out_silver}  opening={dayData?.opening_metal_silver}  />
            </div>
          ) : null}

          {/* ── Metal Purchases summary (if any METAL_PURCHASE entries exist) ── */}
          <MetalPurchasesSection entries={entries} />

          {/* ── Today's Estimates (auto-synced from Estimate page) ── */}
          <EstimatesSection estimateEntries={estimateEntries} et={et} />

          {/* ── Entries Table ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-700">
                Entries <span className="text-slate-400 font-semibold ml-1">({entries.length})</span>
              </h2>
              {isClosed && (
                <span className="flex items-center gap-1 text-xs font-black text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                  <Lock size={11} /> Day Locked
                </span>
              )}
            </div>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <BookOpen size={24} className="text-slate-400" />
                </div>
                <p className="text-slate-600 font-bold text-sm mb-1">No entries yet</p>
                <p className="text-slate-400 text-xs">Add your first debit or credit entry for this day</p>
                {!isClosed && (
                  <button
                    onClick={() => setEntryModal({ open: true, editing: null })}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <Plus size={15} /> Add Entry
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Party</th>
                      <th className="px-4 py-3 text-left">Details</th>
                      <th className="px-4 py-3 text-right">Amount / Weight</th>
                      <th className="px-4 py-3 text-left">Ref / Notes</th>
                      {!isClosed && <th className="px-4 py-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const meta       = getEntryMeta(entry.entry_type);
                      const isMetal    = ["METAL_IN", "METAL_OUT"].includes(entry.entry_type);
                      const isPurchRow = entry.entry_type === "METAL_PURCHASE";
                      const balanceDue = isPurchRow
                        ? Math.max(0, (entry.metal_value || 0) - (entry.amount || 0))
                        : 0;
                      return (
                        <tr key={entry.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${isPurchRow ? "bg-yellow-50/30" : ""}`}>
                          <td className="px-4 py-3 text-slate-400 text-xs font-semibold">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${meta.bg} ${meta.color} ${meta.border}`}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {entry.party_name ? (
                              <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                                <User size={11} className="text-slate-400" />
                                {entry.party_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {isPurchRow ? (
                              <span className="font-semibold text-yellow-700">
                                {entry.metal_type}{entry.metal_purity ? ` (${entry.metal_purity})` : ""}
                                {entry.metal_rate > 0 && (
                                  <span className="block text-slate-400 font-normal">₹{entry.metal_rate}/10g · {entry.payment_mode}</span>
                                )}
                              </span>
                            ) : isMetal ? (
                              <span className="font-semibold">{entry.metal_type}{entry.metal_purity ? ` (${entry.metal_purity})` : ""}</span>
                            ) : entry.expense_category && entry.entry_type === "EXPENSE" ? (
                              <span className="text-violet-600 font-semibold">{entry.expense_category}</span>
                            ) : (
                              <span className="text-slate-500">{entry.payment_mode}</span>
                            )}
                            {entry.entry_time && (
                              <span className="ml-2 text-slate-400">{entry.entry_time}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-black">
                            {isPurchRow ? (
                              <span className="text-yellow-700">
                                {fmtWt(entry.metal_weight)}
                                <span className="block text-xs font-semibold text-slate-500">Total: {fmtINR(entry.metal_value)}</span>
                                <span className="block text-xs font-bold text-red-500">Paid: {fmtINR(entry.amount)}</span>
                                {balanceDue > 0 && (
                                  <span className="block text-[10px] font-bold text-orange-600">Due: {fmtINR(balanceDue)}</span>
                                )}
                              </span>
                            ) : isMetal ? (
                              <span className={meta.color}>
                                {fmtWt(entry.metal_weight)}
                                {entry.metal_value > 0 && (
                                  <span className="block text-xs font-semibold text-slate-400">{fmtINR(entry.metal_value)}</span>
                                )}
                              </span>
                            ) : (
                              <span className={meta.color}>{fmtINR(entry.amount)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">
                            {entry.reference_no && <span className="font-semibold text-slate-600 mr-1">{entry.reference_no}</span>}
                            {entry.notes || "—"}
                          </td>
                          {!isClosed && (
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setEntryModal({ open: true, editing: entry })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(entry)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Closing balances (if closed) ── */}
          {isClosed && (
            <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-indigo-600" />
                <h3 className="text-sm font-black text-indigo-700">Day Closed — Final Balances</h3>
                {dayData?.closed_at && (
                  <span className="text-xs text-indigo-400 ml-auto">
                    Closed at {new Date(dayData.closed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-white rounded-xl p-3 border border-indigo-100">
                  <p className="text-xs text-slate-500 font-semibold mb-0.5">Closing Cash</p>
                  <p className="font-black text-slate-800">{fmtINR(dayData.closing_cash)}</p>
                </div>
                {(dayData.closing_bank || 0) !== 0 && (
                  <div className="bg-white rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-slate-500 font-semibold mb-0.5">Closing Bank</p>
                    <p className="font-black text-blue-700">{fmtINR(dayData.closing_bank)}</p>
                  </div>
                )}
                <div className="bg-white rounded-xl p-3 border border-amber-100">
                  <p className="text-xs text-slate-500 font-semibold mb-0.5">Gold 24K</p>
                  <p className="font-black text-amber-700">{fmtWt(dayData.closing_metal_gold24k)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-orange-100">
                  <p className="text-xs text-slate-500 font-semibold mb-0.5">Gold 22K</p>
                  <p className="font-black text-orange-700">{fmtWt(dayData.closing_metal_gold22k)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200">
                  <p className="text-xs text-slate-500 font-semibold mb-0.5">Silver</p>
                  <p className="font-black text-slate-700">{fmtWt(dayData.closing_metal_silver)}</p>
                </div>
              </div>
              {dayData.notes && (
                <p className="mt-3 text-xs text-indigo-600 bg-white rounded-xl px-4 py-2 border border-indigo-100">
                  📝 {dayData.notes}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      <EntryModal
        open={entryModal.open}
        onClose={() => setEntryModal({ open: false, editing: null })}
        onSave={handleSaveEntry}
        initialData={entryModal.editing}
        customers={customers}
        saving={saving}
        onCustomerCreated={(newCust) => setCustomers(prev => [...prev, newCust])}
      />

      <CloseDayModal
        open={closeDayOpen}
        onClose={() => setCloseDayOpen(false)}
        onConfirm={handleCloseDay}
        dayData={dayData}
        saving={saving}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Entry?"
        message={confirmDelete ? `Delete this ${getEntryMeta(confirmDelete.entry_type).label} entry? This cannot be undone.` : ""}
        confirmText="Delete"
        isDestructive
        onConfirm={() => handleDeleteEntry(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ─── Metal Purchases Section ──────────────────────────────────────────────────

function MetalPurchasesSection({ entries }) {
  const purchases = entries.filter(e => e.entry_type === "METAL_PURCHASE");
  if (purchases.length === 0) return null;

  // Aggregate totals per metal type
  const byMetal = {};
  let grandTotalCost = 0;
  let grandTotalPaid = 0;
  let grandTotalDue  = 0;

  for (const p of purchases) {
    const key = p.metal_type || "Unknown";
    if (!byMetal[key]) byMetal[key] = { weight: 0, totalCost: 0, paid: 0, due: 0 };
    const due = Math.max(0, (p.metal_value || 0) - (p.amount || 0));
    byMetal[key].weight    += (p.metal_weight || 0);
    byMetal[key].totalCost += (p.metal_value  || 0);
    byMetal[key].paid      += (p.amount       || 0);
    byMetal[key].due       += due;
    grandTotalCost += (p.metal_value || 0);
    grandTotalPaid += (p.amount      || 0);
    grandTotalDue  += due;
  }

  return (
    <div className="bg-white rounded-2xl border border-yellow-300 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-yellow-100 flex items-center justify-between bg-yellow-50/60">
        <div className="flex items-center gap-2.5">
          <Coins size={16} className="text-yellow-600" />
          <h2 className="text-sm font-black text-slate-700">
            Metal Purchases
            <span className="text-slate-400 font-semibold ml-1.5">({purchases.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="text-slate-600">Total Cost: <span className="text-yellow-700">{fmtINR(grandTotalCost)}</span></span>
          <span className="text-slate-600">Paid: <span className="text-red-600">{fmtINR(grandTotalPaid)}</span></span>
          {grandTotalDue > 0 && (
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              Due: {fmtINR(grandTotalDue)}
            </span>
          )}
        </div>
      </div>

      {/* Per-metal aggregation */}
      <div className="px-5 py-3 border-b border-yellow-50 flex flex-wrap gap-4">
        {Object.entries(byMetal).map(([metal, vals]) => (
          <div key={metal} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 text-xs">
            <p className="font-black text-yellow-800 mb-1">{metal}</p>
            <p className="text-slate-600 font-semibold">{fmtWt(vals.weight)} · {fmtINR(vals.totalCost)}</p>
            <p className="text-red-500 font-bold">Paid {fmtINR(vals.paid)}{vals.due > 0 ? ` · Due ${fmtINR(vals.due)}` : " ✓"}</p>
          </div>
        ))}
      </div>

      {/* Individual purchase rows */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left">Metal</th>
              <th className="px-4 py-2.5 text-left">Merchant</th>
              <th className="px-4 py-2.5 text-right">Weight</th>
              <th className="px-4 py-2.5 text-right">Rate (₹/10g)</th>
              <th className="px-4 py-2.5 text-right">Total Cost</th>
              <th className="px-4 py-2.5 text-right">Paid</th>
              <th className="px-4 py-2.5 text-right">Balance Due</th>
              <th className="px-4 py-2.5 text-left">Mode · Notes</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => {
              const due = Math.max(0, (p.metal_value || 0) - (p.amount || 0));
              return (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-yellow-50/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-black text-yellow-700">{p.metal_type}</span>
                    {p.metal_purity && <span className="ml-1 text-[10px] text-slate-400">({p.metal_purity})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 font-semibold">
                    {p.party_name || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-yellow-700 text-xs">{fmtWt(p.metal_weight)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                    {p.metal_rate > 0 ? `₹${p.metal_rate.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-slate-800 text-xs">{fmtINR(p.metal_value)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 text-xs">{fmtINR(p.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {due > 0 ? (
                      <span className="font-black text-orange-600">{fmtINR(due)}</span>
                    ) : (
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Settled</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">{p.payment_mode}</span>
                    {p.notes && <span className="ml-2 text-slate-400">{p.notes}</span>}
                    {p.entry_time && <span className="ml-2 text-slate-300">{p.entry_time}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Estimates Section (auto-synced from Estimate page) ──────────────────────

function EstimatesSection({ estimateEntries, et }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedBill, setExpandedBill] = useState(null);

  // Compute metal sold totals (from items) across all bills
  const metalSoldTotals = { "Gold 24K": 0, "Gold 22K": 0, Silver: 0 };
  (estimateEntries || []).forEach(bill => {
    (bill.items || []).forEach(item => {
      const mt = item.metal_type || "Gold 24K";
      if (mt in metalSoldTotals) {
        metalSoldTotals[mt] = Math.round(((metalSoldTotals[mt] || 0) + (item.total_weight || 0)) * 10000) / 10000;
      }
    });
  });
  const hasSoldMetal = Object.values(metalSoldTotals).some(v => v > 0);

  if (!estimateEntries || estimateEntries.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <Receipt size={16} className="text-blue-400" />
          <h2 className="text-sm font-black text-slate-600">Today's Estimates</h2>
          <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wider ml-auto">Auto-synced</span>
        </div>
        <p className="text-xs text-slate-400 mt-1 ml-[26px]">
          No estimates created on this day. Estimates made on the{" "}
          <Link to="/selling/estimate" className="text-blue-500 hover:underline font-semibold">Estimate page</Link>{" "}
          will appear here automatically.
        </p>
      </div>
    );
  }

  const payBadge = (mode) => {
    if (mode === "Cash")       return "bg-emerald-100 text-emerald-700";
    if (mode === "Bank / UPI") return "bg-blue-100 text-blue-700";
    if (mode === "Metal")      return "bg-amber-100 text-amber-700";
    if (mode === "Mixed")      return "bg-violet-100 text-violet-700";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-3.5 border-b border-blue-100 flex items-center justify-between hover:bg-blue-50/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Receipt size={16} className="text-blue-500" />
          <h2 className="text-sm font-black text-slate-700">
            Today's Estimates
            <span className="text-slate-400 font-semibold ml-1.5">({estimateEntries.length})</span>
          </h2>
          <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Auto-synced</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-emerald-600 hidden sm:block">
            Billed: {fmtINR(et.total_billed)}
          </span>
          {et.est_outstanding > 0 && (
            <span className="text-red-500 hidden sm:block">
              Outstanding: {fmtINR(et.est_outstanding)}
            </span>
          )}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* Totals bar */}
          <div className="px-5 py-2.5 bg-blue-50/50 border-b border-blue-100 flex flex-wrap gap-4 text-xs font-bold">
            <span className="text-slate-600">Bills: <span className="text-blue-700">{et.bill_count}</span></span>
            <span className="text-slate-600">Total Billed: <span className="text-slate-800">{fmtINR(et.total_billed)}</span></span>
            <span className="text-slate-600">Cash: <span className="text-emerald-700">{fmtINR(et.est_cash_in)}</span></span>
            {et.est_online_in > 0 && <span className="text-slate-600">Bank/UPI: <span className="text-blue-700">{fmtINR(et.est_online_in)}</span></span>}
            {et.est_outstanding > 0 && <span className="text-slate-600">Outstanding: <span className="text-red-600">{fmtINR(et.est_outstanding)}</span></span>}
            {et.est_metal_in_gold24k > 0 && <span className="text-slate-600">Rcvd G24K: <span className="text-amber-700">{fmtWt(et.est_metal_in_gold24k)}</span></span>}
            {et.est_metal_in_gold22k > 0 && <span className="text-slate-600">Rcvd G22K: <span className="text-orange-700">{fmtWt(et.est_metal_in_gold22k)}</span></span>}
            {et.est_metal_in_silver  > 0 && <span className="text-slate-600">Rcvd Ag: <span className="text-slate-700">{fmtWt(et.est_metal_in_silver)}</span></span>}
            {hasSoldMetal && <span className="w-px h-3 bg-blue-200 self-center hidden sm:block" />}
            {metalSoldTotals["Gold 24K"] > 0 && <span className="text-slate-600">Sold G24K: <span className="text-indigo-700">{fmtWt(metalSoldTotals["Gold 24K"])}</span></span>}
            {metalSoldTotals["Gold 22K"] > 0 && <span className="text-slate-600">Sold G22K: <span className="text-indigo-700">{fmtWt(metalSoldTotals["Gold 22K"])}</span></span>}
            {metalSoldTotals["Silver"]   > 0 && <span className="text-slate-600">Sold Ag: <span className="text-indigo-700">{fmtWt(metalSoldTotals["Silver"])}</span></span>}
          </div>

          {/* Bills table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Bill #</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-right">Billed</th>
                  <th className="px-4 py-2.5 text-right">Metal Sold</th>
                  <th className="px-4 py-2.5 text-right">Cash Paid</th>
                  <th className="px-4 py-2.5 text-right">Online</th>
                  <th className="px-4 py-2.5 text-right">Metal Rcvd</th>
                  <th className="px-4 py-2.5 text-right">Outstanding</th>
                  <th className="px-4 py-2.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {estimateEntries.map((bill) => {
                  const hasItems    = bill.items && bill.items.length > 0;
                  const hasMetal    = (bill.metal_gold24k_wt + bill.metal_gold22k_wt + bill.metal_silver_wt) > 0;
                  const isExpBill   = expandedBill === bill.id;
                  return (
                    <React.Fragment key={bill.id}>
                      <tr className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${bill.outstanding > 0 ? "bg-red-50/20" : ""}`}>
                        <td className="px-4 py-3 font-black text-blue-600 text-xs">
                          <Link
                            to="/selling/estimate"
                            className="hover:underline flex items-center gap-1"
                          >
                            #{bill.reference_id}
                            <ExternalLink size={10} />
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-700 font-semibold">{bill.party_name || "—"}</span>
                          {bill.customer_type && (
                            <span className="ml-1.5 text-[10px] text-slate-400">{bill.customer_type}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${payBadge(bill.payment_mode)}`}>
                            {bill.payment_mode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-800 text-xs">{fmtINR(bill.amount)}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          {(() => {
                            const soldByMetal = {};
                            (bill.items || []).forEach(item => {
                              const mt = item.metal_type || "Gold 24K";
                              soldByMetal[mt] = Math.round(((soldByMetal[mt] || 0) + (item.total_weight || 0)) * 10000) / 10000;
                            });
                            const entries = Object.entries(soldByMetal).filter(([, w]) => w > 0);
                            if (!entries.length) return <span className="text-slate-300">—</span>;
                            return (
                              <span className="text-indigo-700 font-bold">
                                {entries.map(([mt, w]) => (
                                  <span key={mt} className="block">
                                    {mt === "Gold 24K" ? "G24" : mt === "Gold 22K" ? "G22" : "Ag"}: {fmtWt(w)}
                                  </span>
                                ))}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700 text-xs">{fmtINR(bill.cash_received)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600 text-xs">
                          {bill.online_received > 0 ? fmtINR(bill.online_received) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {hasMetal ? (
                            <span className="text-amber-700 font-bold">
                              {bill.metal_gold24k_wt > 0 && <span className="block">G24: {fmtWt(bill.metal_gold24k_wt)}</span>}
                              {bill.metal_gold22k_wt > 0 && <span className="block">G22: {fmtWt(bill.metal_gold22k_wt)}</span>}
                              {bill.metal_silver_wt  > 0 && <span className="block">Ag: {fmtWt(bill.metal_silver_wt)}</span>}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {bill.outstanding > 0 ? (
                            <span className="font-black text-red-600 text-xs">{fmtINR(bill.outstanding)}</span>
                          ) : bill.refund_due > 0 ? (
                            <span className="font-bold text-violet-600 text-xs">Refund {fmtINR(bill.refund_due)}</span>
                          ) : (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Settled</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasItems && (
                            <button
                              onClick={() => setExpandedBill(isExpBill ? null : bill.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="View items"
                            >
                              {isExpBill ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded items row */}
                      {isExpBill && hasItems && (
                        <tr className="bg-blue-50/40">
                          <td colSpan={10} className="px-6 py-3">
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-2">Items Sold</p>
                            <div className="flex flex-wrap gap-2">
                              {bill.items.map((item, i) => (
                                <div key={i} className="bg-white border border-blue-100 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700">
                                  <span className="text-slate-400 mr-1">{item.metal_type}</span>
                                  {item.category} · {item.total_pcs} pcs · {fmtWt(item.total_weight)}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-right">
            <Link
              to="/selling/estimate"
              className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-700"
            >
              Open Estimate Page <ExternalLink size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, accent }) {
  const colors = {
    indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  icon: "bg-indigo-500",  val: "text-indigo-700" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "bg-emerald-500", val: "text-emerald-700" },
    red:     { bg: "bg-red-50",     border: "border-red-200",     icon: "bg-red-500",     val: "text-red-700" },
    blue:    { bg: "bg-blue-50",    border: "border-blue-200",    icon: "bg-blue-500",    val: "text-blue-700" },
    amber:   { bg: "bg-amber-50",   border: "border-amber-200",   icon: "bg-amber-500",   val: "text-amber-700" },
    violet:  { bg: "bg-violet-50",  border: "border-violet-200",  icon: "bg-violet-500",  val: "text-violet-700" },
    slate:   { bg: "bg-slate-50",   border: "border-slate-200",   icon: "bg-slate-400",   val: "text-slate-600" },
  };
  const c = colors[accent] || colors.indigo;
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 ${c.icon} rounded-lg flex items-center justify-center text-white`}>{icon}</div>
        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-black ${c.val} mb-0.5`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 font-semibold">{sub}</p>}
    </div>
  );
}

// ─── Metal Card ───────────────────────────────────────────────────────────────

function MetalCard({ metal, bal, inW, outW, opening }) {
  const isGold24 = metal === "Gold 24K";
  const isGold22 = metal === "Gold 22K";
  const color = isGold24 ? "amber" : isGold22 ? "orange" : "slate";
  const colorMap = {
    amber:  { bg: "bg-amber-50",  border: "border-amber-200",  val: "text-amber-700",  sub: "text-amber-500"  },
    orange: { bg: "bg-orange-50", border: "border-orange-200", val: "text-orange-700", sub: "text-orange-500" },
    slate:  { bg: "bg-slate-50",  border: "border-slate-200",  val: "text-slate-700",  sub: "text-slate-500"  },
  };
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black text-slate-600 uppercase tracking-wider">{metal}</span>
        <Coins size={14} className={c.sub} />
      </div>
      <p className={`text-xl font-black ${c.val} mb-2`}>{fmtWt(bal)}</p>
      <div className="flex gap-3 text-xs font-semibold">
        <span className="text-emerald-600">↓ In: {fmtWt(inW)}</span>
        <span className="text-red-500">↑ Out: {fmtWt(outW)}</span>
        {opening > 0 && <span className="text-slate-400">Open: {fmtWt(opening)}</span>}
      </div>
    </div>
  );
}
