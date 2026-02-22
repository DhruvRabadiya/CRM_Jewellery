import React, { useState, useEffect, useCallback } from "react";
import { Package, PackageCheck, Weight, LayoutGrid } from "lucide-react";
import { getFinishedGoods } from "../api/finishedGoodsService";
import Toast from "../components/Toast";

const FinishedGoods = () => {
  const [inventory, setInventory] = useState({ Gold: [], Silver: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchInventory = useCallback(async () => {
    try {
      const result = await getFinishedGoods();
      if (result.success) {
        // Group data by metal type
        const grouped = { Gold: [], Silver: [] };
        result.data.forEach((item) => {
          if (grouped[item.metal_type]) {
            grouped[item.metal_type].push(item);
          }
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

  // Helper component for rendering product cards
  const ProductCard = ({ item, colorTheme }) => (
    <div
      className={`bg-white rounded-2xl p-6 shadow-sm border border-${colorTheme}-100 hover:shadow-md transition-all relative overflow-hidden group`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1 bg-${colorTheme}-400`}
      ></div>

      <div className="flex justify-between items-start mb-6 mt-2">
        <div
          className={`p-3 bg-${colorTheme}-50 rounded-xl text-${colorTheme}-600`}
        >
          <PackageCheck size={28} />
        </div>
        <span
          className={`bg-${colorTheme}-50 text-${colorTheme}-700 px-3 py-1 rounded-full text-xs font-bold border border-${colorTheme}-100 uppercase tracking-widest`}
        >
          {item.metal_type}
        </span>
      </div>

      <h3 className="text-2xl font-bold text-gray-800 mb-1">
        {item.target_product}
      </h3>
      <p className="text-sm font-semibold text-gray-400 mb-6 uppercase tracking-wide">
        Ready for Sale
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-center items-center">
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1">
            <LayoutGrid size={14} /> Pieces
          </span>
          <span className="text-2xl font-black text-gray-800">
            {item.total_pieces}
          </span>
        </div>
        <div
          className={`bg-${colorTheme}-50 p-4 rounded-xl border border-${colorTheme}-100 flex flex-col justify-center items-center`}
        >
          <span
            className={`text-xs font-bold text-${colorTheme}-600 uppercase flex items-center gap-1 mb-1`}
          >
            <Weight size={14} /> Total Wt.
          </span>
          <span className={`text-xl font-bold text-${colorTheme}-900`}>
            {(item.metal_type === "Gold"
              ? item.total_weight
              : item.total_weight / 1000
            ).toFixed(3)}
            <span className="text-sm font-medium opacity-70 ml-1">
              {item.metal_type === "Gold" ? "g" : "kg"}
            </span>
          </span>
        </div>
      </div>
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

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight flex items-center gap-3">
            <Package className="text-blue-600" size={32} /> Finished Goods Vault
          </h1>
          <p className="text-gray-500 mt-1">
            View manufactured items ready for dispatch
          </p>
        </div>
      </div>

      {/* GOLD SECTION */}
      <div className="mb-12">
        <h2 className="text-xl font-black text-yellow-600 uppercase tracking-widest mb-6 flex items-center gap-2">
          <div className="w-2 h-6 bg-yellow-400 rounded-full"></div> Gold
          Products
        </h2>
        {inventory.Gold.length === 0 ? (
          <div className="bg-yellow-50/50 p-8 rounded-2xl border border-dashed border-yellow-200 text-center text-yellow-700">
            <p className="font-semibold">
              No finished gold items currently in stock.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {inventory.Gold.map((item, idx) => (
              <ProductCard
                key={`gold-${idx}`}
                item={item}
                colorTheme="yellow"
              />
            ))}
          </div>
        )}
      </div>

      {/* SILVER SECTION */}
      <div>
        <h2 className="text-xl font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
          <div className="w-2 h-6 bg-gray-400 rounded-full"></div> Silver
          Products
        </h2>
        {inventory.Silver.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
            <p className="font-semibold">
              No finished silver items currently in stock.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {inventory.Silver.map((item, idx) => (
              <ProductCard
                key={`silver-${idx}`}
                item={item}
                colorTheme="gray"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FinishedGoods;
