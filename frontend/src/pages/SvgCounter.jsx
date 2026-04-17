import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Weight, Layers, ArrowRight, Lock, X,
  RefreshCw, PackageCheck, Store, Search,
} from "lucide-react";
import { getSvgInventory, removeFromSvg } from "../api/svgService";
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

const METAL_CONFIG = {
  "Gold 22K": {
    colorTheme: "amber",
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-600 to-orange-600",
    tagBg: "bg-amber-900/30 text-amber-300 border-amber-700/40",
    cardBorder: "border-amber-500/20 hover:border-amber-400/40",
    pieceBg: "bg-amber-950/50 border-amber-800/30",
    pieceColor: "text-amber-300",
    weightBg: "bg-amber-900/40 border-amber-700/30",
    weightColor: "text-amber-200",
    statBg: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/60",
  },
  "Gold 24K": {
    colorTheme: "yellow",
    gradient: "from-yellow-400 to-amber-500",
    bgGradient: "from-yellow-500 to-amber-600",
    tagBg: "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
    cardBorder: "border-yellow-500/20 hover:border-yellow-400/40",
    pieceBg: "bg-yellow-950/50 border-yellow-800/30",
    pieceColor: "text-yellow-300",
    weightBg: "bg-yellow-900/40 border-yellow-700/30",
    weightColor: "text-yellow-200",
    statBg: "bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200/60",
  },
  Silver: {
    colorTheme: "slate",
    gradient: "from-slate-400 to-slate-500",
    bgGradient: "from-slate-500 to-slate-700",
    tagBg: "bg-slate-700/50 text-slate-300 border-slate-600/40",
    cardBorder: "border-slate-600/30 hover:border-slate-500/50",
    pieceBg: "bg-slate-800/50 border-slate-700/30",
    pieceColor: "text-slate-300",
    weightBg: "bg-slate-700/50 border-slate-600/40",
    weightColor: "text-slate-200",
    statBg: "bg-gradient-to-br from-slate-50 to-gray-100 border-slate-200/60",
  },
};

const SvgCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Send to counter modal
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [piecesInput, setPiecesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchVault = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSvgInventory();
      if (result.success) {
        const grouped = { "Gold 22K": [], "Gold 24K": [], Silver: [] };
        result.data.forEach((item) => {
          if (grouped[item.metal_type]) {
            grouped[item.metal_type].push(item);
          }
        });
        setInventory(grouped);
      }
    } catch (error) {
      showToast("Failed to load SVG Vault", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  const handleOpenSend = (item) => {
    setSelectedItem(item);
    setPiecesInput("");
    setShowModal(true);
  };

  const handleSendToCounter = async (e) => {
    e.preventDefault();
    if (!selectedItem || !piecesInput) return;

    const pieces = parseInt(piecesInput);
    if (pieces <= 0) {
      return showToast("Pieces must be greater than zero", "error");
    }
    if (pieces > selectedItem.total_pieces) {
      return showToast("Cannot send more than available pieces", "error");
    }

    setIsSubmitting(true);
    try {
      const result = await removeFromSvg({
        metal_type: selectedItem.metal_type,
        target_product: selectedItem.target_product,
        pieces,
      });

      if (result.success) {
        showToast(result.message, "success");
        setShowModal(false);
        fetchVault();
      }
    } catch (error) {
      showToast(error.message || "Failed to send to counter", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-semibold text-sm">Accessing Secure Vault...</p>
        </div>
      </div>
    );
  }

  const metalSections = [
    { key: "Gold 22K", label: "Gold 22K" },
    { key: "Gold 24K", label: "Gold 24K" },
    { key: "Silver", label: "Silver" },
  ];

  // Filter items by search
  const filterItems = (items) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.target_product.toLowerCase().includes(q) ||
        item.metal_type.toLowerCase().includes(q)
    );
  };

  // Grand totals
  const allItems = [...(inventory["Gold 22K"] || []), ...(inventory["Gold 24K"] || []), ...(inventory["Silver"] || [])];
  const grandPieces = allItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
  const grandWeight = allItems.reduce((s, i) => s + (i.total_weight || 0), 0);

  return (
    <div className="relative pb-8 w-full max-w-7xl mx-auto px-0 sm:px-0">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Glow effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500 rounded-full blur-[80px] opacity-10 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <ShieldCheck className="text-white" size={20} />
              </div>
              SVG Vault
            </h2>
            <p className="text-slate-400 font-medium text-sm ml-[52px]">
              Secure storage for {grandPieces} items · {grandWeight.toFixed(2)}g total
            </p>
          </div>
          <button
            onClick={fetchVault}
            className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 hover:text-white hover:bg-white/15 font-bold text-sm px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="relative z-10 grid grid-cols-3 gap-3 mt-5">
          {metalSections.map(({ key, label }) => {
            const mc = METAL_CONFIG[key];
            const metalItems = inventory[key] || [];
            const pieces = metalItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
            const weight = metalItems.reduce((s, i) => s + (i.total_weight || 0), 0);
            return (
              <div key={key} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-3 flex items-center gap-3">
                <span className={`w-1.5 h-8 rounded-full bg-gradient-to-b ${mc.gradient} flex-shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-black text-white mt-0.5">
                    {pieces} <span className="text-slate-500 font-semibold text-[10px]">pcs</span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span className="text-slate-300">{weight.toFixed(2)}</span>
                    <span className="text-slate-500 text-[10px]">g</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6 relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search vault items..."
          className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-11 pr-4 py-3 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-400"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Vault Contents */}
      <div className="space-y-8">
        {metalSections.map(({ key, label }) => {
          const mc = METAL_CONFIG[key];
          const filteredItems = filterItems(inventory[key] || []);

          return (
            <section key={key}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-1.5 h-6 bg-gradient-to-b ${mc.gradient} rounded-full`}></div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">{label}</h3>
                <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredItems.length} items
                </span>
              </div>

              {filteredItems.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <Lock className="mx-auto text-slate-300 mb-3" size={36} strokeWidth={1.5} />
                  <p className="text-slate-500 font-bold text-sm">
                    {searchQuery ? `No matching ${label} items.` : `No ${label} items in the vault.`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {searchQuery ? "Try a different search term." : "Items can be added from the Selling Counter."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item, idx) => (
                    <div
                      key={`${key}-${idx}`}
                      className={`bg-slate-900 rounded-2xl p-5 shadow-xl border ${mc.cardBorder} transition-all duration-300 relative overflow-hidden group`}
                    >
                      {/* Item info */}
                      <div className="flex justify-between items-start mb-4 z-10 relative">
                        <h3 className="text-lg font-black text-white leading-tight">
                          {item.target_product}
                        </h3>
                        <span className={`${mc.tagBg} border px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest`}>
                          {item.metal_type}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-3 relative z-10 mb-4">
                        <div className={`flex-1 ${mc.pieceBg} border p-3 rounded-xl flex flex-col items-center`}>
                          <div className="flex items-center gap-1 text-slate-500 font-black text-[10px] mb-1 uppercase tracking-wider">
                            <Layers size={10} /> Pieces
                          </div>
                          <span className="text-xl font-black text-white">
                            {item.total_pieces}
                          </span>
                        </div>

                        <div className={`flex-1 ${mc.weightBg} border p-3 rounded-xl flex flex-col items-center`}>
                          <div className={`flex items-center gap-1 ${mc.pieceColor} font-black text-[10px] mb-1 uppercase tracking-wider`}>
                            <Weight size={10} /> Weight
                          </div>
                          <span className={`text-xl font-black ${mc.weightColor}`}>
                            {item.total_weight.toFixed(2)}
                            <span className="text-xs font-bold opacity-60 ml-0.5">g</span>
                          </span>
                        </div>
                      </div>

                      {/* Send to Counter button */}
                      <button
                        onClick={() => handleOpenSend(item)}
                        className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white border border-white/10 hover:border-white/20 font-bold text-xs px-4 py-2.5 rounded-xl transition-all active:scale-[0.98] group/btn relative z-10"
                      >
                        <Store size={14} className="text-indigo-300" />
                        Send to Counter
                        <ArrowRight size={12} className="text-slate-400 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-all" />
                      </button>

                      {/* Decorative glow */}
                      <div className={`absolute -bottom-6 -right-6 w-28 h-28 bg-gradient-to-br ${mc.bgGradient} rounded-full blur-2xl opacity-15 group-hover:opacity-25 group-hover:scale-150 transition-all duration-700 pointer-events-none`}></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Info bar */}
      <div className="mt-6 flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Store size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
          <strong>How it works:</strong> Items are stored here from the Selling Counter for safekeeping.
          Click <strong>"Send to Counter"</strong> to move them back for sale.
        </p>
      </div>

      {/* Send to Counter Modal */}
      {showModal && selectedItem && (() => {
        const unitWeight = parseUnitWeight(selectedItem.target_product);
        const computedWeight = piecesInput && parseInt(piecesInput) > 0
          ? (unitWeight != null
              ? parseInt(piecesInput) * unitWeight
              : selectedItem.total_pieces > 0
                ? (parseInt(piecesInput) / selectedItem.total_pieces) * selectedItem.total_weight
                : 0)
          : null;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-0 max-w-sm w-full shadow-2xl relative overflow-hidden">
              {/* Color bar */}
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-purple-600"></div>

              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Store size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800">Send to Counter</h3>
                      <p className="text-slate-400 text-xs font-medium mt-0.5">
                        Move items from vault to selling counter
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Selected item info */}
                <div className="bg-slate-900 rounded-xl p-4 mb-5 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Vault Item</p>
                      <p className="text-lg font-black text-white">{selectedItem.target_product}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Available</p>
                      <p className="text-lg font-black text-white">
                        {selectedItem.total_pieces} <span className="text-xs font-bold text-slate-500">pcs</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between">
                    <span className="text-xs font-bold text-slate-500">{selectedItem.metal_type}</span>
                    <span className="text-xs font-bold text-slate-400">
                      {selectedItem.total_weight.toFixed(2)}g
                    </span>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSendToCounter} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 mb-2 uppercase tracking-wider">
                      Pieces to Send
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
                      <div className="mt-2 bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-400 uppercase">Transfer Weight</span>
                        <span className="font-black text-indigo-700">
                          {computedWeight.toFixed(2)}<span className="text-xs font-bold text-indigo-400 ml-0.5">g</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold transition-all text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !piecesInput}
                      className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Store size={16} />
                      {isSubmitting ? "Sending..." : "Send to Counter"}
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

export default SvgCounter;
