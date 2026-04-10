import React, { useState, useEffect, useCallback } from "react";
import { PlusCircle, Coins, Edit2, Trash2 } from "lucide-react";
import {
  getStockData,
  getPurchases,
  getDetailedScrapAndLoss,
  deletePurchase,
} from "../api/stockService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";
import EditStockForm from "../components/forms/EditStockForm";

const StockManagement = () => {
  const [stock, setStock] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [activeTab, setActiveTab] = useState("Gold");
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStock = useCallback(async () => {
    try {
      const [result, purchaseResult, ledgerResult] = await Promise.all([
        getStockData(),
        getPurchases(),
        getDetailedScrapAndLoss(),
      ]);
      if (result.success) setStock(result.data);
      if (purchaseResult.success) setPurchases(purchaseResult.data);
      if (ledgerResult.success) setLedger(ledgerResult.data);
    } catch (error) {
      showToast("Connection Error", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const handleSuccess = () => {
    setIsModalOpen(false);
    fetchStock();
  };

  const handleDeletePurchase = async (purchase) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Stock Purchase",
      message: `Are you sure you want to delete this entry? This will permanently deduct the added weight from your stock.`,
      isDestructive: true,
      confirmText: "Yes, Delete",
      onConfirm: async () => {
        try {
          await deletePurchase(purchase.id);
          showToast("Entry deleted successfully!", "success");
          fetchStock();
        } catch (error) {
          showToast(error.message || "Failed to delete entry", "error");
        }
      }
    });
  };

  const openEditModal = (purchase) => {
    setSelectedPurchase(purchase);
    setIsEditModalOpen(true);
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
        <div className="flex gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all hover:ring-4 hover:ring-blue-500/20 font-black"
          >
            <PlusCircle size={22} />{" "}
            <span className="font-bold">Add New Stock</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Gold Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 hover:border-yellow-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group cursor-default">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-yellow-600 font-black text-sm tracking-wide mb-2 uppercase">
                Gold Inventory
              </p>
              <h2 className="text-5xl font-extrabold text-gray-900 group-hover:text-yellow-600 transition-colors">
                {parseFloat((stock.gold?.opening_stock || 0).toFixed(10))}{" "}
                <span className="text-xl font-medium text-gray-400">g</span>
              </h2>
            </div>
            <div className="p-4 bg-yellow-50 rounded-2xl text-yellow-500 group-hover:bg-yellow-100 transition-colors">
              <Coins size={32} />
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between">
            <span className="text-gray-500 font-bold">In Process</span>
            <span className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-sm font-black ring-2 ring-blue-200">
              {parseFloat((stock.gold?.inprocess_weight || 0).toFixed(10))} g
            </span>
          </div>
        </div>

        {/* Silver Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 hover:border-blue-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group cursor-default">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 font-black text-sm tracking-wide mb-2 uppercase">
                Silver Inventory
              </p>
              <h2 className="text-5xl font-extrabold text-gray-900 group-hover:text-blue-600 transition-colors">
                {parseFloat(
                  (stock.silver?.opening_stock / 1000 || 0).toFixed(10),
                )}{" "}
                <span className="text-xl font-medium text-gray-400">kg</span>
              </h2>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
              <Coins size={32} />
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between">
            <span className="text-gray-500 font-bold">In Process</span>
            <span className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-black ring-2 ring-blue-200">
              {parseFloat((stock.silver?.inprocess_weight / 1000 || 0).toFixed(10))}{" "}
              kg
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Last Purchases</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Recent inbound raw material logs
            </p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 text-sm font-semibold">
            <button
              onClick={() => setActiveTab("Gold")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold
            </button>
            <button
              onClick={() => setActiveTab("Silver")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Silver" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Silver
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-bold rounded-tl-xl w-48">Date Added</th>
                <th className="p-4 font-bold">Description</th>
                <th className="p-4 font-bold text-right">Received Weight</th>
                <th className="p-4 font-bold text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.filter((p) => p.metal_type === activeTab).length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="p-8 text-center text-gray-400 font-medium"
                  >
                    No history found for {activeTab} raw material.
                  </td>
                </tr>
              ) : (
                purchases
                  .filter((p) => p.metal_type === activeTab)
                  .map((txn, index) => (
                    <tr
                      key={txn.id || index}
                      className="border-b border-gray-100 hover:bg-blue-50/80 transition-all cursor-pointer group/row"
                    >
                      <td className="p-4 text-sm font-semibold text-gray-700">
                        {new Date(txn.date).toLocaleDateString()}{" "}
                        {new Date(txn.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-4 text-sm font-medium text-gray-600">
                        {txn.description || "Manual Stock Addition"}
                      </td>
                      <td className="p-4 text-sm font-black text-green-600 text-right">
                        +
                        {activeTab === "Gold"
                          ? parseFloat((txn.weight || 0).toFixed(10))
                          : parseFloat((txn.weight / 1000 || 0).toFixed(10))}{" "}
                        {activeTab === "Gold" ? "g" : "kg"}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openEditModal(txn)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDeletePurchase(txn)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SCRAP & LOSS LEDGER */}
      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-red-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              Scrap & Loss Ledger
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Traceability logs for job-specific scrap returns and process
              losses
            </p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 text-sm font-semibold">
            <button
              onClick={() => setActiveTab("Gold")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold
            </button>
            <button
              onClick={() => setActiveTab("Silver")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Silver" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Silver
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-red-50/50 border-b border-red-100 text-xs uppercase tracking-wider text-red-800">
                <th className="p-4 font-bold rounded-tl-xl w-48">
                  Date Issued
                </th>
                <th className="p-4 font-bold">Category</th>
                <th className="p-4 font-bold">Source/Job Reference</th>
                <th className="p-4 font-bold text-right rounded-tr-xl">
                  Weight Deducted
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.filter((p) => p.metal_type === activeTab).length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="p-8 text-center text-gray-400 font-medium"
                  >
                    No scrap or loss records found for {activeTab}.
                  </td>
                </tr>
              ) : (
                ledger
                  .filter((p) => p.metal_type === activeTab)
                  .map((txn, index) => (
                    <tr
                      key={index}
                      className="border-b border-red-50 hover:bg-red-50/80 transition-all cursor-pointer group/row"
                    >
                      <td className="p-4 text-sm font-semibold text-gray-700">
                        {new Date(txn.date).toLocaleDateString()}{" "}
                        {new Date(txn.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            txn.category === "SCRAP"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {txn.category}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-medium text-gray-600">
                        {txn.source}
                      </td>
                      <td className="p-4 text-sm font-black text-right text-red-600">
                        -
                        {activeTab === "Gold"
                          ? parseFloat((txn.weight || 0).toFixed(10))
                          : parseFloat((txn.weight / 1000 || 0).toFixed(10))}{" "}
                        {activeTab === "Gold" ? "g" : "kg"}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
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

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Stock Purchase"
      >
        {selectedPurchase && (
          <EditStockForm
            purchase={selectedPurchase}
            onSuccess={() => { setIsEditModalOpen(false); fetchStock(); }}
            onCancel={() => setIsEditModalOpen(false)}
            showToast={showToast}
          />
        )}
      </Modal>

      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
      >
        <div className="space-y-6">
          <p className="text-gray-600 leading-relaxed font-medium">
            {confirmModal.message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
              className="flex-1 bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 shadow-sm transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await confirmModal.onConfirm();
                setConfirmModal({ ...confirmModal, isOpen: false });
              }}
              className={`flex-1 font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95 text-white ${
                confirmModal.isDestructive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {confirmModal.confirmText || "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StockManagement;
