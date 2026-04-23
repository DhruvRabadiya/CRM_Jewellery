import React, { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Coins, Wallet, Receipt, Users, RefreshCw } from "lucide-react";
import Toast from "../components/Toast";
import { getSellingDashboard } from "../api/sellingDashboardService";

const fmtWeight = (value) => `${Number(value || 0).toFixed(3)}g`;
const fmtINR = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const METAL_CARDS = [
  { key: "Gold 24K", accent: "from-yellow-400 to-amber-500", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "Gold 22K", accent: "from-amber-500 to-orange-500", bg: "bg-orange-50", border: "border-orange-200" },
  { key: "Silver", accent: "from-slate-400 to-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
];

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

  const metalInventory = data?.metal_inventory || {};
  const recentBills = data?.recent_bills || [];

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="text-white" size={20} />
            </div>
            Selling Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            Counter cash, customer metal pool, and recent billing activity
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {METAL_CARDS.map((card) => (
          <div key={card.key} className={`${card.bg} ${card.border} rounded-2xl border p-5`}>
            <div className={`w-12 h-2 rounded-full bg-gradient-to-r ${card.accent} mb-4`} />
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Customer Metal</p>
            <p className="text-xl font-black text-slate-800 mt-1">{card.key}</p>
            <p className="text-3xl font-black text-slate-900 mt-3">{fmtWeight(metalInventory[card.key])}</p>
            <p className="text-xs text-slate-500 mt-1">Available from customer-provided metal</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-indigo-500" />
              <h2 className="font-black text-slate-800">Recent Bills</h2>
            </div>
            {recentBills.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="font-bold">No bills yet</p>
                <p className="text-sm mt-1">Counter billing activity will appear here once bills are created.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Bill</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Paid</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.map((bill, idx) => (
                      <tr key={`${bill.bill_no}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="px-4 py-3 font-black text-indigo-600">#{bill.bill_no}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{bill.customer_name || "Walk-in"}</td>
                        <td className="px-4 py-3 text-slate-500">{bill.customer_type || "Retail"}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtINR(bill.total_amount)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">{fmtINR(bill.amount_paid)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${(bill.outstanding_amount || 0) > 0 ? "text-red-600" : "text-green-700"}`}>
                          {fmtINR(bill.outstanding_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-emerald-500" />
              <h2 className="font-black text-slate-800">Cash Status</h2>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Available Cash</p>
              <p className="text-3xl font-black text-emerald-800 mt-2">{fmtINR(data?.cash_status?.cash_total)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <p className="text-[11px] font-black text-blue-700 uppercase tracking-widest">Online Collected</p>
              <p className="text-2xl font-black text-blue-800 mt-2">{fmtINR(data?.cash_status?.online_total)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-amber-500" />
              <h2 className="font-black text-slate-800">Counter Summary</h2>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Bills</span>
              <span className="font-bold text-slate-800">{data?.bill_count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Billed Value</span>
              <span className="font-bold text-slate-800">{fmtINR(data?.billed_total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Customer Receivable</span>
              <span className="font-bold text-red-600">{fmtINR(data?.receivable_total)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-purple-500" />
              <h2 className="font-black text-slate-800">Accounting Note</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cash is derived from recorded counter bill receipts. Customer metal availability is derived from ledgered
              metal-in entries captured during billing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
