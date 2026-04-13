import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Weight, Layers, Plus, ArrowLeftRight, Lock, X } from "lucide-react";
import { getSvgInventory, addToSvg, removeFromSvg } from "../api/svgService";
import { getCounterInventory } from "../api/counterService";
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

const SvgCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  
  // Available stock for Modals
  const [availableStocks, setAvailableStocks] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [selectedStock, setSelectedStock] = useState(null);
  
  // Form State
  const [transferPieces, setTransferPieces] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchVault = useCallback(async () => {
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

  const fetchStocksForAdd = async () => {
    try {
      const result = await getCounterInventory();
      if (result.success) {
        const grouped = { "Gold 22K": [], "Gold 24K": [], Silver: [] };
        result.data.forEach((item) => {
          if (grouped[item.metal_type] && item.total_pieces > 0) {
            const unitWeight = parseUnitWeight(item.target_product);
            const calculatedWeight = unitWeight != null ? item.total_pieces * unitWeight : 0;
            grouped[item.metal_type].push({ ...item, total_weight: calculatedWeight, unit_weight: unitWeight });
          }
        });
        setAvailableStocks(grouped);
      }
    } catch (error) {
      showToast("Failed to load available stocks", "error");
    }
  };

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  const handleOpenAdd = () => {
    fetchStocksForAdd();
    setSelectedStock(null);
    setTransferPieces("");
    setShowAddModal(true);
  };

  const handleOpenRemove = () => {
    setAvailableStocks(inventory);
    setSelectedStock(null);
    setTransferPieces("");
    setShowRemoveModal(true);
  };

  const getComputedWeight = (stock, pieces) => {
    if (!stock || !pieces || parseInt(pieces) <= 0) return 0;
    const unitWeight = parseUnitWeight(stock.target_product);
    if (unitWeight != null) {
      return parseInt(pieces) * unitWeight;
    }
    // Proportional fallback for Mix/Other
    if (stock.total_pieces > 0 && stock.total_weight > 0) {
      return (parseInt(pieces) / stock.total_pieces) * stock.total_weight;
    }
    return 0;
  };

  const handleAction = async (e, type) => {
    e.preventDefault();
    if (!selectedStock || !transferPieces) {
      return showToast("Please select an item and enter pieces", "error");
    }

    const pieces = parseInt(transferPieces);
    if (pieces <= 0) {
      return showToast("Pieces must be greater than zero", "error");
    }

    if (pieces > selectedStock.total_pieces) {
      return showToast("Cannot transfer more pieces than available", "error");
    }

    const weight = getComputedWeight(selectedStock, pieces);

    setIsSubmitting(true);
    try {
      const payload = {
        metal_type: selectedStock.metal_type,
        target_product: selectedStock.target_product,
        pieces,
        weight
      };

      let result;
      if (type === "ADD") {
        result = await addToSvg(payload);
      } else {
        result = await removeFromSvg(payload);
      }

      if (result.success) {
        showToast(result.message, "success");
        setShowAddModal(false);
        setShowRemoveModal(false);
        fetchVault();
      }
    } catch (error) {
      showToast(error.message || `Failed to ${type === "ADD" ? "add to" : "remove from"} SVG`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-indigo-400 font-bold text-xl mt-20">
        Accessing Secure Vault...
      </div>
    );
  }

  const metalSections = [
    { key: "Gold 22K", label: "Gold 22K", colorTheme: "yellow" },
    { key: "Gold 24K", label: "Gold 24K", colorTheme: "yellow" },
    { key: "Silver", label: "Silver", colorTheme: "slate" },
  ];

  const ProductCard = ({ item, colorTheme }) => (
    <div className={`bg-slate-900 rounded-2xl p-5 shadow-xl border border-slate-800 hover:border-${colorTheme}-500/50 transition-all duration-300 relative overflow-hidden group`}>
      
      <div className="flex justify-between items-start mb-4 z-10 relative">
        <h3 className="text-lg font-black text-white leading-tight">
          {item.target_product}
        </h3>
        <span className={`bg-slate-800 text-${colorTheme}-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-700 uppercase tracking-widest`}>
          {item.metal_type}
        </span>
      </div>

      <div className="flex gap-3 relative z-10">
        <div className="flex-1 bg-slate-800/50 p-3 rounded-xl flex flex-col items-center border border-slate-700/50">
          <div className="flex items-center gap-1 text-slate-400 font-bold text-xs mb-1">
            <Layers size={12} /> Pieces
          </div>
          <span className="text-xl font-black text-white">
            {item.total_pieces}
          </span>
        </div>

        <div className={`flex-1 bg-slate-800 p-3 rounded-xl flex flex-col items-center border border-${colorTheme}-900/50`}>
          <div className={`flex items-center gap-1 text-${colorTheme}-400 font-bold text-xs mb-1`}>
            <Weight size={12} /> Weight
          </div>
          <span className={`text-xl font-black text-${colorTheme}-300`}>
            {item.total_weight.toFixed(2)}<span className="text-xs font-bold opacity-70 ml-0.5">g</span>
          </span>
        </div>
      </div>
      
      <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-${colorTheme}-900 rounded-full blur-2xl opacity-20 group-hover:scale-150 transition-transform duration-700 pointer-events-none`}></div>
    </div>
  );

  return (
    <div className="relative pb-12 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500 rounded-full blur-[80px] opacity-10 pointer-events-none"></div>
        <div className="z-10 relative">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3 mb-1">
            <ShieldCheck className="text-indigo-400" size={28} /> SVG Vault
          </h2>
          <p className="text-slate-400 font-medium text-sm">
            Secure vault for finished goods separated from the selling counter.
          </p>
        </div>
        <div className="flex gap-3 z-10 w-full sm:w-auto">
          <button 
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/50"
          >
            <Plus size={16} /> Add to Vault
          </button>
          <button 
            onClick={handleOpenRemove}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl font-bold text-sm transition-all border border-slate-700"
          >
            <ArrowLeftRight size={16} /> Return
          </button>
        </div>
      </div>

      {/* Vault Contents */}
      <div className="space-y-8">
        {metalSections.map(({ key, label, colorTheme }) => (
          <section key={key}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-1.5 h-6 ${colorTheme === "yellow" ? "bg-yellow-500" : "bg-slate-400"} rounded-full`}></div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{label} Vault</h3>
            </div>
            
            {(inventory[key] || []).length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-sm">
                <Lock className="mx-auto text-slate-300 mb-3" size={36} strokeWidth={1} />
                <p className="text-slate-500 font-bold text-sm">No {label} items in the vault.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(inventory[key] || []).map((item, idx) => (
                  <ProductCard key={`${key}-${idx}`} item={item} colorTheme={colorTheme} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* MODAL */}
      {(showAddModal || showRemoveModal) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1.5 ${showAddModal ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  {showAddModal ? "Add to SVG Vault" : "Return from Vault"}
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  {showAddModal 
                    ? "Move items from the counter into the vault." 
                    : "Return items from the vault back to stock."}
                </p>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setShowRemoveModal(false); }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => handleAction(e, showAddModal ? "ADD" : "REMOVE")} className="space-y-5">
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Select Item</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all appearance-none"
                  value={selectedStock ? `${selectedStock.metal_type}||${selectedStock.target_product}` : ""}
                  onChange={(e) => {
                    const [metal, ...productParts] = e.target.value.split("||");
                    const product = productParts.join("||");
                    const found = availableStocks[metal]?.find(i => i.target_product === product);
                    setSelectedStock(found || null);
                    setTransferPieces("");
                  }}
                  required
                >
                  <option value="" disabled>-- Select Category --</option>
                  {Object.entries(availableStocks).map(([metal, items]) => (
                    items.length > 0 && (
                      <optgroup key={metal} label={metal}>
                        {items.map(i => (
                          <option key={`${metal}||${i.target_product}`} value={`${metal}||${i.target_product}`}>
                            {i.target_product} ({i.total_pieces} pcs)
                          </option>
                        ))}
                      </optgroup>
                    )
                  ))}
                </select>
                {selectedStock && (
                  <div className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100">
                    Available: {selectedStock.total_pieces} pieces · {selectedStock.total_weight.toFixed(2)}g
                  </div>
                )}
              </div>

              {selectedStock && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Pieces</label>
                  <input 
                    type="number" 
                    min="1"
                    max={selectedStock.total_pieces}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    value={transferPieces}
                    onChange={(e) => setTransferPieces(e.target.value)}
                    placeholder="Enter number of pieces"
                    required
                    autoFocus
                  />
                  {transferPieces && parseInt(transferPieces) > 0 && (
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase">Weight</span>
                        <span className="text-lg font-black text-gray-800">
                          {getComputedWeight(selectedStock, transferPieces).toFixed(2)}<span className="text-xs font-bold text-gray-400 ml-0.5">g</span>
                        </span>
                      </div>
                      {parseUnitWeight(selectedStock.target_product) != null && (
                        <p className="text-xs text-gray-400 mt-1">
                          {transferPieces} pcs × {parseUnitWeight(selectedStock.target_product)}g = {getComputedWeight(selectedStock, transferPieces).toFixed(2)}g
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => { setShowAddModal(false); setShowRemoveModal(false); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-3 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || !selectedStock || !transferPieces}
                  className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all text-white shadow-lg flex items-center justify-center gap-2 ${
                    showAddModal 
                      ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30" 
                      : "bg-slate-800 hover:bg-slate-700 shadow-slate-800/30"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {showAddModal ? <Plus size={16} /> : <ArrowLeftRight size={16} />}
                  {isSubmitting ? "Processing..." : showAddModal ? "Add to Vault" : "Return to Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SvgCounter;
