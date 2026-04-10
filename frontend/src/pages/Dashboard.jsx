import React, { useEffect, useState, useCallback } from "react";
import { getStockData, getLossStats } from "../api/stockService";
import { getCombinedProcesses } from "../api/jobService";
import {
  ArrowUpCircle,
  RefreshCw,
  BarChart2,
  TrendingDown,
  TrendingUp,
  Activity,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const Dashboard = () => {
  const [stock, setStock] = useState(null);
  const [lossStats, setLossStats] = useState([]);
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

  const renderLossMetric = (label, value, isGain, unit = "g") => {
    const val = parseFloat(value) || 0;
    const Icon = label.includes("All-Time") ? Activity : (label.includes("Wk") ? BarChart2 : (isGain ? TrendingUp : TrendingDown));
    
    return (
      <div className={`${isGain ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} p-3 rounded-lg border text-center`}>
        <p className={`text-[10px] font-bold ${isGain ? 'text-green-800' : 'text-red-800'} uppercase mb-1 flex items-center justify-center gap-1`}>
          <Icon size={12} /> {label}
        </p>
        <p className={`text-lg font-black ${isGain ? 'text-green-600' : 'text-red-600'}`}>
          {parseFloat(val.toFixed(10))}{unit}
        </p>
      </div>
    );
  };

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

  const metalSections = [
    { key: "Gold 22K", data: gold22k, label: "Gold 22K Reserves, Pools & Analytics", accent: "amber", barColor: "bg-amber-400", borderColor: "border-amber-100", hoverBorder: "hover:border-amber-400", gradient: "from-amber-50 to-orange-50", textColor: "text-amber-900", stockLabel: "text-amber-700" },
    { key: "Gold 24K", data: gold24k, label: "Gold 24K Reserves, Pools & Analytics", accent: "yellow", barColor: "bg-yellow-400", borderColor: "border-yellow-100", hoverBorder: "hover:border-yellow-400", gradient: "from-yellow-50 to-orange-50", textColor: "text-yellow-900", stockLabel: "text-yellow-700" },
    { key: "Silver", data: silver, label: "Silver Reserves, Pools & Analytics", accent: "gray", barColor: "bg-gray-400", borderColor: "border-gray-200", hoverBorder: "hover:border-blue-400", gradient: "from-gray-50 to-slate-100", textColor: "text-gray-800", stockLabel: "text-gray-500" },
  ];

  return (
    <div className="p-6 relative max-w-7xl mx-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Intelligence Hub
          </h1>
          <p className="text-gray-500 font-medium mt-1">
            Real-time inventory, process states & analytics
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white font-black px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all hover:ring-4 hover:ring-blue-500/20"
          >
            <ArrowUpCircle size={20} /> New Purchase
          </button>
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboard();
            }}
            className="flex items-center gap-2 bg-white border-2 border-gray-200 text-gray-700 font-bold px-4 py-2.5 rounded-xl hover:bg-gray-50 hover:border-blue-400 shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8 mt-4">
        {metalSections.map((section) => (
          <div key={section.key} className={`bg-linear-to-br ${section.gradient} p-6 rounded-3xl shadow-sm border-2 ${section.borderColor} ${section.hoverBorder} hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`${section.barColor} w-3 h-8 rounded-full`}></div>
              <h2 className={`text-xl font-black ${section.textColor} tracking-tight`}>
                {section.label}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50">
                <p className={`text-xs font-bold ${section.stockLabel} uppercase`}>
                  Opening Stock
                </p>
                <p className="text-2xl font-black text-gray-800">
                  {parseFloat((section.data.opening_stock || 0).toFixed(10))}g
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-300">
                <p className="text-xs font-bold text-blue-800 uppercase">
                  In Process
                </p>
                <p className="text-2xl font-black text-blue-700">
                  {parseFloat((section.data.inprocess_weight || 0).toFixed(10))}g
                </p>
              </div>
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">
              Stage Analytics
            </p>
            <div className="space-y-3 mb-4">
              {[
                { stage: "Melting" },
                { stage: "Rolling" },
                { stage: "Press" },
                { stage: "TPP" },
                { stage: "Packing" },
              ].map((s) => (
                <div
                  key={s.stage}
                  className="grid grid-cols-4 gap-2 text-center bg-white/60 p-3 rounded-xl border-2 border-gray-200/50 hover:border-blue-400 hover:bg-white transition-all cursor-default"
                >
                  <div className={`flex items-center justify-start pl-2 font-bold ${section.textColor} text-sm`}>
                    {s.stage}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 font-bold">Pending</p>
                    <p className="font-black text-gray-800 text-sm">
                      {parseFloat((processMetrics[section.key]?.[s.stage]?.pending || 0).toFixed(10))}g
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-blue-500 font-bold">Running</p>
                    <p className="font-black text-blue-800 text-sm">
                      {parseFloat((processMetrics[section.key]?.[s.stage]?.running || 0).toFixed(10))}g
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-green-500 font-bold">Completed</p>
                    <p className="font-black text-green-700 text-sm">
                      {parseFloat((processMetrics[section.key]?.[s.stage]?.completed || 0).toFixed(10))}g
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">
              Loss Analytics
            </p>
            <div className="grid grid-cols-3 gap-3">
              {renderLossMetric("Day Loss", calculateLossFrame(1, section.key), false)}
              {renderLossMetric("Wk Loss", calculateLossFrame(7, section.key), false)}
              {renderLossMetric("All-Time Loss", calculateLossFrame(Infinity, section.key), false)}
            </div>
          </div>
        ))}
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
