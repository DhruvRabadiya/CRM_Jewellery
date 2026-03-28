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
    Melting: { pending: 0, running: 0 },
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
              metrics[p.metal_type][p.stage].pending += Number(p.issue_size) || 0;
            if (p.status === "RUNNING")
              metrics[p.metal_type][p.stage].running += Number(p.issued_weight) || 0;
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
        {/* GOLD POOLS */}
        <div className="bg-linear-to-br from-yellow-50 to-orange-50 p-6 rounded-3xl shadow-sm border-2 border-yellow-100 hover:border-yellow-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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
              <p className="text-2xl font-black text-gray-800">
                {parseFloat((gold.opening_stock || 0).toFixed(10))}g
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-300">
              <p className="text-xs font-bold text-blue-800 uppercase">
                In Process
              </p>
              <p className="text-2xl font-black text-blue-700">
                {parseFloat((gold.inprocess_weight || 0).toFixed(10))}g
              </p>
            </div>
            <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-yellow-200/50">
              <p className="text-xs font-bold text-yellow-600 uppercase">
                Dhal Stock
              </p>
              <p className="text-xl font-black text-gray-700">
                {parseFloat((gold.dhal_stock || 0).toFixed(10))}g
              </p>
            </div>
            <div className="bg-yellow-100/60 backdrop-blur-sm p-4 rounded-xl border border-yellow-300/50">
              <p className="text-xs font-bold text-yellow-800 uppercase">
                Total Allocated
              </p>
              <p className="text-xl font-black text-yellow-900">
                {parseFloat(((gold.opening_stock || 0) + (gold.inprocess_weight || 0) + (gold.dhal_stock || 0)).toFixed(10))}g
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest mb-3 mt-4">
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
                className="grid grid-cols-3 gap-2 text-center bg-white/60 p-3 rounded-xl border-2 border-yellow-200/50 hover:border-yellow-400 hover:bg-white transition-all cursor-default"
              >
                <div className="flex items-center justify-start pl-2 font-bold text-yellow-900 text-sm">
                  {s.stage}
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold">
                    Pending
                  </p>
                  <p className="font-black text-gray-800 text-sm">
                    {parseFloat(
                      (processMetrics.Gold[s.stage]?.pending || 0).toFixed(10),
                    )}
                    g
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-blue-500 font-bold">
                    Running
                  </p>
                  <p className="font-black text-blue-800 text-sm">
                    {parseFloat(
                      (processMetrics.Gold[s.stage]?.running || 0).toFixed(10),
                    )}
                    g
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">
            Loss Analytics
          </p>
          <div className="grid grid-cols-3 gap-3">
            {renderLossMetric("Day Loss", calculateLossFrame(1, "Gold"), false)}
            {renderLossMetric("Wk Loss", calculateLossFrame(7, "Gold"), false)}
            {renderLossMetric("All-Time Loss", calculateLossFrame(Infinity, "Gold"), false)}
          </div>
        </div>

        {/* SILVER POOLS */}
        <div className="bg-linear-to-br from-gray-50 to-slate-100 p-6 rounded-3xl shadow-sm border-2 border-gray-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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
              <p className="text-2xl font-black text-gray-700">
                {parseFloat((silver.opening_stock / 1000).toFixed(10))}kg
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-300">
              <p className="text-xs font-bold text-blue-800 uppercase">
                In Process
              </p>
              <p className="text-2xl font-black text-blue-700">
                {parseFloat((silver.inprocess_weight / 1000 || 0).toFixed(10))}kg
              </p>
            </div>
            <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50">
              <p className="text-xs font-bold text-gray-500 uppercase">
                Dhal Stock
              </p>
              <p className="text-xl font-black text-gray-700">
                {parseFloat(((silver.dhal_stock || 0) / 1000).toFixed(10))}kg
              </p>
            </div>
            <div className="bg-slate-100/80 backdrop-blur-sm p-4 rounded-xl border border-gray-300/50">
              <p className="text-xs font-bold text-gray-700 uppercase">
                Total Allocated
              </p>
              <p className="text-xl font-black text-gray-800">
                {parseFloat((((silver.opening_stock || 0) + (silver.inprocess_weight || 0) + (silver.dhal_stock || 0)) / 1000).toFixed(10))}kg
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
                className="grid grid-cols-3 gap-2 text-center bg-white/60 p-3 rounded-xl border-2 border-gray-200/50 hover:border-blue-400 hover:bg-white transition-all cursor-default"
              >
                <div className="flex items-center justify-start pl-2 font-bold text-gray-800 text-sm">
                  {s.stage}
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold">
                    Pending
                  </p>
                  <p className="font-black text-gray-700 text-sm">
                    {parseFloat(
                      (
                        (processMetrics.Silver[s.stage]?.pending || 0) / 1000
                      ).toFixed(10),
                    ) || "0"}
                    kg
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-blue-500 font-bold">
                    Running
                  </p>
                  <p className="font-black text-blue-800 text-sm">
                    {parseFloat(
                      (
                        (processMetrics.Silver[s.stage]?.running || 0) / 1000
                      ).toFixed(10),
                    ) || "0"}
                    kg
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">
            Loss Analytics
          </p>
          <div className="grid grid-cols-3 gap-3">
            {renderLossMetric("Day Loss", calculateLossFrame(1, "Silver"), false)}
            {renderLossMetric("Wk Loss", calculateLossFrame(7, "Silver"), false)}
            {renderLossMetric("All-Time Loss", calculateLossFrame(Infinity, "Silver"), false)}
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
