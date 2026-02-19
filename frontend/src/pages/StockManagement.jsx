import React, { useState, useEffect, useCallback } from "react";
import { PlusCircle, Coins } from "lucide-react";
import { getStockData } from "../api/stockService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const StockManagement = () => {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Define fetch function wrapped in useCallback to be stable
  const fetchStock = useCallback(async () => {
    try {
      const result = await getStockData();
      if (result.success) {
        setStock(result.data);
      }
    } catch (error) {
      showToast("Connection Error", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Call it ONLY on mount
  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  // 3. Handle Form Success (Close Modal -> Refresh Data)
  const handleSuccess = () => {
    setIsModalOpen(false);
    fetchStock();
  };

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">Loading Stock...</div>
    );
  if (!stock)
    return (
      <div className="p-8 text-center text-red-500">
        API Error. Is Backend running?
      </div>
    );

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Stock Management</h1>
          <p className="text-gray-500 mt-1">Manage raw material inventory</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
        >
          <PlusCircle size={20} />{" "}
          <span className="font-semibold">Add New Stock</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Gold Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-yellow-600 font-bold text-sm tracking-wide mb-2">
                GOLD INVENTORY
              </p>
              <h2 className="text-5xl font-extrabold text-gray-900 group-hover:text-yellow-600 transition-colors">
                {stock.gold?.opening_stock?.toFixed(2) || "0.00"}{" "}
                <span className="text-xl font-medium text-gray-400">g</span>
              </h2>
            </div>
            <div className="p-4 bg-yellow-50 rounded-2xl text-yellow-500">
              <Coins size={32} />
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-gray-50 flex justify-between">
            <span className="text-gray-500 font-medium">Pure Dhal</span>
            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold">
              {stock.gold?.dhal_stock?.toFixed(2)} g
            </span>
          </div>
        </div>

        {/* Silver Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 font-bold text-sm tracking-wide mb-2">
                SILVER INVENTORY
              </p>
              <h2 className="text-5xl font-extrabold text-gray-900 group-hover:text-gray-600 transition-colors">
                {stock.silver?.opening_stock?.toFixed(3) || "0.000"}{" "}
                <span className="text-xl font-medium text-gray-400">kg</span>
              </h2>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl text-gray-400">
              <Coins size={32} />
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-gray-50 flex justify-between">
            <span className="text-gray-500 font-medium">Pure Dhal</span>
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-bold">
              {stock.silver?.dhal_stock?.toFixed(3)} kg
            </span>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Stock (Purchase)"
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

export default StockManagement;
