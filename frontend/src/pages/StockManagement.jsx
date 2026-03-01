import React, { useState, useEffect, useCallback } from "react";
import { PlusCircle, Coins, Edit, Trash2, CheckCircle } from "lucide-react";
import {
  getStockData,
  getPurchases,
  getDetailedScrapAndLoss,
  editPurchase,
  deletePurchase,
} from "../api/stockService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";

const StockManagement = () => {
  const [stock, setStock] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [activeTab, setActiveTab] = useState("Gold");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Edit Purchase State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [editForm, setEditForm] = useState({
    weight: "",
    weight_unit: "g",
    description: "",
  });
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Define fetch function wrapped in useCallback to be stable
  const fetchStock = useCallback(async () => {
    try {
      const [result, purchaseResult, ledgerResult] = await Promise.all([
        getStockData(),
        getPurchases(),
        getDetailedScrapAndLoss(),
      ]);
      if (result.success) {
        setStock(result.data);
      }
      if (purchaseResult.success) {
        setPurchases(purchaseResult.data);
      }
      if (ledgerResult.success) {
        setLedger(ledgerResult.data);
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

  // 4. Handle Edit Purchase
  const openEditModal = (purchase) => {
    setSelectedPurchase(purchase);
    const unit = purchase.metal_type === "Silver" ? "kg" : "g";
    const divisor = unit === "kg" ? 1000 : 1;
    setEditForm({
      weight: (purchase.weight / divisor).toString(),
      weight_unit: unit,
      description: purchase.description || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditPurchase = async (e) => {
    e.preventDefault();
    if (!editForm.weight || parseFloat(editForm.weight) <= 0) {
      return showToast("Valid weight is required", "error");
    }

    let finalWeight = parseFloat(editForm.weight);
    if (editForm.weight_unit === "kg") {
      finalWeight *= 1000;
    }

    setActionLoading(true);
    try {
      const result = await editPurchase(selectedPurchase.id, finalWeight, editForm.description);
      if (result.success) {
        showToast("Purchase updated successfully", "success");
        setIsEditModalOpen(false);
        setSelectedPurchase(null);
        fetchStock();
      } else {
        showToast(result.message || "Failed to edit purchase", "error");
      }
    } catch (error) {
      showToast(error.message || "Error editing purchase", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Handle Delete Purchase
  const handleDeletePurchase = async (purchase) => {
    if (
      !window.confirm(
        `Are you SURE you want to permanently delete this ${purchase.metal_type} purchase of ${
          purchase.metal_type === "Gold" ? purchase.weight.toFixed(3) + "g" : (purchase.weight / 1000).toFixed(3) + "kg"
        }? This will reverse the stock addition.`
      )
    ) {
      return;
    }

    try {
      const result = await deletePurchase(purchase.id);
      if (result.success) {
        showToast("Purchase deleted and stock reversed!", "success");
        fetchStock();
      } else {
        showToast(result.message || "Failed to delete purchase", "error");
      }
    } catch (error) {
      showToast(error.message || "Error deleting purchase", "error");
    }
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
                {(stock.silver?.opening_stock / 1000)?.toFixed(3) || "0.000"}{" "}
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
              {(stock.silver?.dhal_stock / 1000)?.toFixed(3)} kg
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Last Purchases</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Recent inbound material inventory logs
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
                <th className="p-4 font-bold text-right rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.filter((p) => p.metal_type === activeTab).length ===
              0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="p-8 text-center text-gray-400 font-medium"
                  >
                    No purchase history found for {activeTab}.
                  </td>
                </tr>
              ) : (
                purchases
                  .filter((p) => p.metal_type === activeTab)
                  .map((txn, index) => (
                    <tr
                      key={txn.id || index}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
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
                          ? txn.weight.toFixed(3)
                          : (txn.weight / 1000).toFixed(3)}{" "}
                        {activeTab === "Gold" ? "g" : "kg"}
                      </td>
                      <td className="p-4 text-sm font-medium text-right flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(txn)}
                          className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1"
                        >
                          <Edit size={14} /> Edit
                        </button>
                        <button
                          onClick={() => handleDeletePurchase(txn)}
                          className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
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
                      className="border-b border-gray-50 hover:bg-red-50/30 transition-colors"
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
                          ? txn.weight?.toFixed(3)
                          : (txn.weight / 1000)?.toFixed(3)}{" "}
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

      {/* EDIT PURCHASE MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Purchase: ${selectedPurchase?.metal_type}`}
      >
        {selectedPurchase && (
          <form onSubmit={handleEditPurchase} className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <span className="text-blue-800 font-semibold">Original Weight ({editForm.weight_unit}):</span>
              <span className="text-xl font-bold text-blue-900">
                {(selectedPurchase.weight / (editForm.weight_unit === "kg" ? 1000 : 1)).toFixed(3)}
              </span>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-bold text-gray-700 mb-2">Weight</label>
                <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <input
                    type="number"
                    step="0.001"
                    required
                    className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
                    value={editForm.weight}
                    onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                  />
                  <select
                    className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                    value={editForm.weight_unit}
                    onChange={(e) => setEditForm({ ...editForm, weight_unit: e.target.value })}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
              <textarea
                className="w-full bg-white border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none resize-none"
                rows="3"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              ></textarea>
            </div>

            <p className="text-xs text-yellow-700 mt-2 font-semibold">
              Note: Updating the weight will alter the current opening stock accordingly.
            </p>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 flex justify-center items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? "Updating..." : "Update Purchase"}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default StockManagement;
