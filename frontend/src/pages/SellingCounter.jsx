import React, { useState, useEffect, useCallback } from "react";
import { PackageSearch, Weight, Layers } from "lucide-react";
import { getFinishedGoods } from "../api/finishedGoodsService";
import Toast from "../components/Toast";

const SellingCounter = () => {
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
        const grouped = { Gold: [], Silver: [] };
        result.data.forEach((item) => {
          if (grouped[item.metal_type]) {
            grouped[item.metal_type].push(item);
          }
        });
        setInventory(grouped);
      }
    } catch (error) {
      showToast("Failed to load inventory", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-indigo-400 font-bold text-xl mt-20">
        Loading Point of Sale Inventory...
      </div>
    );
  }

  const ProductCard = ({ item, colorTheme }) => (
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
            <Layers size={18} /> Pieces Available
          </div>
          <span className="text-2xl font-black text-slate-800">
            {item.total_pieces}
          </span>
        </div>

        <div className={`bg-${colorTheme}-50 p-4 rounded-2xl flex items-center justify-between border border-${colorTheme}-100`}>
          <div className={`flex items-center gap-2 text-${colorTheme}-600 font-bold text-sm`}>
            <Weight size={18} /> Total Weight
          </div>
          <span className={`text-xl font-black text-${colorTheme}-900`}>
            {(item.metal_type === "Gold" ? item.total_weight : item.total_weight / 1000).toFixed(3)}
            <span className="text-sm font-bold opacity-70 ml-1">
              {item.metal_type === "Gold" ? "g" : "kg"}
            </span>
          </span>
        </div>
      </div>
      
      {/* Visual flair */}
      <div className={`absolute -bottom-6 -right-6 w-32 h-32 bg-${colorTheme}-50 rounded-full blur-2xl opacity-50 group-hover:scale-150 transition-transform duration-700 pointer-events-none`}></div>
    </div>
  );

  return (
    <div className="relative pb-12">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-10 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center sm:justify-start gap-3">
            <PackageSearch className="text-indigo-600" size={32} /> Finished Inventory
          </h2>
          <p className="text-slate-500 mt-2 font-medium">
            Items processed, verified, and ready for sale.
          </p>
        </div>
      </div>

      <div className="space-y-12">
        {/* GOLD SECTION */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 bg-yellow-400 rounded-full shadow-sm shadow-yellow-200"></div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Pure Gold Collection</h3>
          </div>
          
          {inventory.Gold.length === 0 ? (
            <div className="bg-slate-50 p-12 rounded-3xl border-2 border-dashed border-slate-200 text-center">
              <p className="text-slate-400 font-bold text-lg">No gold items ready for sale.</p>
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
            <div className="w-2 h-8 bg-slate-300 rounded-full shadow-sm shadow-slate-200"></div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Sterling Silver Collection</h3>
          </div>
          
          {inventory.Silver.length === 0 ? (
            <div className="bg-slate-50 p-12 rounded-3xl border-2 border-dashed border-slate-200 text-center">
              <p className="text-slate-400 font-bold text-lg">No silver items ready for sale.</p>
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
    </div>
  );
};

export default SellingCounter;
