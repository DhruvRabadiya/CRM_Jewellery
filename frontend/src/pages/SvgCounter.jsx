import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Weight, Layers, Plus, ArrowLeftRight, Lock } from "lucide-react";
import { getSvgInventory, addToSvg, removeFromSvg } from "../api/svgService";
import { getFinishedGoods } from "../api/finishedGoodsService";
import Toast from "../components/Toast";

const SvgCounter = () => {
  const [inventory, setInventory] = useState({ Gold: [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  
  // Available stock for Modals
  const [availableStocks, setAvailableStocks] = useState({ Gold: [], Silver: [] });
  const [selectedStock, setSelectedStock] = useState(null);
  
  // Form State
  const [transferPieces, setTransferPieces] = useState("");
  const [transferWeight, setTransferWeight] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchVault = useCallback(async () => {
    try {
      const result = await getSvgInventory();
      if (result.success) {
        const grouped = { Gold: [], Silver: [] };
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
      const result = await getFinishedGoods();
      if (result.success) {
        const grouped = { Gold: [], Silver: [] };
        result.data.forEach((item) => {
          // Only show items that actually have pieces left
          if (grouped[item.metal_type] && item.total_pieces > 0) {
            grouped[item.metal_type].push(item);
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
    setTransferWeight("");
    setShowAddModal(true);
  };

  const handleOpenRemove = () => {
    // For remove, available stocks are what is currently inside the vault
    setAvailableStocks(inventory);
    setSelectedStock(null);
    setTransferPieces("");
    setTransferWeight("");
    setShowRemoveModal(true);
  };

  const handleAction = async (e, type) => {
    e.preventDefault();
    if (!selectedStock || !transferPieces || !transferWeight) {
      return showToast("Please fill all fields", "error");
    }

    const pieces = parseInt(transferPieces);
    const weight = parseFloat(transferWeight);

    if (pieces <= 0 || weight <= 0) {
      return showToast("Values must be greater than zero", "error");
    }

    // Validation
    if (pieces > selectedStock.total_pieces || weight > selectedStock.total_weight) {
      return showToast("Cannot transfer more than available stock limit", "error");
    }

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
        fetchVault(); // Refresh vault
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

  const ProductCard = ({ item, colorTheme }) => (
    <div className={`bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800 hover:border-${colorTheme}-500/50 transition-all duration-300 relative overflow-hidden group hover:-translate-y-1`}>
      
      <div className="flex justify-between items-start mb-6 z-10 relative">
        <h3 className="text-2xl font-black text-white leading-tight">
          {item.target_product}
        </h3>
        <span className={`bg-slate-800 text-${colorTheme}-400 px-3 py-1 rounded-full text-xs font-bold border border-slate-700 uppercase tracking-widest`}>
          {item.metal_type}
        </span>
      </div>

      <div className="flex flex-col gap-3 relative z-10">
        <div className="bg-slate-800/50 p-4 rounded-2xl flex items-center justify-between border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
            <Layers size={18} /> Vaulted Pieces
          </div>
          <span className="text-2xl font-black text-white">
            {item.total_pieces}
          </span>
        </div>

        <div className={`bg-slate-800 p-4 rounded-2xl flex items-center justify-between border border-${colorTheme}-900/50`}>
          <div className={`flex items-center gap-2 text-${colorTheme}-400 font-bold text-sm`}>
            <Weight size={18} /> Secure Weight
          </div>
          <span className={`text-xl font-black text-${colorTheme}-300`}>
            {(item.metal_type === "Gold" ? item.total_weight : item.total_weight / 1000).toFixed(3)}
            <span className="text-sm font-bold opacity-70 ml-1">
              {item.metal_type === "Gold" ? "g" : "kg"}
            </span>
          </span>
        </div>
      </div>
      
      {/* Visual flair */}
      <div className={`absolute -bottom-6 -right-6 w-32 h-32 bg-${colorTheme}-900 rounded-full blur-2xl opacity-20 group-hover:scale-150 transition-transform duration-700 pointer-events-none`}></div>
    </div>
  );

  return (
    <div className="relative pb-12 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-10 flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-900 rounded-[2rem] p-8 shadow-2xl border border-slate-800 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-10 pointer-events-none"></div>
        <div className="z-10 relative max-w-2xl">
          <h2 className="text-4xl font-black text-white tracking-tight flex items-center justify-center sm:justify-start gap-4 mb-2">
            <ShieldCheck className="text-indigo-400" size={40} /> SVG Vault
          </h2>
          <p className="text-slate-400 font-medium text-lg leading-relaxed">
            High-security vault for finished goods. Items stored here are separated from the main display counter.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 z-10 w-full sm:w-auto">
          <button 
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/50"
          >
            <Plus size={20} /> Add to Vault
          </button>
          <button 
            onClick={handleOpenRemove}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-3 rounded-xl font-bold transition-all border border-slate-700"
          >
            <ArrowLeftRight size={20} /> Return to Stocks
          </button>
        </div>
      </div>

      <div className="space-y-12">
        {/* GOLD SECTION */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 bg-yellow-500 rounded-full shadow-sm shadow-yellow-500/50"></div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Secure Gold Goods</h3>
          </div>
          
          {inventory.Gold.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center shadow-sm">
              <Lock className="mx-auto text-slate-300 mb-4" size={48} strokeWidth={1} />
              <p className="text-slate-500 font-bold text-lg">Vault is currently empty for Gold.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {inventory.Gold.map((item, idx) => (
                <ProductCard key={`gold-${idx}`} item={item} colorTheme="yellow" />
              ))}
            </div>
          )}
        </section>

        {/* SILVER SECTION */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 bg-slate-400 rounded-full shadow-sm shadow-slate-400/50"></div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Secure Silver Goods</h3>
          </div>
          
          {inventory.Silver.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center shadow-sm">
              <Lock className="mx-auto text-slate-300 mb-4" size={48} strokeWidth={1} />
              <p className="text-slate-500 font-bold text-lg">Vault is currently empty for Silver.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {inventory.Silver.map((item, idx) => (
                <ProductCard key={`silver-${idx}`} item={item} colorTheme="slate" />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* MODAL SHARED COMPONENT */}
      {(showAddModal || showRemoveModal) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-2 ${showAddModal ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2">
              {showAddModal ? "Add to SVG Vault" : "Return to Stocks"}
            </h3>
            <p className="text-slate-500 font-medium mb-8">
              {showAddModal 
                ? "Secure finishing goods by moving them from Main Stocks into the Vault." 
                : "Remove items from the Vault and return them to Main Stocks for display/sale."}
            </p>

            <form onSubmit={(e) => handleAction(e, showAddModal ? "ADD" : "REMOVE")} className="space-y-6">
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Select Item</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all appearance-none"
                  value={selectedStock ? `${selectedStock.metal_type}-${selectedStock.target_product}` : ""}
                  onChange={(e) => {
                    const [metal, product] = e.target.value.split("-");
                    const found = availableStocks[metal]?.find(i => i.target_product === product);
                    setSelectedStock(found || null);
                    setTransferPieces("");
                    setTransferWeight("");
                  }}
                  required
                >
                  <option value="" disabled>-- Select Available Category --</option>
                  {Object.entries(availableStocks).map(([metal, items]) => (
                    items.length > 0 && (
                      <optgroup key={metal} label={metal}>
                        {items.map(i => (
                          <option key={`${metal}-${i.target_product}`} value={`${metal}-${i.target_product}`}>
                            {i.target_product}
                          </option>
                        ))}
                      </optgroup>
                    )
                  ))}
                </select>
                {selectedStock && (
                  <div className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg inline-block">
                    Available: {selectedStock.total_pieces} pieces ({(selectedStock.metal_type === "Gold" ? selectedStock.total_weight : selectedStock.total_weight / 1000).toFixed(3)} {selectedStock.metal_type === "Gold" ? "g" : "kg"})
                  </div>
                )}
              </div>

              {selectedStock && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Pieces</label>
                    <input 
                      type="number" 
                      min="1"
                      max={selectedStock.total_pieces}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                      value={transferPieces}
                      onChange={(e) => setTransferPieces(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Weight {selectedStock.metal_type === "Gold" ? "(g)" : "(mg)"}</label>
                    <input 
                      type="number" 
                      step="0.001"
                      min="0.001"
                      max={selectedStock.total_weight}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                      value={transferWeight}
                      onChange={(e) => setTransferWeight(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowAddModal(false);
                    setShowRemoveModal(false);
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-4 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || !selectedStock}
                  className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all text-white shadow-lg ${
                    showAddModal 
                      ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30" 
                      : "bg-slate-800 hover:bg-slate-700 shadow-slate-800/30"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSubmitting ? "Processing..." : showAddModal ? "Confirm Add" : "Confirm Return"}
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
