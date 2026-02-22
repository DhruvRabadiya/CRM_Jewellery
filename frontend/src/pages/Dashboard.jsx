import React, { useEffect, useState, useCallback } from "react";
import { getStockData, getLossStats } from "../api/stockService";
import { getCombinedProcesses } from "../api/jobService";
import {
  ArrowUpCircle,
  RefreshCw,
  BarChart2,
  TrendingDown,
  Layers,
  Activity,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const Dashboard = () => {
  const [stock, setStock] = useState(null);
  const [lossStats, setLossStats] = useState([]);
  const initialStageMetrics = () => ({
    Rolling: { pending: 0, running: 0 },
    Press: { pending: 0, running: 0 },
    TPP: { pending: 0, running: 0 },
    Packing: { pending: 0, running: 0 },
  });

  const [processMetrics, setProcessMetrics] = useState({
    Gold: initialStageMetrics(),
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
        getStockData(),
        getLossStats().catch(() => ({ data: [] })),
        getCombinedProcesses().catch(() => ({ data: [] })),
      ]);

      if (stockRes.success) setStock(stockRes.data);
      if (lossRes.success) setLossStats(lossRes.data);
      if (procRes.success) {
        const metrics = {
          Gold: initialStageMetrics(),
          Silver: initialStageMetrics(),
        };
        procRes.data.forEach((p) => {
          if (metrics[p.metal_type] && metrics[p.metal_type][p.stage]) {
            if (p.status === "PENDING")
              metrics[p.metal_type][p.stage].pending += p.issue_size || 0;
            if (p.status === "RUNNING")
              metrics[p.metal_type][p.stage].running += p.issued_weight || 0;
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
        const d = new Date(s.date);
        const diffTime = Math.abs(now - d);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) <= days;
      })
      .reduce((sum, s) => sum + s.loss_weight, 0)
      .toFixed(3);
  };

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">
        Loading Production Intel...
      </div>
    );
  if (!stock)
    return <div className="p-10 text-center text-red-500">API Error</div>;

  const gold = stock.gold || {};
  const silver = stock.silver || {};

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
            className="flex items-center gap-2 bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
          >
            <ArrowUpCircle size={18} /> New Purchase
          </button>
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboard();
            }}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold px-4 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8 mt-4">
        {/* GOLD POOLS */}
        <div className="bg-linear-to-br from-yellow-50 to-orange-50 p-6 rounded-3xl shadow-sm border border-yellow-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-yellow-400 w-3 h-8 rounded-full"></div>
            <h2 className="text-xl font-black text-yellow-900 tracking-tight">
              Gold Reserves, Pools & Analytics
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-yellow-200/50">
              <p className="text-xs font-bold text-yellow-700 uppercase">
                Opening Stock
              </p>
              <p className="text-xl font-black text-gray-800">
                {gold.opening_stock?.toFixed(3)}g
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-yellow-300">
              <p className="text-xs font-bold text-yellow-800 uppercase">
                Pure Dhal (Active)
              </p>
              <p className="text-2xl font-black text-green-700">
                {gold.dhal_stock?.toFixed(3)}g
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest mb-3 mt-4">
            Stage Analytics
          </p>
          <div className="space-y-3 mb-4">
            {[
              { stage: "Rolling", key: "rolling_stock" },
              { stage: "Press", key: "press_stock" },
              { stage: "TPP", key: "tpp_stock" },
              { stage: "Packing", key: null },
            ].map((s) => (
              <div
                key={s.stage}
                className="grid grid-cols-4 gap-2 text-center bg-white/60 p-3 rounded-xl border border-yellow-200/50"
              >
                <div className="flex items-center justify-start pl-2 font-bold text-yellow-900 text-sm">
                  {s.stage}
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold">
                    Pending
                  </p>
                  <p className="font-black text-gray-800 text-sm">
                    {processMetrics.Gold[s.stage]?.pending.toFixed(3) ||
                      "0.000"}
                    g
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-blue-500 font-bold">
                    Running
                  </p>
                  <p className="font-black text-blue-800 text-sm">
                    {processMetrics.Gold[s.stage]?.running.toFixed(3) ||
                      "0.000"}
                    g
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-green-600 font-bold">
                    {s.key ? "Pool (Completed)" : "Completed"}
                  </p>
                  <p className="font-black text-green-700 text-sm">
                    {s.key ? (gold[s.key] || 0)?.toFixed(3) : "N/A"}
                    {s.key ? "g" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3 mt-4">
            Loss Analytics
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
              <p className="text-[10px] font-bold text-red-800 uppercase mb-1 flex items-center justify-center gap-1">
                <TrendingDown size={12} /> Day Loss
              </p>
              <p className="text-lg font-black text-red-600">
                {calculateLossFrame(1, "Gold")}g
              </p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
              <p className="text-[10px] font-bold text-red-800 uppercase mb-1 flex items-center justify-center gap-1">
                <BarChart2 size={12} /> Wk Loss
              </p>
              <p className="text-lg font-black text-red-700">
                {calculateLossFrame(7, "Gold")}g
              </p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg border border-red-200 text-center">
              <p className="text-[10px] font-bold text-red-900 uppercase mb-1 flex items-center justify-center gap-1">
                <Activity size={12} /> All-Time
              </p>
              <p className="text-lg font-black text-red-800">
                {gold.total_loss?.toFixed(3)}g
              </p>
            </div>
          </div>
        </div>

        {/* SILVER POOLS */}
        <div className="bg-linear-to-br from-gray-50 to-slate-100 p-6 rounded-3xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gray-400 w-3 h-8 rounded-full"></div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">
              Silver Reserves, Pools & Analytics
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50">
              <p className="text-xs font-bold text-gray-500 uppercase">
                Opening Stock
              </p>
              <p className="text-xl font-black text-gray-700">
                {(silver.opening_stock / 1000)?.toFixed(3)}kg
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-300">
              <p className="text-xs font-bold text-gray-800 uppercase">
                Pure Dhal (Active)
              </p>
              <p className="text-2xl font-black text-green-700">
                {(silver.dhal_stock / 1000)?.toFixed(3)}kg
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">
            Stage Analytics
          </p>
          <div className="space-y-3 mb-4">
            {[
              { stage: "Rolling", key: "rolling_stock" },
              { stage: "Press", key: "press_stock" },
              { stage: "TPP", key: "tpp_stock" },
              { stage: "Packing", key: null },
            ].map((s) => (
              <div
                key={s.stage}
                className="grid grid-cols-4 gap-2 text-center bg-white/60 p-3 rounded-xl border border-gray-200/50"
              >
                <div className="flex items-center justify-start pl-2 font-bold text-gray-800 text-sm">
                  {s.stage}
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold">
                    Pending
                  </p>
                  <p className="font-black text-gray-700 text-sm">
                    {(processMetrics.Silver[s.stage]?.pending / 1000).toFixed(
                      3,
                    ) || "0.000"}
                    kg
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-blue-500 font-bold">
                    Running
                  </p>
                  <p className="font-black text-blue-800 text-sm">
                    {(processMetrics.Silver[s.stage]?.running / 1000).toFixed(
                      3,
                    ) || "0.000"}
                    kg
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-green-600 font-bold">
                    {s.key ? "Pool (Completed)" : "Completed"}
                  </p>
                  <p className="font-black text-green-700 text-sm">
                    {s.key ? (silver[s.key] / 1000 || 0)?.toFixed(3) : "N/A"}
                    {s.key ? "kg" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3 mt-4">
            Loss Analytics
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
              <p className="text-[10px] font-bold text-red-800 uppercase mb-1 flex items-center justify-center gap-1">
                <TrendingDown size={12} /> Day Loss
              </p>
              <p className="text-lg font-black text-red-600">
                {calculateLossFrame(1, "Silver")}g
              </p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
              <p className="text-[10px] font-bold text-red-800 uppercase mb-1 flex items-center justify-center gap-1">
                <BarChart2 size={12} /> Wk Loss
              </p>
              <p className="text-lg font-black text-red-700">
                {calculateLossFrame(7, "Silver")}g
              </p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg border border-red-200 text-center">
              <p className="text-[10px] font-bold text-red-900 uppercase mb-1 flex items-center justify-center gap-1">
                <Activity size={12} /> All-Time
              </p>
              <p className="text-lg font-black text-red-800">
                {silver.total_loss?.toFixed(3)}g
              </p>
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
