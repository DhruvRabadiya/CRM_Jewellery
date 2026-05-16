import React, { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Coins, Wallet, Receipt, Users, RefreshCw,
  NotebookPen, TrendingUp, TrendingDown, Lock, Plus, X,
  CheckCircle2, ArrowDownCircle, ArrowUpCircle, Building2,
  ShoppingBag, Wrench, Scale,
} from "lucide-react";
import { Link } from "react-router-dom";
import Toast from "../components/Toast";
import { getSellingDashboard } from "../api/sellingDashboardService";
import { getTodaySummary as getRojMedSummary, addEntry as addRojMedEntry } from "../api/rojMedService";
import { getCustomers } from "../api/customerService";
import { useSellingSync } from "../context/SellingSyncContext";

// ─── formatters ───────────────────────────────────────────────────────────────

const fmtWeight = (v, d = 3) => `${Number(v || 0).toFixed(d)}g`;
const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const paymentModeClass = (mode) => {
  if (mode === "Metal")      return "bg-amber-100 text-amber-700";
  if (mode === "Bank / UPI") return "bg-blue-100 text-blue-600";
  if (mode === "Mixed")      return "bg-violet-100 text-violet-700";
  if (mode === "Cash")       return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-500";
};

// ─── Quick-entry config ───────────────────────────────────────────────────────

const QUICK_TYPES = [
  { value: "CASH_IN",  label: "Cash In",  color: "bg-emerald-600 hover:bg-emerald-700" },
  { value: "CASH_OUT", label: "Cash Out", color: "bg-red-600 hover:bg-red-700"         },
  { value: "EXPENSE",  label: "Expense",  color: "bg-violet-600 hover:bg-violet-700"   },
];
const EXPENSE_CATS = ["Labour", "Rent", "Electricity", "Travel", "Misc / Other"];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single balance card — used in the Counter Position row */
function BalanceCard({ icon, label, value, sub, colorBg, colorBorder, colorVal, colorSub, pulse = false }) {
  return (
    <div className={`${colorBg} border ${colorBorder} rounded-2xl p-4 flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`text-sm ${colorVal} opacity-70`}>{icon}</div>
        <span className={`text-[10px] font-black uppercase tracking-widest ${colorSub}`}>{label}</span>
        {pulse && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      </div>
      <p className={`text-xl font-black ${colorVal} leading-none`}>{value}</p>
      {sub && <p className={`text-[10px] font-semibold ${colorSub} mt-0.5 truncate`}>{sub}</p>}
    </div>
  );
}

/** A mini flow tile — used in the "Today's Flow" bar */
function FlowTile({ icon, label, value, colorBg, colorBorder, colorIcon, colorVal }) {
  return (
    <div className={`${colorBg} border ${colorBorder} rounded-xl px-4 py-2.5 flex items-center gap-2.5`}>
      <div className={`${colorIcon} flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-[10px] font-black uppercase tracking-wider ${colorIcon}`}>{label}</p>
        <p className={`text-sm font-black ${colorVal} truncate`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SellingDashboard() {
  const { versions, markDirty } = useSellingSync();

  const [data,      setData]      = useState(null);
  const [rojMed,    setRojMed]    = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // Quick Entry state
  const [qeOpen,    setQeOpen]    = useState(false);
  const [qeType,    setQeType]    = useState("CASH_IN");
  const [qeAmount,  setQeAmount]  = useState("");
  const [qeParty,   setQeParty]   = useState("");
  const [qeMode,    setQeMode]    = useState("Cash");
  const [qeExpCat,  setQeExpCat]  = useState("Labour");
  const [qeNotes,   setQeNotes]   = useState("");
  const [qeSaving,  setQeSaving]  = useState(false);
  const [qeSuccess, setQeSuccess] = useState(false);

  const resetQe = () => {
    setQeAmount(""); setQeParty(""); setQeNotes("");
    setQeMode("Cash"); setQeExpCat("Labour"); setQeSuccess(false);
  };

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [result, rm] = await Promise.all([
        getSellingDashboard(),
        getRojMedSummary().catch(() => null),
      ]);
      setData(result);
      setRojMed(rm);
    } catch (err) {
      showToast(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever Roj Med mutates (add / edit / delete / close)
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, versions.dashboard]);

  useEffect(() => {
    getCustomers().then(r => setCustomers(r?.data || r || [])).catch(() => {});
  }, []);

  // ── Quick Entry submit ──────────────────────────────────────────────────────

  const handleQuickEntry = async (e) => {
    e.preventDefault();
    const amt = parseFloat(qeAmount);
    if (!amt || amt <= 0) { showToast("Enter a valid amount"); return; }
    setQeSaving(true);
    try {
      await addRojMedEntry(todayStr(), {
        entry_type:       qeType,
        amount:           amt,
        payment_mode:     qeMode,
        party_id:         qeParty ? parseInt(qeParty, 10) : null,
        expense_category: qeType === "EXPENSE" ? qeExpCat : "",
        notes:            qeNotes,
      });
      setQeSuccess(true);
      resetQe();
      markDirty(["dashboard"]);
      setTimeout(() => setQeSuccess(false), 3000);
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || "Failed to save entry");
    } finally {
      setQeSaving(false);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-semibold text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const recentBills = data?.recent_bills || [];

  // Roj Med live balances (from getTodaySummary — today only)
  const rmExists        = rojMed?.exists ?? false;
  const rmStatus        = rojMed?.status ?? "NOT_STARTED";
  const rmCash          = rojMed?.cash_balance        ?? 0;
  const rmBank          = rojMed?.bank_balance         ?? 0;
  const rmCashIn        = rojMed?.total_cash_in        ?? 0;
  const rmCashOut       = rojMed?.total_cash_out       ?? 0;
  const rmBankIn        = rojMed?.total_bank_in        ?? 0;
  const rmBankOut       = rojMed?.total_bank_out       ?? 0;
  const rmOpenCash      = rojMed?.opening_cash         ?? 0;
  const rmOpenBank      = rojMed?.opening_bank         ?? 0;
  const rmExpenses      = rojMed?.total_expenses       ?? 0;
  const rmSales         = rojMed?.total_counter_sales  ?? 0;
  const rmMetalPurchVal = rojMed?.total_metal_purchase_value ?? 0;
  const rmEntries       = rojMed?.entry_count          ?? 0;
  const rmBills         = rojMed?.bill_count           ?? 0;

  const hasBankActivity = rmBankIn + rmBankOut > 0;

  // All-time stock from stock_master — same source as Production Dashboard
  const stock     = data?.stock    || {};
  const g24k      = stock.gold24k  || {};
  const g22k      = stock.gold22k  || {};
  const silv      = stock.silver   || {};

  // All-time estimate totals (from getSellingDashboard)
  const billCount       = data?.bill_count      ?? 0;
  const billedTotal     = data?.billed_total    ?? 0;
  const receivableTotal = data?.receivable_total ?? 0;

  const isClosed  = rmStatus === "CLOSED";
  const isOpen    = rmStatus === "OPEN";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="text-white" size={20} />
            </div>
            Selling Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            Live counter position, balances, and today's activity
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Metal Stock — from stock_master (same as Production Dashboard) ── */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Metal Stock
          </h2>
          <span className="text-[10px] font-semibold text-slate-400">
            Live · synced with Production
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { key: "gold24k", label: "Gold 24K", row: g24k, bg: "bg-amber-50",  border: "border-amber-200",  val: "text-amber-700",  sub: "text-amber-500",  icon: <Scale size={15}/> },
            { key: "gold22k", label: "Gold 22K", row: g22k, bg: "bg-orange-50", border: "border-orange-200", val: "text-orange-700", sub: "text-orange-500", icon: <Scale size={15}/> },
            { key: "silver",  label: "Silver",   row: silv, bg: "bg-slate-50",  border: "border-slate-200",  val: "text-slate-700",  sub: "text-slate-400",  icon: <Coins size={15}/> },
          ].map(({ key, label, row, bg, border, val, sub, icon }) => (
            <div key={key} className={`${bg} border ${border} rounded-2xl p-4`}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`${val} opacity-70`}>{icon}</div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${sub}`}>{label}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className={`text-lg font-black ${val} leading-none`}>{fmtWeight(row.opening_stock, 3)}</p>
                  <p className={`text-[10px] font-semibold ${sub} mt-0.5`}>Free Stock</p>
                </div>
                <div>
                  <p className="text-lg font-black text-indigo-600 leading-none">{fmtWeight(row.inprocess_weight, 3)}</p>
                  <p className="text-[10px] font-semibold text-indigo-400 mt-0.5">In Production</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cash / Bank Position — Today (from Roj Med) ── */}
      {rmExists && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Cash Position — Today
            </h2>
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
              isClosed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            }`}>
              {isClosed ? "Day Closed" : "Live"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <BalanceCard
              icon={<Wallet size={16} />}
              label="Cash in Counter"
              value={fmtINR(rmCash)}
              sub={`Open: ${fmtINR(rmOpenCash)}`}
              colorBg={rmCash >= 0 ? "bg-emerald-50" : "bg-red-50"}
              colorBorder={rmCash >= 0 ? "border-emerald-200" : "border-red-200"}
              colorVal={rmCash >= 0 ? "text-emerald-700" : "text-red-600"}
              colorSub="text-emerald-500"
              pulse={isOpen}
            />
            <BalanceCard
              icon={<Building2 size={16} />}
              label="Bank / UPI"
              value={fmtINR(rmBank)}
              sub={`Open: ${fmtINR(rmOpenBank)}`}
              colorBg={hasBankActivity ? (rmBank >= 0 ? "bg-blue-50" : "bg-red-50") : "bg-slate-50"}
              colorBorder={hasBankActivity ? (rmBank >= 0 ? "border-blue-200" : "border-red-200") : "border-slate-200"}
              colorVal={hasBankActivity ? (rmBank >= 0 ? "text-blue-700" : "text-red-600") : "text-slate-500"}
              colorSub={hasBankActivity ? "text-blue-500" : "text-slate-400"}
              pulse={isOpen && hasBankActivity}
            />
            <FlowTile
              icon={<ArrowDownCircle size={14} />}
              label="Cash In Today"
              value={fmtINR(rmCashIn)}
              colorBg="bg-emerald-50" colorBorder="border-emerald-200"
              colorIcon="text-emerald-500" colorVal="text-emerald-700"
            />
            <FlowTile
              icon={<ArrowUpCircle size={14} />}
              label="Cash Out Today"
              value={fmtINR(rmCashOut)}
              colorBg="bg-red-50" colorBorder="border-red-200"
              colorIcon="text-red-500" colorVal="text-red-600"
            />
          </div>
        </section>
      )}

      {/* ── Roj Med status strip (compact clickable link) ── */}
      <Link to="/selling/roj-med" className="block group">
        <div className={`rounded-2xl border px-5 py-3 transition-all group-hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
          isClosed   ? "bg-slate-50 border-slate-200" :
          rmExists   ? "bg-indigo-50 border-indigo-200" :
                       "bg-white border-dashed border-indigo-300"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <NotebookPen size={15} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800 text-sm">Roj Med — Today</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isClosed ? "bg-red-100 text-red-700" :
                  rmExists ? "bg-emerald-100 text-emerald-700" :
                             "bg-slate-100 text-slate-500"
                }`}>
                  {isClosed ? "Closed" : rmExists ? "Open" : "Not Started"}
                </span>
                {isClosed && <Lock size={11} className="text-slate-400" />}
              </div>
              {rmExists && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {rmEntries} manual {rmEntries === 1 ? "entry" : "entries"} · {rmBills} {rmBills === 1 ? "estimate" : "estimates"} · Click to open full ledger →
                </p>
              )}
              {!rmExists && (
                <p className="text-xs text-slate-500 mt-0.5">Click to open today's accounting ledger →</p>
              )}
            </div>
          </div>
          {rmExists && (
            <div className="flex flex-wrap gap-3 text-xs font-semibold ml-11 sm:ml-0">
              {rmExpenses > 0 && (
                <span className="text-violet-600">Exp: {fmtINR(rmExpenses)}</span>
              )}
              {rmSales > 0 && (
                <span className="text-blue-600">Sales: {fmtINR(rmSales)}</span>
              )}
              {rmMetalPurchVal > 0 && (
                <span className="text-yellow-700">Metal Buy: {fmtINR(rmMetalPurchVal)}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left: Recent Estimates */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-indigo-500" />
              <h2 className="font-black text-slate-800">Recent Estimates</h2>
              {billCount > 0 && (
                <span className="ml-auto text-xs text-slate-500 font-semibold">{billCount} total</span>
              )}
            </div>

            {recentBills.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Receipt size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold">No estimates yet</p>
                <p className="text-sm mt-1">Estimates appear here as they are created on the counter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Bill</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Mode</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Collected</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.map((bill, idx) => {
                      const hasRefund  = parseFloat(bill.refund_due)         > 0;
                      const hasBalance = parseFloat(bill.outstanding_amount)  > 0;
                      const metalParts = [
                        bill.metal_gold24k > 0 ? `24K ${fmtWeight(bill.metal_gold24k, 4)}` : null,
                        bill.metal_gold22k > 0 ? `22K ${fmtWeight(bill.metal_gold22k, 4)}` : null,
                        bill.metal_silver  > 0 ? `Ag ${fmtWeight(bill.metal_silver,  4)}`  : null,
                      ].filter(Boolean);

                      return (
                        <tr
                          key={`${bill.bill_no}-${idx}`}
                          className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                        >
                          <td className="px-4 py-3 font-black text-indigo-600 whitespace-nowrap">
                            #{bill.bill_no}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{bill.customer_name || "Walk-in"}</p>
                            {bill.customer_type && bill.customer_type !== "Retail" && (
                              <span className="text-[9px] font-bold text-slate-400">{bill.customer_type}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {bill.payment_mode ? (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${paymentModeClass(bill.payment_mode)}`}>
                                {bill.payment_mode}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300 font-semibold">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                            {fmtINR(bill.total_amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-green-700 whitespace-nowrap">{fmtINR(bill.amount_paid)}</p>
                            {metalParts.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1 mt-1">
                                {metalParts.map(part => (
                                  <span key={part} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                    {part}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {hasRefund ? (
                              <span className="text-emerald-600 font-bold text-xs">
                                Refund {fmtINR(bill.refund_due)}
                              </span>
                            ) : hasBalance ? (
                              <span className="font-black text-red-600">{fmtINR(bill.outstanding_amount)}</span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Quick Roj Med Entry */}
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
            <button
              onClick={() => { setQeOpen(o => !o); resetQe(); }}
              className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-indigo-50/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                  <NotebookPen size={14} className="text-white" />
                </div>
                <span className="font-black text-slate-800 text-sm">Quick Roj Med Entry</span>
              </div>
              <div className="flex items-center gap-2">
                {qeSuccess && <CheckCircle2 size={15} className="text-emerald-500" />}
                {qeOpen
                  ? <X size={16} className="text-slate-400" />
                  : <Plus size={16} className="text-indigo-500" />}
              </div>
            </button>

            {qeOpen && (
              <form onSubmit={handleQuickEntry} className="px-5 pb-5 space-y-3 border-t border-indigo-100 pt-4">
                {/* Type */}
                <div className="flex gap-1.5">
                  {QUICK_TYPES.map(qt => (
                    <button
                      key={qt.value}
                      type="button"
                      onClick={() => setQeType(qt.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                        qeType === qt.value
                          ? `${qt.color} text-white shadow-sm`
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {qt.label}
                    </button>
                  ))}
                </div>

                {/* Amount + Mode */}
                <div className="flex gap-2">
                  <input
                    required
                    type="number" min="0.01" step="0.01"
                    value={qeAmount}
                    onChange={e => setQeAmount(e.target.value)}
                    placeholder="Amount ₹"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                  <select
                    value={qeMode}
                    onChange={e => setQeMode(e.target.value)}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white focus:ring-2 focus:ring-indigo-300"
                  >
                    <option>Cash</option>
                    <option>Bank / UPI</option>
                    <option>Other</option>
                  </select>
                </div>

                {/* Expense category */}
                {qeType === "EXPENSE" && (
                  <select
                    value={qeExpCat}
                    onChange={e => setQeExpCat(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-300"
                  >
                    {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}

                {/* Party */}
                <select
                  value={qeParty}
                  onChange={e => setQeParty(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">— No party / General —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.party_name}</option>
                  ))}
                </select>

                {/* Notes */}
                <input
                  type="text"
                  value={qeNotes}
                  onChange={e => setQeNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
                />

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={qeSaving}
                    className={`flex-1 py-2 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 ${
                      qeType === "CASH_IN"  ? "bg-emerald-600 hover:bg-emerald-700" :
                      qeType === "CASH_OUT" ? "bg-red-600 hover:bg-red-700" :
                                              "bg-violet-600 hover:bg-violet-700"
                    }`}
                  >
                    {qeSaving ? "Saving…" : "Save to Roj Med"}
                  </button>
                  <Link
                    to="/selling/roj-med"
                    className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 flex items-center"
                    title="Open full Roj Med"
                  >
                    Open
                  </Link>
                </div>

                {qeSuccess && (
                  <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Saved to Roj Med ✓
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Counter Summary — Roj Med + Estimates combined */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag size={16} className="text-indigo-500" />
              <h2 className="font-black text-slate-800 text-sm">Counter Summary</h2>
              <span className="text-[10px] text-slate-400 font-semibold ml-auto">All-time · Today</span>
            </div>

            {/* Estimate totals */}
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimates</p>
              <Row label="Bills Raised"       value={billCount}               plain />
              <Row label="Total Billed"       value={fmtINR(billedTotal)} />
              <Row label="Outstanding (due)"  value={fmtINR(receivableTotal)} red={receivableTotal > 0} />
            </div>

            {/* Roj Med totals */}
            {rmExists && (
              <div className="space-y-2 pb-3 border-b border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roj Med Ledger</p>
                <Row label="Total Entries"      value={rmEntries}              plain />
                <Row label="Counter Sales"      value={fmtINR(rmSales)} />
                {rmExpenses > 0 && (
                  <Row label="Expenses"         value={fmtINR(rmExpenses)}    red />
                )}
                {rmMetalPurchVal > 0 && (
                  <Row label="Metal Purchases"  value={fmtINR(rmMetalPurchVal)} amber />
                )}
              </div>
            )}

            {/* Available balances summary */}
            {rmExists && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Balances</p>
                <Row
                  label="Cash in Counter"
                  value={fmtINR(rmCash)}
                  green={rmCash >= 0}
                  red={rmCash < 0}
                />
                {hasBankActivity && (
                  <Row
                    label="Bank / UPI"
                    value={fmtINR(rmBank)}
                    blue={rmBank >= 0}
                    red={rmBank < 0}
                  />
                )}
              </div>
            )}

            {!rmExists && (
              <p className="text-xs text-slate-400 pt-1">
                Open today's Roj Med to see live balance summary here.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Row helper for the Counter Summary card ──────────────────────────────────

function Row({ label, value, plain, red, green, blue, amber }) {
  const valClass = red    ? "text-red-600 font-black"
                 : green  ? "text-emerald-700 font-black"
                 : blue   ? "text-blue-700 font-black"
                 : amber  ? "text-amber-700 font-bold"
                 : plain  ? "text-slate-800 font-bold"
                 :          "text-slate-800 font-semibold";
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={valClass}>{value}</span>
    </div>
  );
}
