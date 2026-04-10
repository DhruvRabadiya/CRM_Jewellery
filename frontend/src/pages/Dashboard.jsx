import React, { useEffect, useState, useCallback } from "react";
import { getStockData, getLossStats } from "../api/stockService";
import { getCombinedProcesses } from "../api/jobService";
import {
  ArrowUpCircle,
  RefreshCw,
  TrendingDown,
  Activity,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const Dashboard = () => {
  const [stock, setStock] = useState(null);
  const [lossStats, setLossStats] = useState([]);
  const [activeTab, setActiveTab] = useState("Gold 22K");
  const initialStageMetrics = () => ({
    Melting: { pending: 0, running: 0, completed: 0 },
    Rolling: { pending: 0, running: 0, completed: 0 },
    Press: { pending: 0, running: 0, completed: 0 },
    TPP: { pending: 0, running: 0, completed: 0 },
    Packing: { pending: 0, running: 0, completed: 0 },
  });

  const [processMetrics, setProcessMetrics] = useState({
    "Gold 22K": initialStageMetrics(),
    "Gold 24K": initialStageMetrics(),
    Silver: initialStageMetrics(),
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const [stockRes, lossRes, procRes] = await Promise.all([
        getStockData().catch(() => ({ success: false, data: null })),
        getLossStats().catch(() => ({ success: false, data: [] })),
        getCombinedProcesses().catch(() => ({ success: false, data: [] })),
      ]);

      if (stockRes.success) setStock(stockRes.data);
      if (lossRes.success) setLossStats(lossRes.data);
      if (procRes.success) {
        const metrics = {
          "Gold 22K": initialStageMetrics(),
          "Gold 24K": initialStageMetrics(),
          Silver: initialStageMetrics(),
        };
        procRes.data.forEach((p) => {
          if (metrics[p.metal_type] && metrics[p.metal_type][p.stage]) {
            if (p.status === "PENDING")
              metrics[p.metal_type][p.stage].pending += Number(p.issue_size) || 0;
            if (p.status === "RUNNING")
              metrics[p.metal_type][p.stage].running += Number(p.issued_weight) || 0;
            if (p.status === "COMPLETED")
              metrics[p.metal_type][p.stage].completed += Number(p.return_weight) || 0;
          }
        });
        setProcessMetrics(metrics);
      }
    } catch (error) {
      showToast("Failed to fetch dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const calculateLossFrame = (days, metal) => {
    const now = new Date();
    return lossStats
      .filter((s) => {
        if (s.metal_type !== metal) return false;
        if (days !== Infinity) {
          const d = new Date(s.date);
          const diffTime = Math.abs(now - d);
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) <= days;
        }
        return true;
      })
      .reduce((sum, s) => sum + s.loss_weight, 0)
      .toFixed(10);
  };

  const fmtWeight = (v) => parseFloat((v || 0).toFixed(4));

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">
        Loading Production Intel...
      </div>
    );
  if (!stock)
    return <div className="p-10 text-center text-red-500">API Error</div>;

  const gold22k = stock.gold_22k || {};
  const gold24k = stock.gold_24k || {};
  const silver = stock.silver || {};

  const stockCards = [
    { key: "Gold 22K", data: gold22k, dot: "bg-amber-400", bg: "from-amber-50 to-orange-50", border: "border-amber-200", text: "text-amber-700", hoverBorder: "hover:border-amber-400" },
    { key: "Gold 24K", data: gold24k, dot: "bg-yellow-400", bg: "from-yellow-50 to-amber-50", border: "border-yellow-200", text: "text-yellow-700", hoverBorder: "hover:border-yellow-400" },
    { key: "Silver",   data: silver,  dot: "bg-gray-400",   bg: "from-gray-50 to-slate-100",  border: "border-gray-200",   text: "text-gray-600",   hoverBorder: "hover:border-blue-400" },
  ];

  const tabConfig = {
    "Gold 22K": { accent: "amber", dotClass: "bg-amber-400", textClass: "text-amber-900", activeTab: "bg-amber-100 text-amber-900 ring-2 ring-amber-300", stageText: "text-amber-800" },
    "Gold 24K": { accent: "yellow", dotClass: "bg-yellow-400", textClass: "text-yellow-900", activeTab: "bg-yellow-100 text-yellow-900 ring-2 ring-yellow-300", stageText: "text-yellow-800" },
    Silver:     { accent: "gray",   dotClass: "bg-gray-400",   textClass: "text-gray-800",    activeTab: "bg-gray-200 text-gray-900 ring-2 ring-gray-400",     stageText: "text-gray-800" },
  };

  const stages = ["Melting", "Rolling", "Press", "TPP", "Packing"];
  const currentTabCfg = tabConfig[activeTab];
  const currentMetrics = processMetrics[activeTab] || initialStageMetrics();

  return (
    <div className="p-4 sm:p-6 relative max-w-7xl mx-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Intelligence Hub
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Real-time inventory, process states & analytics
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white font-bold text-sm px-4 py-2 rounded-lg hover:bg-blue-700 shadow active:scale-95 transition-all"
          >
            <ArrowUpCircle size={16} /> New Purchase
          </button>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 font-semibold text-sm px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-blue-400 shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* ── Stock Overview Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stockCards.map((c) => (
          <div
            key={c.key}
            className={`bg-gradient-to-br ${c.bg} rounded-2xl border ${c.border} ${c.hoverBorder} p-4 transition-all hover:shadow-md cursor-default`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`${c.dot} w-2.5 h-5 rounded-full`} />
              <h3 className={`text-sm font-extrabold ${c.text} uppercase tracking-wide`}>{c.key}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/70 rounded-lg p-2.5 border border-white/80">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Opening Stock</p>
                <p className="text-lg font-black text-gray-800">{fmtWeight(c.data.opening_stock)}<span className="text-xs text-gray-400 ml-0.5">g</span></p>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-blue-200">
                <p className="text-[10px] font-bold text-blue-600 uppercase">In Process</p>
                <p className="text-lg font-black text-blue-700">{fmtWeight(c.data.inprocess_weight)}<span className="text-xs text-blue-400 ml-0.5">g</span></p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabbed Analytics ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-gray-100 bg-gray-50/50">
          {Object.keys(tabConfig).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab
                  ? tabConfig[tab].activeTab
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tabConfig[tab].dotClass}`} />
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Stage Analytics Table ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Stage Analytics */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Stage Analytics</h4>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-2 px-3 font-bold text-gray-500 text-xs uppercase">Stage</th>
                      <th className="text-right py-2 px-3 font-bold text-gray-500 text-xs uppercase">Pending</th>
                      <th className="text-right py-2 px-3 font-bold text-blue-500 text-xs uppercase">Running</th>
                      <th className="text-right py-2 px-3 font-bold text-green-600 text-xs uppercase">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((stage, i) => (
                      <tr key={stage} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50/40 transition-colors`}>
                        <td className={`py-2 px-3 font-bold ${currentTabCfg.stageText}`}>{stage}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-700">{fmtWeight(currentMetrics[stage]?.pending)}g</td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-700">{fmtWeight(currentMetrics[stage]?.running)}g</td>
                        <td className="py-2 px-3 text-right font-semibold text-green-700">{fmtWeight(currentMetrics[stage]?.completed)}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Loss Analytics */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Loss Analytics</h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Today", days: 1, icon: TrendingDown },
                  { label: "This Week", days: 7, icon: TrendingDown },
                  { label: "All Time", days: Infinity, icon: Activity },
                ].map((period) => {
                  const val = parseFloat(calculateLossFrame(period.days, activeTab)) || 0;
                  const Icon = period.icon;
                  return (
                    <div key={period.label} className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold text-red-700 uppercase mb-1 flex items-center justify-center gap-1">
                        <Icon size={11} /> {period.label}
                      </p>
                      <p className="text-base font-black text-red-600">{fmtWeight(val)}g</p>
                    </div>
                  );
                })}
              </div>

              {/* Quick comparison across all metals */}
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">All Metals — Stock Snapshot</h4>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-2 px-3 font-bold text-gray-500 text-xs uppercase">Metal</th>
                      <th className="text-right py-2 px-3 font-bold text-gray-500 text-xs uppercase">Stock</th>
                      <th className="text-right py-2 px-3 font-bold text-blue-500 text-xs uppercase">In Proc.</th>
                      <th className="text-right py-2 px-3 font-bold text-red-500 text-xs uppercase">Total Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCards.map((c, i) => (
                      <tr key={c.key} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                        <td className="py-2 px-3 font-bold text-gray-800 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.key}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-700">{fmtWeight(c.data.opening_stock)}g</td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-700">{fmtWeight(c.data.inprocess_weight)}g</td>
                        <td className="py-2 px-3 text-right font-semibold text-red-600">{fmtWeight(c.data.total_loss)}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Stock (Purchase)"
      >
        <AddStockForm
          onSuccess={() => {
            setIsModalOpen(false);
            fetchDashboard();
          }}
          onCancel={() => setIsModalOpen(false)}
          showToast={showToast}
        />
      </Modal>
    </div>
  );
};

export default Dashboard;
