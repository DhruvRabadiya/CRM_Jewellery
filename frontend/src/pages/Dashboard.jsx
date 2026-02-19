import React, { useEffect, useState, useCallback } from "react";
import { getStockData } from "../api/stockService";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const Dashboard = () => {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Stable Fetch Function
  const fetchDashboard = useCallback(async () => {
    try {
      const result = await getStockData();
      if (result.success) {
        setStock(result.data);
      }
    } catch (error) {
      showToast("Failed to fetch dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Run ONCE on mount
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // 3. Handle Form Success
  const handleSuccess = () => {
    setIsModalOpen(false);
    fetchDashboard();
  };

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">Loading Dashboard...</div>
    );
  if (!stock)
    return <div className="p-10 text-center text-red-500">API Error</div>;

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Production Dashboard
          </h1>
          <p className="text-gray-500">Real-time factory overview</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchDashboard();
          }}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm active:scale-95"
        >
          <RefreshCw size={18} /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Gold Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-yellow-500 hover:shadow-md transition-shadow">
          <h2 className="text-sm font-bold text-yellow-600 tracking-wider mb-4">
            GOLD OVERVIEW
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-50 p-4 rounded-xl">
              <p className="text-xs text-yellow-700 font-semibold uppercase">
                Opening Stock
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {stock.gold?.opening_stock?.toFixed(2)} g
              </p>
            </div>
            <div className="bg-yellow-100 p-4 rounded-xl">
              <p className="text-xs text-yellow-800 font-semibold uppercase">
                Pure Dhal
              </p>
              <p className="text-2xl font-bold text-green-700">
                {stock.gold?.dhal_stock?.toFixed(2)} g
              </p>
            </div>
          </div>
        </div>

        {/* Silver Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-gray-400 hover:shadow-md transition-shadow">
          <h2 className="text-sm font-bold text-gray-500 tracking-wider mb-4">
            SILVER OVERVIEW
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl">
              <p className="text-xs text-gray-500 font-semibold uppercase">
                Opening Stock
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {stock.silver?.opening_stock?.toFixed(3)} kg
              </p>
            </div>
            <div className="bg-gray-100 p-4 rounded-xl">
              <p className="text-xs text-gray-600 font-semibold uppercase">
                Pure Dhal
              </p>
              <p className="text-2xl font-bold text-green-700">
                {stock.silver?.dhal_stock?.toFixed(3)} kg
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h3>
        <div className="flex gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-6 py-4 rounded-xl shadow-lg hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center gap-3 font-semibold active:scale-95"
          >
            <ArrowUpCircle size={24} />
            <span>Add New Purchase</span>
          </button>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Stock (Purchase)"
      >
        <AddStockForm
          onSuccess={handleSuccess}
          onCancel={() => setIsModalOpen(false)}
          showToast={showToast}
        />
      </Modal>
    </div>
  );
};

export default Dashboard;
