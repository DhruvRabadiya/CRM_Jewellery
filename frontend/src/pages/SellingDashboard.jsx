import React, { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Coins, Wallet, Receipt, Users, RefreshCw } from "lucide-react";
import Toast from "../components/Toast";
import { getSellingDashboard } from "../api/sellingDashboardService";

const fmtWeight = (value, digits = 3) => `${Number(value || 0).toFixed(digits)}g`;
const fmtINR = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const METAL_META = {
  "Gold 24K": {
    accent: "from-yellow-400 to-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  "Gold 22K": {
    accent: "from-amber-500 to-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  Silver: {
    accent: "from-slate-400 to-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

const METAL_KEYS = ["Gold 24K", "Gold 22K", "Silver"];

const paymentModeClass = (mode) => {
  if (mode === "Metal")      return "bg-amber-100 text-amber-700";
  if (mode === "Bank / UPI") return "bg-blue-100 text-blue-600";
  if (mode === "Mixed")      return "bg-violet-100 text-violet-700";
  if (mode === "Cash")       return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-500";
};

export default function SellingDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSellingDashboard();
      setData(result);
    } catch (error) {
      showToast(error?.message || "Failed to fetch selling dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-semibold text-sm">Loading selling dashboard...</p>
        </div>
      </div>
    );
  }

  const metalPayments   = data?.metal_payments_received || {};
  const recentBills     = data?.recent_bills             || [];
  const totalMetalValue = data?.total_metal_payment_value || 0;

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="text-white" size={20} />
            </div>
            Selling Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            Counter collections, customer metal pool, and recent estimate activity
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Customer Metal cards — total received as payment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {METAL_KEYS.map((key) => {
          const m   = METAL_META[key];
          const rec = metalPayments[key] || { weight: 0, value: 0 };
          return (
            <div key={key} className={`${m.bg} ${m.border} rounded-2xl border p-5`}>
              <div className={`w-12 h-2 rounded-full bg-gradient-to-r ${m.accent} mb-4`} />
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Payment Received</p>
              <p className="text-xl font-black text-slate-800 mt-1">{key}</p>
              <p className="text-3xl font-black text-slate-900 mt-3">{fmtWeight(rec.weight, 4)}</p>
              {rec.value > 0 ? (
                <p className="text-xs font-semibold text-slate-500 mt-1">{fmtINR(rec.value)} est. value</p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">No payments recorded yet</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Recent Estimates */}
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-indigo-500" />
              <h2 className="font-black text-slate-800">Recent Estimates</h2>
            </div>
            {recentBills.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="font-bold">No estimates yet</p>
                <p className="text-sm mt-1">Estimate activity will appear here once estimates are created.</p>
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
                      const hasRefund  = parseFloat(bill.refund_due) > 0;
                      const hasBalance = parseFloat(bill.outstanding_amount) > 0;
                      const metalParts = [
                        bill.metal_gold24k > 0 ? `24K ${fmtWeight(bill.metal_gold24k, 4)}` : null,
                        bill.metal_gold22k > 0 ? `22K ${fmtWeight(bill.metal_gold22k, 4)}` : null,
                        bill.metal_silver  > 0 ? `Ag ${fmtWeight(bill.metal_silver, 4)}`   : null,
                      ].filter(Boolean);

                      return (
                        <tr key={`${bill.bill_no}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          <td className="px-4 py-3 font-black text-indigo-600 whitespace-nowrap">#{bill.bill_no}</td>

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
                              <span className="text-[10px] text-slate-300 font-semibold">-</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                            {fmtINR(bill.total_amount)}
                          </td>

                          {/* Cash collected + metal badges */}
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-green-700 whitespace-nowrap">{fmtINR(bill.amount_paid)}</p>
                            {metalParts.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1 mt-1">
                                {metalParts.map((part) => (
                                  <span key={part} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                    {part}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {hasRefund ? (
                              <span className="text-emerald-600 font-bold text-xs">Refund {fmtINR(bill.refund_due)}</span>
                            ) : hasBalance ? (
                              <span className="font-black text-red-600">{fmtINR(bill.outstanding_amount)}</span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Settled</span>
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
        <div className="space-y-5">

          {/* Collections */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-emerald-500" />
              <h2 className="font-black text-slate-800">Collections</h2>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Cash Received</p>
              <p className="text-3xl font-black text-emerald-800 mt-2">{fmtINR(data?.cash_status?.cash_total)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <p className="text-[11px] font-black text-blue-700 uppercase tracking-widest">Bank / UPI Received</p>
              <p className="text-2xl font-black text-blue-800 mt-2">{fmtINR(data?.cash_status?.online_total)}</p>
            </div>
            {totalMetalValue > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Metal Value Received</p>
                <p className="text-2xl font-black text-amber-800 mt-2">{fmtINR(totalMetalValue)}</p>
                <p className="text-xs text-amber-600 mt-1">Estimated at recorded reference rates</p>
              </div>
            )}
          </div>

          {/* Counter Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-amber-500" />
              <h2 className="font-black text-slate-800">Counter Summary</h2>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Estimates</span>
              <span className="font-bold text-slate-800">{data?.bill_count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Billed</span>
              <span className="font-bold text-slate-800">{fmtINR(data?.billed_total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Customer Receivable</span>
              <span className="font-bold text-red-600">{fmtINR(data?.receivable_total)}</span>
            </div>
          </div>

          {/* Accounting note */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-purple-500" />
              <h2 className="font-black text-slate-800">Accounting Note</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cash and Bank/UPI reflect counter ledger receipts net of refunds. Metal payments are
              tracked per customer in the ledger. Metal credit cards show net excess held, plus
              total weight received as payment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
