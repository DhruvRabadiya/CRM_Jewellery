import React, { useState, useEffect, useCallback } from "react";
import { Package, PackageCheck, Weight, LayoutGrid, RefreshCw } from "lucide-react";
import { getFinishedGoods } from "../api/finishedGoodsService";
import Toast from "../components/Toast";

const TAB_CONFIG = {
  "Gold 22K": {
    dot: "bg-amber-400",
    activeBg: "bg-amber-100 text-amber-900 ring-2 ring-amber-300",
    border: "border-amber-100",
    topBar: "bg-amber-400",
    iconBg: "bg-amber-50 text-amber-600",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
    wt: "bg-amber-50 border-amber-100 text-amber-900",
    wtLabel: "text-amber-600",
    empty: "bg-amber-50/50 border-amber-200 text-amber-700",
  },
  "Gold 24K": {
    dot: "bg-yellow-400",
    activeBg: "bg-yellow-100 text-yellow-900 ring-2 ring-yellow-300",
    border: "border-yellow-100",
    topBar: "bg-yellow-400",
    iconBg: "bg-yellow-50 text-yellow-600",
    badge: "bg-yellow-50 text-yellow-700 border-yellow-100",
    wt: "bg-yellow-50 border-yellow-100 text-yellow-900",
    wtLabel: "text-yellow-600",
    empty: "bg-yellow-50/50 border-yellow-200 text-yellow-700",
  },
  Silver: {
    dot: "bg-gray-400",
    activeBg: "bg-gray-200 text-gray-900 ring-2 ring-gray-400",
    border: "border-gray-200",
    topBar: "bg-gray-400",
    iconBg: "bg-gray-100 text-gray-500",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    wt: "bg-gray-100 border-gray-200 text-gray-800",
    wtLabel: "text-gray-500",
    empty: "bg-gray-50 border-gray-300 text-gray-500",
  },
};

const FinishedGoods = () => {
  const [inventory, setInventory] = useState({ "Gold 22K": [], "Gold 24K": [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Gold 22K");
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFinishedGoods();
      if (result.success) {
        const grouped = { "Gold 22K": [], "Gold 24K": [], Silver: [] };
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

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse text-gray-500">
        Loading Inventory...
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <Package className="text-blue-600" size={24} /> Finished Goods Vault
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Manufactured items ready for dispatch</p>
        </div>
        <button
          onClick={fetchInventory}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 font-semibold text-sm px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-blue-400 shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Object.entries(TAB_CONFIG).map(([metal, c]) => {
          const metalItems = inventory[metal] || [];
          const pieces = metalItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
          const weight = metalItems.reduce((s, i) => s + (i.total_weight || 0), 0);
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
              <span className="flex items-center gap-1"><LayoutGrid size={12} /><strong className="text-gray-700">{totalPieces}</strong> pcs</span>
              <span className="flex items-center gap-1"><Weight size={12} /><strong className="text-gray-700">{totalWeight.toFixed(3)}</strong>g</span>
            </div>
          )}
        </div>

        <div className="p-4">
          {items.length === 0 ? (
            <div className={`${cfg.empty} p-8 rounded-xl border border-dashed text-center`}>
              <PackageCheck size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-sm">No finished {activeTab} items currently in stock.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Product</th>
                    <th className="text-center py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Metal</th>
                    <th className="text-right py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Pieces</th>
                    <th className="text-right py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Total Weight</th>
                    <th className="text-right py-2.5 px-4 font-bold text-gray-500 text-xs uppercase">Avg. Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50/30 transition-colors`}
                    >
                      <td className="py-2.5 px-4 font-bold text-gray-800 flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${cfg.iconBg}`}>
                          <PackageCheck size={14} />
                        </div>
                        {item.target_product}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${cfg.badge} border text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide`}>
                          {item.metal_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black text-gray-800">{item.total_pieces}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-700">{item.total_weight.toFixed(3)}g</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-500">
                        {item.total_pieces > 0 ? (item.total_weight / item.total_pieces).toFixed(3) : "—"}g
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t border-gray-200">
                    <td className="py-2 px-4 font-black text-gray-700 text-xs uppercase">Total</td>
                    <td></td>
                    <td className="py-2 px-4 text-right font-black text-gray-800">{totalPieces}</td>
                    <td className="py-2 px-4 text-right font-black text-gray-800">{totalWeight.toFixed(3)}g</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinishedGoods;
