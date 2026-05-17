import React, { useState, useEffect, useCallback, useRef } from "react";
import { PlusCircle, Coins, Edit2, Trash2, Check, X } from "lucide-react";
import {
  getStockData,
  getPurchases,
  getDetailedScrapAndLoss,
  deletePurchase,
  setStockWeight,
} from "../api/stockService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import AddStockForm from "../components/forms/AddStockForm";
import EditStockForm from "../components/forms/EditStockForm";

const StockManagement = () => {
  const [stock, setStock] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [activeTab, setActiveTab] = useState("Gold 24K");
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null });

  // Inline weight editor state: { metalKey, metalType, currentWeight } or null
  const [editing, setEditing]     = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote]   = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editInputRef = useRef(null);

  const openWeightEdit = (metalKey, metalType, currentWeight) => {
    setEditing({ metalKey, metalType });
    setEditValue(String(parseFloat(currentWeight.toFixed(6))));
    setEditNote("");
    setTimeout(() => editInputRef.current?.select(), 50);
  };

  const cancelWeightEdit = () => { setEditing(null); setEditValue(""); setEditNote(""); };

  const saveWeightEdit = async () => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0) { showToast("Enter a valid weight (≥ 0)", "error"); return; }
    setEditSaving(true);
    try {
      await setStockWeight(editing.metalType, val, editNote);
      showToast("Stock weight updated!", "success");
      cancelWeightEdit();
      fetchStock();
    } catch (err) {
      showToast(err?.message || "Failed to update weight", "error");
    } finally {
      setEditSaving(false);
    }
  };

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { key: "gold_22k", metalType: "Gold 22K", label: "Gold 22K Inventory", accent: "amber" },
          { key: "gold_24k", metalType: "Gold 24K", label: "Gold 24K Inventory", accent: "yellow" },
          { key: "silver",   metalType: "Silver",   label: "Silver Inventory",   accent: "blue"   },
        ].map(({ key, metalType, label, accent }) => {
          const currentWeight = parseFloat((stock[key]?.opening_stock || 0).toFixed(6));
          const inProcess     = parseFloat((stock[key]?.inprocess_weight || 0).toFixed(6));
          const isEditingThis = editing?.metalKey === key;

          const accentMap = {
            amber:  { text: "text-amber-600", border: "hover:border-amber-400", icon: "text-amber-500 bg-amber-50 group-hover:bg-amber-100", weightText: "group-hover:text-amber-600" },
            yellow: { text: "text-yellow-600", border: "hover:border-yellow-400", icon: "text-yellow-500 bg-yellow-50 group-hover:bg-yellow-100", weightText: "group-hover:text-yellow-600" },
            blue:   { text: "text-gray-500",   border: "hover:border-blue-400",   icon: "text-gray-400 bg-gray-50 group-hover:bg-blue-50 group-hover:text-blue-500", weightText: "group-hover:text-blue-600" },
          };
          const a = accentMap[accent];

          return (
            <div key={key} className={`bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 ${a.border} hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className={`${a.text} font-black text-sm tracking-wide mb-2 uppercase`}>{label}</p>

                  {isEditingThis ? (
                    <div className="space-y-2 mt-1">
                      <div className="flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          type="number"
                          min="0"
                          step="any"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveWeightEdit(); if (e.key === "Escape") cancelWeightEdit(); }}
                          className="w-36 text-2xl font-extrabold border-2 border-blue-400 rounded-xl px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-900"
                        />
                        <span className="text-lg font-medium text-gray-400">g</span>
                      </div>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Note (optional)"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-600"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveWeightEdit}
                          disabled={editSaving}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
                        >
                          <Check size={13} /> {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelWeightEdit}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg transition-colors"
                        >
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <h2 className={`text-5xl font-extrabold text-gray-900 ${a.weightText} transition-colors`}>
                        {currentWeight}
                        <span className="text-xl font-medium text-gray-400 ml-1">g</span>
                      </h2>
                      <button
                        title="Edit available weight"
                        onClick={() => openWeightEdit(key, metalType, currentWeight)}
                        className="mb-1.5 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Edit2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {!isEditingThis && (
                  <div className={`p-4 rounded-2xl ${a.icon} transition-colors flex-shrink-0`}>
                    <Coins size={32} />
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between">
                <span className="text-gray-500 font-bold">In Process</span>
                <span className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-sm font-black ring-2 ring-blue-200">
                  {inProcess} g
                </span>
              </div>
            </div>
          );
        })}
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
              onClick={() => setActiveTab("Gold 24K")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold 24K" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold 24K
            </button>
            <button
              onClick={() => setActiveTab("Silver")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Silver" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Silver
            </button>
            <button
              onClick={() => setActiveTab("Gold 22K")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold 22K" ? "bg-white text-amber-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold 22K
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
                        {parseFloat((txn.weight || 0).toFixed(10))}{" "}
                        g
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
              onClick={() => setActiveTab("Gold 24K")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold 24K" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold 24K
            </button>
            <button
              onClick={() => setActiveTab("Silver")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Silver" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Silver
            </button>
            <button
              onClick={() => setActiveTab("Gold 22K")}
              className={`px-4 py-1.5 rounded-md transition-colors ${activeTab === "Gold 22K" ? "bg-white text-amber-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gold 22K
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
                        {parseFloat((txn.weight || 0).toFixed(10))}{" "}
                        g
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
