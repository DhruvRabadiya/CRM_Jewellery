import React, { useState, useEffect, useCallback } from "react";
import { Store, Weight, Layers, ArrowLeftRight, X, RefreshCw } from "lucide-react";
import { getCounterInventory, returnFromCounter } from "../api/counterService";
import Toast from "../components/Toast";

/**
 * Parse the unit weight (grams) from a category/target_product string.
 * Examples: "1 gm" → 1, "0.05gm" → 0.05, "10g -C|B" → 10, "Mix" → null
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
    activeBg: "bg-amber-100 text-amber-900 ring-2 ring-amber-300",
    border: "border-amber-100",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
    iconBg: "bg-amber-50 text-amber-600",
    empty: "bg-amber-50/50 border-amber-200 text-amber-700",
  },
  "Gold 24K": {
    dot: "bg-yellow-400",
    activeBg: "bg-yellow-100 text-yellow-900 ring-2 ring-yellow-300",
    border: "border-yellow-100",
    badge: "bg-yellow-50 text-yellow-700 border-yellow-100",
    iconBg: "bg-yellow-50 text-yellow-600",
    empty: "bg-yellow-50/50 border-yellow-200 text-yellow-700",
  },
  Silver: {
    dot: "bg-gray-400",
    activeBg: "bg-gray-200 text-gray-900 ring-2 ring-gray-400",
    border: "border-gray-200",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    iconBg: "bg-gray-100 text-gray-500",
    empty: "bg-gray-50 border-gray-300 text-gray-500",
  },
};

const SellingCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Gold 22K");
  const [toast, setToast] = useState(null);

  // Return to finished goods modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [returnPieces, setReturnPieces] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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

  const handleOpenReturn = (item) => {
    setSelectedItem(item);
    setReturnPieces("");
    setShowReturnModal(true);
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!selectedItem || !returnPieces) return;

    const pieces = parseInt(returnPieces);
    if (pieces <= 0) {
      return showToast("Pieces must be greater than zero", "error");
    }
    if (pieces > selectedItem.total_pieces) {
      return showToast("Cannot return more than available pieces", "error");
    }

    setIsSubmitting(true);
    try {
      const result = await returnFromCounter({
        metal_type: selectedItem.metal_type,
        target_product: selectedItem.target_product,
        pieces,
      });
      if (result.success) {
        showToast(result.message, "success");
        setShowReturnModal(false);
        fetchInventory();
      }
    } catch (error) {
      showToast(error.message || "Failed to return to finished goods", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse text-gray-500">
        Loading Counter Inventory...
      </div>
    );

  const cfg = TAB_CONFIG[activeTab];
  const items = inventory[activeTab] || [];
  const totalPieces = items.reduce((s, i) => s + (i.total_pieces || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (i.calculated_weight || 0), 0);

  return (
    <div className="p-4 sm:p-6 relative max-w-7xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <Store className="text-indigo-600" size={24} /> Selling Counter
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Items at the counter ready for sale</p>
        </div>
        <button
          onClick={fetchInventory}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 font-semibold text-sm px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-indigo-400 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Object.entries(TAB_CONFIG).map(([metal, c]) => {
          const metalItems = inventory[metal] || [];
          const pieces = metalItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
          const weight = metalItems.reduce((s, i) => s + (i.calculated_weight || 0), 0);
          return (
            <div key={metal} className={`bg-white rounded-xl border ${c.border} p-3 flex items-center gap-3`}>
              <span className={`w-2.5 h-8 rounded-full ${c.dot} flex-shrink-0`} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-500 uppercase truncate">{metal}</p>
                <p className="text-sm font-black text-gray-800">{pieces} <span className="text-gray-400 font-medium">pcs</span> · {weight.toFixed(2)}<span className="text-gray-400 text-xs">g</span></p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab bar + content */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50/50">
          {Object.keys(TAB_CONFIG).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab ? TAB_CONFIG[tab].activeBg : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${TAB_CONFIG[tab].dot}`} />
              {tab}
              <span className="text-xs font-semibold opacity-70 ml-0.5">({(inventory[tab] || []).length})</span>
            </button>
          ))}
          {items.length > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 pr-1">
              <span className="flex items-center gap-1"><Layers size={12} /><strong className="text-gray-700">{totalPieces}</strong> pcs</span>
              <span className="flex items-center gap-1"><Weight size={12} /><strong className="text-gray-700">{totalWeight.toFixed(2)}</strong>g</span>
            </div>
          )}
        </div>

        <div className="p-4">
          {items.length === 0 ? (
            <div className={`${cfg.empty} p-8 rounded-xl border border-dashed text-center`}>
              <Store size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-sm">No {activeTab} items at the counter.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th scope="col" className="text-left py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Category</th>
                    <th scope="col" className="text-center py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Metal</th>
                    <th scope="col" className="text-right py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Pieces</th>
                    <th scope="col" className="text-right py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Weight</th>
                    <th scope="col" className="text-center py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-indigo-50/30 transition-colors`}
                    >
                      <td className="py-2.5 px-4 font-bold text-gray-800 flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${cfg.iconBg}`}>
                          <Store size={14} />
                        </div>
                        {item.target_product}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${cfg.badge} border text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide`}>
                          {item.metal_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black text-gray-800">{item.total_pieces}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-700">
                        {item.calculated_weight != null ? `${item.calculated_weight.toFixed(2)}g` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenReturn(item)}
                          className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          title="Return to Finished Goods"
                        >
                          <ArrowLeftRight size={12} /> Return
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t border-gray-200">
                    <td className="py-2 px-4 font-black text-gray-700 text-xs uppercase">Total</td>
                    <td></td>
                    <td className="py-2 px-4 text-right font-black text-gray-800">{totalPieces}</td>
                    <td className="py-2 px-4 text-right font-black text-gray-800">{totalWeight.toFixed(2)}g</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Return to Finished Goods Modal */}
      {showReturnModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-700"></div>

            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-gray-800">Return to Finished Goods</h3>
                <p className="text-gray-500 text-sm mt-1">
                  Return pieces from the counter back to production.
                </p>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Selected Item</p>
              <p className="text-lg font-black text-gray-800">{selectedItem.target_product}</p>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-bold">{selectedItem.metal_type}</span> · Available: <span className="font-black text-gray-800">{selectedItem.total_pieces}</span> pcs
                {selectedItem.calculated_weight != null && (
                  <> · <span className="font-black text-gray-800">{selectedItem.calculated_weight.toFixed(2)}g</span></>
                )}
              </p>
            </div>

            <form onSubmit={handleReturn} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Quantity to Return
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedItem.total_pieces}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500 transition-all"
                  value={returnPieces}
                  onChange={(e) => setReturnPieces(e.target.value)}
                  placeholder="Enter number of pieces"
                  required
                  autoFocus
                />
                {returnPieces && selectedItem.unit_weight != null && parseInt(returnPieces) > 0 && (
                  <p className="mt-2 text-xs font-bold text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                    Weight: <span className="text-gray-800">{(parseInt(returnPieces) * selectedItem.unit_weight).toFixed(2)}g</span>
                    <span className="text-gray-400 ml-1">({returnPieces} × {selectedItem.unit_weight}g)</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-3 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !returnPieces}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-slate-800/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight size={16} />
                  {isSubmitting ? "Returning..." : "Confirm Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellingCounter;
