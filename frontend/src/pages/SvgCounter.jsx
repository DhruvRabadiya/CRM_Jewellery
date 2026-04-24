import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Store, ArrowRight, X, RefreshCw,
  Search, Clock, ArrowUpCircle, ArrowDownCircle, Plus, Minus,
} from "lucide-react";
import { getSvgInventory, removeFromSvg, getSvgHistory } from "../api/svgService";
import Toast from "../components/Toast";

const parseUnitWeight = (category) => {
  if (!category) return null;
  const trimmed = category.trim();
  if (trimmed === "Mix" || trimmed === "Other") return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

const METAL_COLORS = {
  "Gold 22K": { dot: "bg-amber-400", badge: "bg-amber-100 text-amber-800", border: "border-l-amber-400" },
  "Gold 24K": { dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-800", border: "border-l-yellow-400" },
  Silver:     { dot: "bg-slate-400",  badge: "bg-slate-100 text-slate-700",  border: "border-l-slate-400"  },
};

const fmt3 = (n) => Number(n || 0).toFixed(3);
const fmt2 = (n) => Number(n || 0).toFixed(2);

// ─── Send to Counter Modal ─────────────────────────────────────────────────────

const SendModal = ({ item, onClose, onSuccess }) => {
  const [pcs, setPcs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const unitWeight = parseUnitWeight(item.target_product);
  const transferWeight =
    pcs && parseInt(pcs) > 0
      ? unitWeight != null
        ? parseInt(pcs) * unitWeight
        : item.total_pieces > 0
          ? (parseInt(pcs) / item.total_pieces) * item.total_weight
          : 0
      : null;

  const mc = METAL_COLORS[item.metal_type] || METAL_COLORS.Silver;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pieces = parseInt(pcs);
    if (!pieces || pieces <= 0) return setToast({ message: "Enter a valid number of pieces", type: "error" });
    if (pieces > item.total_pieces) return setToast({ message: "Cannot exceed available pieces", type: "error" });
    setSubmitting(true);
    try {
      await removeFromSvg({ metal_type: item.metal_type, target_product: item.target_product, pieces });
      onSuccess(`Moved ${pieces} pcs to Selling Counter`);
    } catch (err) {
      setToast({ message: err.message || "Transfer failed", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className={`h-1 ${mc.dot.replace("bg-", "bg-")}`} />
        <div className="p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <h3 className="text-lg font-black text-slate-800">Send to Counter</h3>
              <p className="text-xs text-slate-500 mt-0.5">{item.target_product} · {item.metal_type}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Available</p>
              <p className="text-2xl font-black text-slate-800">{item.total_pieces}<span className="text-xs text-slate-400 ml-1">pcs</span></p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Weight</p>
              <p className="text-2xl font-black text-slate-800">{fmt2(item.total_weight)}<span className="text-xs text-slate-400 ml-1">g</span></p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-600 mb-1.5 uppercase tracking-wider">Pieces to Send</label>
              <input
                type="number" min="1" max={item.total_pieces} required autoFocus
                value={pcs} onChange={(e) => setPcs(e.target.value)}
                placeholder={`1 – ${item.total_pieces}`}
                className="w-full px-4 py-3 text-xl font-black text-center border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
              />
              {transferWeight != null && (
                <div className="mt-2 flex justify-between px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-bold text-indigo-700">
                  <span>Transfer Weight</span>
                  <span>{fmt3(transferWeight)} g</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !pcs}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Store size={15} />
                {submitting ? "Sending…" : "Send to Counter"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SvgCounter = () => {
  const [inventory, setInventory] = useState({ "Gold 24K": [], Silver: [], "Gold 22K": [] });
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("vault"); // "vault" | "history"
  const [search, setSearch]       = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [toast, setToast]         = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, hist] = await Promise.all([getSvgInventory(), getSvgHistory(60)]);
      const grouped = { "Gold 24K": [], Silver: [], "Gold 22K": [] };
      (inv.data || []).forEach((item) => {
        if (grouped[item.metal_type]) grouped[item.metal_type].push(item);
      });
      setInventory(grouped);
      setHistory(hist.data || []);
    } catch {
      showToast("Failed to load SVG Vault", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allItems  = [...inventory["Gold 24K"], ...inventory.Silver, ...inventory["Gold 22K"]];
  const totalPcs  = allItems.reduce((s, i) => s + (i.total_pieces || 0), 0);
  const totalWt   = allItems.reduce((s, i) => s + (i.total_weight || 0), 0);

  const filtered = (items) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.target_product.toLowerCase().includes(q) || i.metal_type.toLowerCase().includes(q));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Loading vault…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {modalItem && (
        <SendModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onSuccess={(msg) => { showToast(msg); setModalItem(null); fetchAll(); }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-indigo-600" /> SVG Vault
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalPcs} items · {fmt2(totalWt)} g total across all metals</p>
        </div>
        <button onClick={fetchAll}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 px-3 py-2 rounded-xl transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {[{ key: "Gold 24K" }, { key: "Silver" }, { key: "Gold 22K" }].map(({ key }) => {
          const mc = METAL_COLORS[key];
          const items = inventory[key] || [];
          const pcs = items.reduce((s, i) => s + (i.total_pieces || 0), 0);
          const wt  = items.reduce((s, i) => s + (i.total_weight || 0), 0);
          return (
            <div key={key} className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 border-l-4 ${mc.border}`}>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{key}</p>
              <p className="text-xl font-black text-slate-800">{pcs} <span className="text-xs font-semibold text-slate-400">pcs</span></p>
              <p className="text-sm font-semibold text-slate-500">{fmt2(wt)} g</p>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[{ id: "vault", label: "Vault Inventory" }, { id: "history", label: "History" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${tab === t.id ? "bg-white shadow-sm text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Vault Inventory Tab ── */}
      {tab === "vault" && (
        <div className="space-y-5">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product or metal…"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {/* Per-metal tables */}
          {[{ key: "Gold 24K" }, { key: "Silver" }, { key: "Gold 22K" }].map(({ key }) => {
            const mc = METAL_COLORS[key];
            const items = filtered(inventory[key] || []);
            const totalPcsSection = inventory[key].reduce((s, i) => s + (i.total_pieces || 0), 0);
            const totalWtSection  = inventory[key].reduce((s, i) => s + (i.total_weight || 0), 0);

            return (
              <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Section header */}
                <div className={`px-5 py-3 flex items-center justify-between border-b border-slate-100 border-l-4 ${mc.border} bg-slate-50/60`}>
                  <div className="flex items-center gap-3">
                    <h3 className="font-black text-slate-700">{key}</h3>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 font-semibold">{totalPcsSection} pcs · {fmt2(totalWtSection)} g</span>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-slate-400 font-semibold">
                    {search ? `No matching ${key} items` : `No ${key} items in vault`}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="text-left px-5 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Product</th>
                        <th className="text-center px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Pieces</th>
                        <th className="text-right px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Weight (g)</th>
                        <th className="text-right px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Avg/pc (g)</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const avgWt = item.total_pieces > 0 ? item.total_weight / item.total_pieces : 0;
                        return (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors">
                            <td className="px-5 py-3">
                              <span className="font-bold text-slate-800">{item.target_product}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 text-xs font-black rounded-full ${mc.badge}`}>
                                {item.total_pieces}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{fmt3(item.total_weight)}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">{fmt3(avgWt)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => setModalItem(item)}
                                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors ml-auto">
                                <Store size={12} /> Send
                                <ArrowRight size={11} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <Clock size={15} className="text-slate-400" />
            <h3 className="font-black text-slate-700 text-sm">Recent Vault Movements</h3>
            <span className="text-xs text-slate-400 ml-auto">{history.length} records</span>
          </div>
          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-semibold text-sm">No history yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Metal</th>
                  <th className="text-left px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Product</th>
                  <th className="text-center px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Pieces</th>
                  <th className="text-right px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Weight (g)</th>
                  <th className="text-right px-5 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const isIn = (row.pieces || 0) > 0;
                  const mc   = METAL_COLORS[row.metal_type] || METAL_COLORS.Silver;
                  const dateStr = row.created_at
                    ? new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                  return (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-bold w-fit px-2 py-0.5 rounded-full ${isIn ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {isIn ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
                          {isIn ? "Deposit" : "Withdraw"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${mc.badge}`}>{row.metal_type}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.target_product}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${isIn ? "text-green-700" : "text-red-600"}`}>
                          {isIn ? <Plus size={10} className="inline" /> : <Minus size={10} className="inline" />}
                          {Math.abs(row.pieces || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {row.weight != null ? fmt3(Math.abs(row.weight)) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500">{dateStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Info Footer ── */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <ShieldCheck size={18} className="text-indigo-500 mt-0.5" />
        <div className="text-xs text-slate-600 font-medium">
          SVG Vault tracks your gold & silver inventory before sending it to the selling counter.
          Use <span className="font-bold text-indigo-600">Send</span> to move items.
        </div>
      </div>
    </div>
  );
};

export default SvgCounter;