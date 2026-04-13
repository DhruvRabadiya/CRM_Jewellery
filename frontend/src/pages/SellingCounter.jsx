import React, { useState, useEffect, useCallback } from "react";
import { PackageSearch, Weight, Layers, ArrowLeftRight, X } from "lucide-react";
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

const SellingCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
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
    try {
      const result = await getCounterInventory();
      if (result.success) {
        const grouped = { "Gold 22K": [], "Gold 24K": [], Silver: [] };
        result.data.forEach((item) => {
          // Calculate weight from category name
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

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-indigo-400 font-bold text-xl mt-20">
        Loading Counter Inventory...
      </div>
    );
  }

  const ProductCard = ({ item, colorTheme }) => {
    const hasWeight = item.calculated_weight != null;
    return (
      <div className={`bg-white rounded-3xl p-6 shadow-lg shadow-${colorTheme}-100/50 border border-${colorTheme}-100 hover:shadow-xl hover:shadow-${colorTheme}-200/50 transition-all duration-300 relative overflow-hidden group hover:-translate-y-1`}>

        <div className="flex justify-between items-start mb-6 z-10 relative">
          <h3 className="text-2xl font-black text-slate-800 leading-tight">
            {item.target_product}
          </h3>
          <span className={`bg-${colorTheme}-50 text-${colorTheme}-700 px-3 py-1 rounded-full text-xs font-bold border border-${colorTheme}-200/50 uppercase tracking-widest`}>
            {item.metal_type}
          </span>
        </div>

        <div className="flex flex-col gap-3 relative z-10">
          <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
              <Layers size={18} /> Pieces
            </div>
            <span className="text-2xl font-black text-slate-800">
              {item.total_pieces}
            </span>
          </div>

          <div className={`bg-${colorTheme}-50 p-4 rounded-2xl flex items-center justify-between border border-${colorTheme}-100`}>
            <div className={`flex items-center gap-2 text-${colorTheme}-600 font-bold text-sm`}>
              <Weight size={18} /> Calculated Weight
            </div>
            <span className={`text-xl font-black text-${colorTheme}-900`}>
              {hasWeight ? (
                <>
                  {item.calculated_weight.toFixed(2)}
                  <span className="text-sm font-bold opacity-70 ml-1">g</span>
                </>
              ) : (
                <span className="text-sm font-bold opacity-50">N/A</span>
              )}
            </span>
          </div>

          {hasWeight && item.unit_weight != null && (
            <div className="text-xs text-slate-400 font-semibold text-center mt-1">
              {item.total_pieces} pcs × {item.unit_weight}g = {item.calculated_weight.toFixed(2)}g
            </div>
          )}
        </div>

        {/* Return button */}
        <div className="mt-4 relative z-10">
          <button
            onClick={() => handleOpenReturn(item)}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          >
            <ArrowLeftRight size={14} /> Return to Finished Goods
          </button>
        </div>

        {/* Visual flair */}
        <div className={`absolute -bottom-6 -right-6 w-32 h-32 bg-${colorTheme}-50 rounded-full blur-2xl opacity-50 group-hover:scale-150 transition-transform duration-700 pointer-events-none`}></div>
      </div>
    );
  };

  const metalSections = [
    { key: "Gold 22K", label: "Gold 22K Collection", colorTheme: "amber", dotColor: "bg-amber-400", dotShadow: "shadow-amber-200" },
    { key: "Gold 24K", label: "Gold 24K Collection", colorTheme: "yellow", dotColor: "bg-yellow-400", dotShadow: "shadow-yellow-200" },
    { key: "Silver", label: "Sterling Silver Collection", colorTheme: "slate", dotColor: "bg-slate-300", dotShadow: "shadow-slate-200" },
  ];

  return (
    <div className="relative pb-12">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-10 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center sm:justify-start gap-3">
            <PackageSearch className="text-indigo-600" size={32} /> Selling Counter
          </h2>
          <p className="text-slate-500 mt-2 font-medium">
            Items sent from production, ready for sale. Weight is calculated from quantity.
          </p>
        </div>
      </div>

      <div className="space-y-12">
        {metalSections.map(({ key, label, colorTheme, dotColor, dotShadow }) => (
          <section key={key}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-2 h-8 ${dotColor} rounded-full shadow-sm ${dotShadow}`}></div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">{label}</h3>
            </div>

            {(inventory[key] || []).length === 0 ? (
              <div className="bg-slate-50 p-12 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                <p className="text-slate-400 font-bold text-lg">No {key} items in the counter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {inventory[key].map((item, idx) => (
                  <ProductCard key={`${key}-${idx}`} item={item} colorTheme={colorTheme} />
                ))}
              </div>
            )}
          </section>
        ))}
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
                  Return pieces from the counter back to finished goods.
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
                <span className="font-bold">{selectedItem.metal_type}</span> · In Counter: <span className="font-black text-gray-800">{selectedItem.total_pieces}</span> pcs
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
