import React, { useState, useEffect, useCallback } from "react";
import {
  Store, Weight, Layers, ArrowLeftRight, ShieldCheck,
  X, RefreshCw, PackageCheck, ChevronRight, TrendingUp,
} from "lucide-react";
import { getCounterInventory, returnFromCounter } from "../api/counterService";
import { addToSvg } from "../api/svgService";
import Toast from "../components/Toast";

/**
 * Parse the unit weight (grams) from a category/target_product string.
 */
const parseUnitWeight = (category) => {
  if (!category) return null;
  const trimmed = category.trim();
  if (trimmed === "Mix" || trimmed === "Other") return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

const TAB_CONFIG = {
  "Gold 22K": {
    dot: "bg-amber-400",
    activeBg: "bg-amber-50 text-amber-900 ring-2 ring-amber-300",
    border: "border-amber-100",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
    iconBg: "bg-amber-50 text-amber-600",
    empty: "bg-amber-50/50 border-amber-200 text-amber-700",
    gradient: "from-amber-500 to-orange-500",
    statBg: "bg-gradient-to-br from-amber-50 to-orange-50",
    statBorder: "border-amber-200/60",
  },
  "Gold 24K": {
    dot: "bg-yellow-400",
    activeBg: "bg-yellow-50 text-yellow-900 ring-2 ring-yellow-300",
    border: "border-yellow-100",
    badge: "bg-yellow-50 text-yellow-700 border-yellow-100",
    iconBg: "bg-yellow-50 text-yellow-600",
    empty: "bg-yellow-50/50 border-yellow-200 text-yellow-700",
    gradient: "from-yellow-400 to-amber-500",
    statBg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    statBorder: "border-yellow-200/60",
  },
  Silver: {
    dot: "bg-slate-400",
    activeBg: "bg-slate-100 text-slate-900 ring-2 ring-slate-400",
    border: "border-slate-200",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    iconBg: "bg-slate-100 text-slate-500",
    empty: "bg-slate-50 border-slate-300 text-slate-500",
    gradient: "from-slate-400 to-slate-500",
    statBg: "bg-gradient-to-br from-slate-50 to-gray-100",
    statBorder: "border-slate-200/60",
  },
};

const SellingCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Gold 22K");
  const [toast, setToast] = useState(null);

  // Modal state
  const [modalType, setModalType] = useState(null); // "return" | "vault"
  const [selectedItem, setSelectedItem] = useState(null);
  const [piecesInput, setPiecesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCounterInventory();
      if (result.success) {
        const grouped = { "Gold 22K": [], "Gold 24K": [], Silver: [] };
        result.data.forEach((item) => {
          const unitWeight = parseUnitWeight(item.target_product);
          const calculatedWeight = unitWeight != null ? item.total_pieces * unitWeight : null;
          const enriched = { ...item, calculated_weight: calculatedWeight, unit_weight: unitWeight };
          if (grouped[item.metal_type]) {
            grouped[item.metal_type].push(enriched);
          }
        });
        setInventory(grouped);
      }
    } catch (error) {
      showToast("Failed to load counter inventory", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleOpenModal = (item, type) => {
    setSelectedItem(item);
    setModalType(type);
    setPiecesInput("");
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedItem(null);
    setPiecesInput("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem || !piecesInput) return;

    const pieces = parseInt(piecesInput);
    if (pieces <= 0) {
      return showToast("Pieces must be greater than zero", "error");
    }
    if (pieces > selectedItem.total_pieces) {
      return showToast("Cannot transfer more than available pieces", "error");
    }

    setIsSubmitting(true);
    try {
      let result;
      const payload = {
        metal_type: selectedItem.metal_type,
        target_product: selectedItem.target_product,
        pieces,
      };

      if (modalType === "return") {
        result = await returnFromCounter(payload);
      } else if (modalType === "vault") {
        result = await addToSvg(payload);
      }

      if (result?.success) {
        showToast(result.message, "success");
        closeModal();
        fetchInventory();
      }
    } catch (error) {
      showToast(error.message || `Operation failed`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-semibold text-sm">Loading Counter Inventory...</p>
        </div>
      </div>
    );
  }

  const cfg = TAB_CONFIG[activeTab];
  const items = inventory[activeTab] || [];
  const totalPieces = items.reduce((s, i) => s + (i.total_pieces || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (i.calculated_weight || 0), 0);

  // Grand totals for header
  const allItems = [...(inventory["Gold 22K"] || []), ...(inventory["Gold 24K"] || []), ...(inventory["Silver"] || [])];
  const grandPieces = allItems.reduce((s, i) => s + (i.total_pieces || 0), 0);

  const modalConfig = {
    return: {
      title: "Return to Finished Goods",
      subtitle: "Send items back from the counter to production inventory.",
      color: "slate",
      icon: <ArrowLeftRight size={20} />,
      barColor: "bg-slate-700",
      btnColor: "bg-slate-800 hover:bg-slate-700 shadow-slate-800/30",
      btnText: "Confirm Return",
      loadingText: "Returning...",
    },
    vault: {
      title: "Send to SVG Vault",
      subtitle: "Store items securely in the vault for safekeeping.",
      color: "indigo",
      icon: <ShieldCheck size={20} />,
      barColor: "bg-indigo-600",
      btnColor: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30",
      btnText: "Send to Vault",
      loadingText: "Sending...",
    },
  };

  return (
    <div className="p-4 sm:p-6 relative max-w-7xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Store className="text-white" size={20} />
            </div>
            Selling Counter
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            {grandPieces} total items ready for sale
          </p>
        </div>
        <button
          onClick={fetchInventory}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 hover:border-indigo-300 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(TAB_CONFIG).map(([metal, c]) => {
          const metalItems = inventory[metal] || [];
          const pieces = metalItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
          const weight = metalItems.reduce((s, i) => s + (i.calculated_weight || 0), 0);
          return (
            <button
              key={metal}
              onClick={() => setActiveTab(metal)}
              className={`${c.statBg} rounded-xl border ${c.statBorder} p-3.5 flex items-center gap-3 text-left transition-all hover:shadow-md ${
                activeTab === metal ? "ring-2 ring-offset-1 ring-indigo-400 shadow-md" : ""
              }`}
            >
              <span className={`w-2 h-10 rounded-full bg-gradient-to-b ${c.gradient} flex-shrink-0`} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{metal}</p>
                <p className="text-base font-black text-slate-800 mt-0.5">
                  {pieces} <span className="text-slate-400 font-semibold text-xs">pcs</span>
                </p>
                <p className="text-xs font-bold text-slate-400">{weight.toFixed(2)}g</p>
              </div>
              <ChevronRight size={14} className={`text-slate-300 ${activeTab === metal ? "text-indigo-400" : ""}`} />
            </button>
          );
        })}
      </div>

      {/* Tab bar + content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-3.5 pb-2.5 border-b border-slate-100 bg-slate-50/70">
          {Object.keys(TAB_CONFIG).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab ? TAB_CONFIG[tab].activeBg : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${TAB_CONFIG[tab].dot}`} />
              {tab}
              <span className="text-[10px] font-black opacity-60 ml-0.5 bg-white/60 px-1.5 py-0.5 rounded-full">
                {(inventory[tab] || []).length}
              </span>
            </button>
          ))}
          {items.length > 0 && (
            <div className="ml-auto flex items-center gap-4 text-xs text-slate-500 pr-1">
              <span className="flex items-center gap-1">
                <Layers size={12} />
                <strong className="text-slate-700">{totalPieces}</strong> pcs
              </span>
              <span className="flex items-center gap-1">
                <Weight size={12} />
                <strong className="text-slate-700">{totalWeight.toFixed(2)}</strong>g
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          {items.length === 0 ? (
            <div className={`${cfg.empty} p-10 rounded-xl border border-dashed text-center`}>
              <Store size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">No {activeTab} items at the counter.</p>
              <p className="text-xs opacity-60 mt-1">Send items from Finished Goods to get started.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th scope="col" className="text-left py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">
                      Category
                    </th>
                    <th scope="col" className="text-center py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">
                      Metal
                    </th>
                    <th scope="col" className="text-right py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">
                      Pieces
                    </th>
                    <th scope="col" className="text-right py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">
                      Weight
                    </th>
                    <th scope="col" className="text-center py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`${
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                      } hover:bg-indigo-50/40 transition-colors group`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg ${cfg.iconBg} group-hover:scale-110 transition-transform`}>
                          <PackageCheck size={14} />
                        </div>
                        <span>{item.target_product}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`${cfg.badge} border text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest`}
                        >
                          {item.metal_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-black text-slate-800 text-base">{item.total_pieces}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-600">
                        {item.calculated_weight != null ? `${item.calculated_weight.toFixed(2)}g` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenModal(item, "vault")}
                            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all active:scale-95"
                            title="Send to SVG Vault"
                          >
                            <ShieldCheck size={12} /> Vault
                          </button>
                          <button
                            onClick={() => handleOpenModal(item, "return")}
                            className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all active:scale-95"
                            title="Return to Finished Goods"
                          >
                            <ArrowLeftRight size={12} /> Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-200">
                    <td className="py-2.5 px-4 font-black text-slate-600 text-[10px] uppercase tracking-wider">
                      Total
                    </td>
                    <td></td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-800 text-base">{totalPieces}</td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-800">{totalWeight.toFixed(2)}g</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Tip */}
      <div className="mt-4 flex items-start gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
        <TrendingUp size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-indigo-600 font-semibold leading-relaxed">
          <strong>Tip:</strong> Use <strong>"Vault"</strong> to securely store items you don't want on display.
          Use <strong>"Return"</strong> to send items back to production.
        </p>
      </div>

      {/* Transfer Modal */}
      {modalType && selectedItem && (() => {
        const mc = modalConfig[modalType];
        const computedWeight = piecesInput && selectedItem.unit_weight != null && parseInt(piecesInput) > 0
          ? (parseInt(piecesInput) * selectedItem.unit_weight)
          : null;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className="bg-white rounded-2xl p-0 max-w-sm w-full shadow-2xl relative overflow-hidden animate-[fadeIn_0.15s_ease-out]"
              style={{ animation: "fadeIn 0.15s ease-out" }}
            >
              {/* Color bar */}
              <div className={`h-1.5 ${mc.barColor}`}></div>

              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      modalType === "vault"
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {mc.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800">{mc.title}</h3>
                      <p className="text-slate-400 text-xs font-medium mt-0.5">{mc.subtitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Selected item info */}
                <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Item</p>
                      <p className="text-lg font-black text-slate-800">{selectedItem.target_product}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available</p>
                      <p className="text-lg font-black text-slate-800">
                        {selectedItem.total_pieces} <span className="text-xs font-bold text-slate-400">pcs</span>
                      </p>
                    </div>
                  </div>
                  {selectedItem.calculated_weight != null && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-xs font-bold text-slate-400">
                        Total Weight: <span className="text-slate-600">{selectedItem.calculated_weight.toFixed(2)}g</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 mb-2 uppercase tracking-wider">
                      Quantity to Transfer
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedItem.total_pieces}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3.5 font-black text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all placeholder:text-slate-300 placeholder:font-medium placeholder:text-sm"
                      value={piecesInput}
                      onChange={(e) => setPiecesInput(e.target.value)}
                      placeholder="Enter number of pieces"
                      required
                      autoFocus
                    />
                    {computedWeight != null && (
                      <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Weight</span>
                        <span className="font-black text-slate-700">
                          {computedWeight.toFixed(2)}<span className="text-xs font-bold text-slate-400 ml-0.5">g</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold transition-all text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !piecesInput}
                      className={`flex-1 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${mc.btnColor}`}
                    >
                      {mc.icon}
                      {isSubmitting ? mc.loadingText : mc.btnText}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SellingCounter;
