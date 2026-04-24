import React, { useState, useEffect, useCallback } from "react";
import {
  Package, PackageCheck, Weight, LayoutGrid,
  RefreshCw, Send, X, Store, TrendingUp,
} from "lucide-react";
import { getFinishedGoods } from "../api/finishedGoodsService";
import { sendToCounter } from "../api/counterService";
import Toast from "../components/Toast";

const TAB_CONFIG = {
  "Gold 24K": {
    dot: "bg-yellow-400",
    activeBg: "bg-yellow-50 text-yellow-900 ring-2 ring-yellow-300",
    border: "border-yellow-100",
    topBar: "bg-yellow-400",
    iconBg: "bg-yellow-50 text-yellow-600",
    badge: "bg-yellow-50 text-yellow-700 border-yellow-100",
    wt: "bg-yellow-50 border-yellow-100 text-yellow-900",
    wtLabel: "text-yellow-600",
    empty: "bg-yellow-50/50 border-yellow-200 text-yellow-700",
    gradient: "from-yellow-400 to-amber-500",
    statBg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    statBorder: "border-yellow-200/60",
  },
  Silver: {
    dot: "bg-slate-400",
    activeBg: "bg-slate-100 text-slate-900 ring-2 ring-slate-400",
    border: "border-slate-200",
    topBar: "bg-slate-400",
    iconBg: "bg-slate-100 text-slate-500",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    wt: "bg-slate-100 border-slate-200 text-slate-800",
    wtLabel: "text-slate-500",
    empty: "bg-slate-50 border-slate-300 text-slate-500",
    gradient: "from-slate-400 to-slate-500",
    statBg: "bg-gradient-to-br from-slate-50 to-gray-100",
    statBorder: "border-slate-200/60",
  },
  "Gold 22K": {
    dot: "bg-amber-400",
    activeBg: "bg-amber-50 text-amber-900 ring-2 ring-amber-300",
    border: "border-amber-100",
    topBar: "bg-amber-400",
    iconBg: "bg-amber-50 text-amber-600",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
    wt: "bg-amber-50 border-amber-100 text-amber-900",
    wtLabel: "text-amber-600",
    empty: "bg-amber-50/50 border-amber-200 text-amber-700",
    gradient: "from-amber-500 to-orange-500",
    statBg: "bg-gradient-to-br from-amber-50 to-orange-50",
    statBorder: "border-amber-200/60",
  },
};

const FinishedGoods = () => {
  const [inventory, setInventory] = useState({ "Gold 24K": [], Silver: [], "Gold 22K": [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Gold 24K");
  const [toast, setToast] = useState(null);

  // Send to counter modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sendPieces, setSendPieces] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFinishedGoods();
      if (result.success) {
        const grouped = { "Gold 24K": [], Silver: [], "Gold 22K": [] };
        result.data.forEach((item) => {
          if (grouped[item.metal_type]) grouped[item.metal_type].push(item);
        });
        setInventory(grouped);
      }
    } catch (error) {
      showToast("Failed to load finished goods", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleOpenSendModal = (item) => {
    setSelectedItem(item);
    setSendPieces("");
    setShowSendModal(true);
  };

  const handleSendToCounter = async (e) => {
    e.preventDefault();
    if (!selectedItem || !sendPieces) return;

    const pieces = parseInt(sendPieces);
    if (pieces <= 0) {
      return showToast("Pieces must be greater than zero", "error");
    }
    if (pieces > selectedItem.total_pieces) {
      return showToast("Cannot send more than available pieces", "error");
    }

    setIsSubmitting(true);
    try {
      const result = await sendToCounter({
        metal_type: selectedItem.metal_type,
        target_product: selectedItem.target_product,
        pieces,
      });
      if (result.success) {
        showToast(result.message, "success");
        setShowSendModal(false);

        // Optimistically remove / decrement the item so the Send button disappears
        // immediately while the background refetch completes.
        const metal = selectedItem.metal_type;
        setInventory((prev) => {
          const updated = (prev[metal] || [])
            .map((item) => {
              if (item.target_product !== selectedItem.target_product) return item;
              const remaining = item.total_pieces - pieces;
              if (remaining <= 0) return null;
              const unitWeight = item.total_pieces > 0 ? item.total_weight / item.total_pieces : 0;
              return {
                ...item,
                total_pieces: remaining,
                total_weight: Math.max(0, item.total_weight - unitWeight * pieces),
              };
            })
            .filter(Boolean);
          return { ...prev, [metal]: updated };
        });

        fetchInventory();
      }
    } catch (error) {
      showToast(error.response?.data?.message || error.message || "Failed to send to counter", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-semibold text-sm">Loading Inventory...</p>
        </div>
      </div>
    );

  const cfg = TAB_CONFIG[activeTab];
  const items = inventory[activeTab] || [];
  const totalPieces = items.reduce((s, i) => s + (i.total_pieces || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (i.total_weight || 0), 0);

  return (
    <div className="p-4 sm:p-6 relative max-w-7xl mx-auto">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Package className="text-white" size={20} />
            </div>
            Finished Goods Vault
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">Manufactured items ready for dispatch to selling counter</p>
        </div>
        <button
          onClick={fetchInventory}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 hover:border-blue-300 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(TAB_CONFIG).map(([metal, c]) => {
          const metalItems = inventory[metal] || [];
          const pieces = metalItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
          const weight = metalItems.reduce((s, i) => s + (i.total_weight || 0), 0);
          return (
            <button
              key={metal}
              onClick={() => setActiveTab(metal)}
              className={`${c.statBg} rounded-xl border ${c.statBorder} p-3.5 flex items-center gap-3 text-left transition-all hover:shadow-md ${
                activeTab === metal ? "ring-2 ring-offset-1 ring-blue-400 shadow-md" : ""
              }`}
            >
              <span className={`w-2 h-10 rounded-full bg-gradient-to-b ${c.gradient} flex-shrink-0`} />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{metal}</p>
                <p className="text-sm font-black text-slate-800">
                  {pieces} <span className="text-slate-400 font-semibold text-xs">pcs</span>
                  <span className="text-slate-300 mx-1">·</span>
                  {weight.toFixed(3)}<span className="text-slate-400 text-xs">g</span>
                </p>
              </div>
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
              <span className="flex items-center gap-1"><LayoutGrid size={12} /><strong className="text-slate-700">{totalPieces}</strong> pcs</span>
              <span className="flex items-center gap-1"><Weight size={12} /><strong className="text-slate-700">{totalWeight.toFixed(3)}</strong>g</span>
            </div>
          )}
        </div>

        <div className="p-4">
          {items.length === 0 ? (
            <div className={`${cfg.empty} p-10 rounded-xl border border-dashed text-center`}>
              <PackageCheck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">No finished {activeTab} items currently in stock.</p>
              <p className="text-xs opacity-60 mt-1">Complete production jobs to fill inventory.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th scope="col" className="text-left py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Product</th>
                    <th scope="col" className="text-center py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Metal</th>
                    <th scope="col" className="text-right py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Pieces</th>
                    <th scope="col" className="text-right py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Total Weight</th>
                    <th scope="col" className="text-right py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Avg. Weight</th>
                    <th scope="col" className="text-center py-3 px-4 font-black text-slate-500 text-[10px] uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/40 transition-colors group`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg ${cfg.iconBg} group-hover:scale-110 transition-transform`}>
                          <PackageCheck size={14} />
                        </div>
                        {item.target_product}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`${cfg.badge} border text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest`}>
                          {item.metal_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-800 text-base">{item.total_pieces}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">{item.total_weight.toFixed(3)}g</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-500">
                        {item.total_pieces > 0 ? (item.total_weight / item.total_pieces).toFixed(3) : "—"}g
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenSendModal(item)}
                          className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          title="Send to Selling Counter"
                        >
                          <Store size={12} /> Send to Counter
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-200">
                    <td className="py-2.5 px-4 font-black text-slate-600 text-[10px] uppercase tracking-wider">Total</td>
                    <td></td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-800 text-base">{totalPieces}</td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-800">{totalWeight.toFixed(3)}g</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Flow hint */}
      <div className="mt-4 flex items-start gap-3 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
        <TrendingUp size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-600 font-semibold leading-relaxed">
          <strong>Flow:</strong> Send items from here → <strong>Selling Counter</strong> → optionally store in <strong>SVG Vault</strong> for safekeeping.
        </p>
      </div>

      {/* Send to Counter Modal */}
      {showSendModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-0 max-w-sm w-full shadow-2xl relative overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

            <div className="p-6">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Send size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Send to Counter</h3>
                    <p className="text-slate-400 text-xs font-medium mt-0.5">
                      Transfer items to the selling counter
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Product</p>
                    <p className="text-lg font-black text-slate-800">{selectedItem.target_product}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Available</p>
                    <p className="text-lg font-black text-slate-800">
                      {selectedItem.total_pieces} <span className="text-xs font-bold text-slate-400">pcs</span>
                    </p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between">
                  <span className="text-xs font-bold text-slate-500">{selectedItem.metal_type}</span>
                  <span className="text-xs font-bold text-slate-400">
                    {selectedItem.total_weight.toFixed(3)}g
                  </span>
                </div>
              </div>

              <form onSubmit={handleSendToCounter} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-2 uppercase tracking-wider">
                    Quantity to Send
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedItem.total_pieces}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3.5 font-black text-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all placeholder:text-slate-300 placeholder:font-medium placeholder:text-sm"
                    value={sendPieces}
                    onChange={(e) => setSendPieces(e.target.value)}
                    placeholder="Enter number of pieces"
                    required
                    autoFocus
                  />
                  {sendPieces && parseInt(sendPieces) > 0 && selectedItem.total_pieces > 0 && (
                    <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100 flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-400 uppercase">Transfer Weight</span>
                      <span className="font-black text-blue-700">
                        {((parseInt(sendPieces) / selectedItem.total_pieces) * selectedItem.total_weight).toFixed(3)}
                        <span className="text-xs font-bold text-blue-400 ml-0.5">g</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowSendModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold transition-all text-sm"
                  >
                    Cancel
                  </button>
                                    <button
                    type="submit"
                    disabled={isSubmitting || !sendPieces}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} />
                    {isSubmitting ? "Sending..." : "Send to Counter"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinishedGoods;