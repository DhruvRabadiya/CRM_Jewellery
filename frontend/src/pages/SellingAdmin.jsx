import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Trash2, X, CheckCircle, AlertCircle, Save, Check,
  ChevronDown, ChevronRight, FolderPlus, Gem,
} from "lucide-react";
import {
  getLabourCharges,
  createLabourCharge,
  deleteLabourCharge,
  bulkUpdateLabourCharges,
} from "../api/labourChargeService";

// ─── Constants ────────────────────────────────────────────────────────────────

// Metal tabs are data-driven from the server; this array only sets display order & fallback.
// Adding a new metal requires no code change — just seed it in the DB via admin.
const METAL_TAB_ORDER = ["Gold 24K", "Gold 22K", "Silver"];

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast.show) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast.show, onClose]);

  if (!toast.show) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold ${
      toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
    }`}>
      {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.message}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
};

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

const DeleteDialog = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
      <h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 mb-5">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors">
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── Reusable Rate Input ──────────────────────────────────────────────────────

const RateInput = ({ value, onChange, colorClass = "" }) => (
  <input
    type="number"
    min="0"
    step="1"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`w-full text-right text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 font-mono ${colorClass}`}
  />
);

// ─── Labour Charges Admin (Metal → Category → Size tree) ─────────────────────
// This is the SOLE rate-management surface for the Estimate module.
// The legacy "OB Rates" section was removed as part of the Estimate refactor.

const EMPTY_ROW = {
  size_label: "",
  size_value: "",
  lc_pp_retail: "",
  lc_pp_showroom: "",
  lc_pp_wholesale: "",
};

// Inline form to add a size row to a given category
const AddSizeRowForm = ({ metalType, category, onAdd, onCancel, adding }) => {
  const [form, setForm] = useState(EMPTY_ROW);
  const [error, setError] = useState("");

  const set = (field, value) => { setForm((p) => ({ ...p, [field]: value })); setError(""); };

  const handle = () => {
    if (!form.size_label.trim()) return setError("Size label is required");
    if (form.lc_pp_retail === "" && form.lc_pp_showroom === "" && form.lc_pp_wholesale === "") {
      return setError("Enter at least one rate");
    }
    onAdd({
      metal_type:      metalType,
      category,
      size_label:      form.size_label.trim(),
      size_value:      form.size_value !== "" ? form.size_value : null,
      lc_pp_retail:    parseFloat(form.lc_pp_retail)    || 0,
      lc_pp_showroom:  parseFloat(form.lc_pp_showroom)  || 0,
      lc_pp_wholesale: parseFloat(form.lc_pp_wholesale) || 0,
    });
  };

  return (
    <tr className="bg-indigo-50 border-b border-indigo-200">
      <td className="px-3 py-2">
        <input
          type="text"
          value={form.size_label}
          onChange={(e) => set("size_label", e.target.value)}
          placeholder="e.g. 3g"
          autoFocus
          className="w-full text-sm px-2 py-1.5 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          step="0.001"
          value={form.size_value}
          onChange={(e) => set("size_value", e.target.value)}
          placeholder="g/pc (opt.)"
          className="w-full text-sm px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </td>
      {["lc_pp_retail", "lc_pp_showroom", "lc_pp_wholesale"].map((f) => (
        <td key={f} className="px-3 py-2">
          <RateInput
            value={form[f]}
            onChange={(v) => set(f, v)}
            colorClass="border-indigo-200 focus:ring-indigo-300"
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button onClick={handle} disabled={adding} title="Add"
            className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors">
            <Check size={14} />
          </button>
          <button onClick={onCancel} title="Cancel"
            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors">
            <X size={14} />
          </button>
        </div>
        {error && <p className="text-red-500 text-[10px] mt-1 font-semibold">{error}</p>}
      </td>
    </tr>
  );
};

// Modal for adding a whole new category under a metal type
const AddCategoryModal = ({ metalType, onAdd, onCancel, adding }) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-black text-slate-800 mb-2">New Category for {metalType}</h3>
        <p className="text-sm text-slate-500 mb-4">Categories group sizes (e.g. Bar, C|B, Colour for Silver).</p>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Category name"
          autoFocus
          className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-1"
        />
        {error && <p className="text-red-500 text-xs font-semibold mb-2">{error}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return setError("Category name is required");
              onAdd(name.trim());
            }}
            disabled={adding}
            className="flex-1 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl">
            {adding ? "Adding…" : "Add Category"}
          </button>
        </div>
      </div>
    </div>
  );
};

// One category sub-panel within a metal panel: expandable, size rows with 3-tier rates
const CategoryPanel = ({ metalType, category, rows, edits, setEdit, onAddRow, onDeleteRow, openKey, setOpenKey, pendingAdd, setPendingAdd, adding }) => {
  const key = `${metalType}::${category}`;
  const open = openKey === key;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpenKey(open ? null : key)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          open ? "bg-indigo-50" : "bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={18} className="text-indigo-600" /> : <ChevronRight size={18} className="text-slate-400" />}
          <span className="font-black text-slate-800 text-sm">{category}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
            {rows.length} {rows.length === 1 ? "size" : "sizes"}
          </span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 font-black text-slate-600 text-xs uppercase tracking-wider w-32">Size</th>
                <th className="text-right px-4 py-2.5 font-black text-slate-600 text-xs uppercase tracking-wider w-24">g / pc</th>
                <th className="text-right px-4 py-2.5 font-black text-slate-500 text-xs uppercase tracking-wider">Retail (₹/pc)</th>
                <th className="text-right px-4 py-2.5 font-black text-purple-600 text-xs uppercase tracking-wider">Showroom (₹/pc)</th>
                <th className="text-right px-4 py-2.5 font-black text-blue-600 text-xs uppercase tracking-wider">Wholesale (₹/pc)</th>
                <th className="w-14 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && pendingAdd !== key && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400 text-sm">
                    No sizes yet. Use "Add Size" below.
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => {
                const e = edits[r.id] || {};
                const isDirty =
                  parseFloat(e.lc_pp_retail)    !== (r.lc_pp_retail    || 0) ||
                  parseFloat(e.lc_pp_showroom)  !== (r.lc_pp_showroom  || 0) ||
                  parseFloat(e.lc_pp_wholesale) !== (r.lc_pp_wholesale || 0);
                return (
                  <tr key={r.id}
                    className={`border-b border-slate-100 ${isDirty ? "bg-amber-50/40" : idx % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                    <td className="px-4 py-2">
                      <span className="font-bold text-slate-800">{r.size_label}</span>
                      {isDirty && (
                        <span className="ml-1.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase">
                          edited
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500 text-xs">
                      {r.size_value != null ? r.size_value : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <RateInput value={e.lc_pp_retail ?? ""} onChange={(v) => setEdit(r.id, "lc_pp_retail", v)}
                        colorClass="border-slate-200 focus:ring-slate-300" />
                    </td>
                    <td className="px-3 py-2">
                      <RateInput value={e.lc_pp_showroom ?? ""} onChange={(v) => setEdit(r.id, "lc_pp_showroom", v)}
                        colorClass="border-purple-200 focus:ring-purple-300" />
                    </td>
                    <td className="px-3 py-2">
                      <RateInput value={e.lc_pp_wholesale ?? ""} onChange={(v) => setEdit(r.id, "lc_pp_wholesale", v)}
                        colorClass="border-blue-200 focus:ring-blue-300" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => onDeleteRow(r)} title="Delete size"
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendingAdd === key && (
                <AddSizeRowForm
                  metalType={metalType}
                  category={category}
                  onAdd={onAddRow}
                  onCancel={() => setPendingAdd(null)}
                  adding={adding}
                />
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <button
              onClick={() => setPendingAdd(pendingAdd === key ? null : key)}
              className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={13} /> Add Size
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LabourChargesAdmin = ({ showToast }) => {
  const [rows, setRows]                     = useState([]);
  const [loading, setLoading]               = useState(false);
  const [edits, setEdits]                   = useState({});
  const [metalTab, setMetalTab]             = useState("Gold 24K");
  const [openCategory, setOpenCategory]     = useState(null);
  const [pendingAdd, setPendingAdd]         = useState(null);
  const [addCatModal, setAddCatModal]       = useState(null);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [saving, setSaving]                 = useState(false);
  const [addingRow, setAddingRow]           = useState(false);
  const [addingCat, setAddingCat]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLabourCharges();
      setRows(data);
      const map = {};
      data.forEach((r) => {
        map[r.id] = {
          lc_pp_retail:    r.lc_pp_retail    != null ? String(r.lc_pp_retail)    : "0",
          lc_pp_showroom:  r.lc_pp_showroom  != null ? String(r.lc_pp_showroom)  : "0",
          lc_pp_wholesale: r.lc_pp_wholesale != null ? String(r.lc_pp_wholesale) : "0",
        };
      });
      setEdits(map);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to load labour charges", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const setEdit = (id, field, value) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const metalTypes = useMemo(() => {
    const inData = Array.from(new Set(rows.map((r) => r.metal_type)));
    const ordered = METAL_TAB_ORDER.filter((m) => inData.includes(m));
    const extras = inData.filter((m) => !METAL_TAB_ORDER.includes(m));
    return [...ordered, ...extras];
  }, [rows]);

  const tabMetals = useMemo(() => {
    const set = new Set([...metalTypes, ...METAL_TAB_ORDER]);
    const list = Array.from(set);
    const ordered = METAL_TAB_ORDER.filter((m) => list.includes(m));
    const extras = list.filter((m) => !METAL_TAB_ORDER.includes(m));
    return [...ordered, ...extras];
  }, [metalTypes]);

  const activeTab = tabMetals.includes(metalTab) ? metalTab : (tabMetals[0] ?? "Gold 24K");

  const categoriesForActive = useMemo(() => {
    const grouped = {};
    rows.filter((r) => r.metal_type === activeTab)
        .forEach((r) => {
          if (!grouped[r.category]) grouped[r.category] = [];
          grouped[r.category].push(r);
        });
    Object.values(grouped).forEach((arr) => arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return grouped;
  }, [rows, activeTab]);

  const hasUnsaved = useMemo(() => rows.some((r) => {
    const e = edits[r.id];
    if (!e) return false;
    return (
      parseFloat(e.lc_pp_retail)    !== (r.lc_pp_retail    || 0) ||
      parseFloat(e.lc_pp_showroom)  !== (r.lc_pp_showroom  || 0) ||
      parseFloat(e.lc_pp_wholesale) !== (r.lc_pp_wholesale || 0)
    );
  }), [rows, edits]);

  const handleSaveAll = async () => {
    const updates = rows
      .filter((r) => {
        const e = edits[r.id];
        if (!e) return false;
        return (
          parseFloat(e.lc_pp_retail)    !== (r.lc_pp_retail    || 0) ||
          parseFloat(e.lc_pp_showroom)  !== (r.lc_pp_showroom  || 0) ||
          parseFloat(e.lc_pp_wholesale) !== (r.lc_pp_wholesale || 0)
        );
      })
      .map((r) => ({
        id: r.id,
        lc_pp_retail:    parseFloat(edits[r.id].lc_pp_retail)    || 0,
        lc_pp_showroom:  parseFloat(edits[r.id].lc_pp_showroom)  || 0,
        lc_pp_wholesale: parseFloat(edits[r.id].lc_pp_wholesale) || 0,
      }));
    if (updates.length === 0) return;
    setSaving(true);
    try {
      await bulkUpdateLabourCharges(updates);
      showToast(`${updates.length} rate${updates.length === 1 ? "" : "s"} saved`);
      await load();
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = async (data) => {
    setAddingRow(true);
    try {
      await createLabourCharge(data);
      showToast(`Size "${data.size_label}" added`);
      setPendingAdd(null);
      await load();
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to add size", "error");
    } finally {
      setAddingRow(false);
    }
  };

  const handleAddCategory = async (categoryName) => {
    setAddingCat(true);
    try {
      await createLabourCharge({
        metal_type: addCatModal,
        category: categoryName,
        size_label: "New Size",
        size_value: null,
        lc_pp_retail: 0,
        lc_pp_showroom: 0,
        lc_pp_wholesale: 0,
      });
      showToast(`Category "${categoryName}" added`);
      setAddCatModal(null);
      setOpenCategory(`${addCatModal}::${categoryName}`);
      await load();
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to add category", "error");
    } finally {
      setAddingCat(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLabourCharge(deleteTarget.id);
      showToast(`"${deleteTarget.size_label}" deleted`);
      setDeleteTarget(null);
      await load();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const categoryList = Object.keys(categoriesForActive);

  return (
    <>
      {deleteTarget && (
        <DeleteDialog
          title="Delete Size?"
          message={`Remove ${deleteTarget.size_label} from ${deleteTarget.metal_type} / ${deleteTarget.category}? This won't affect existing bills.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {addCatModal && (
        <AddCategoryModal
          metalType={addCatModal}
          onAdd={handleAddCategory}
          onCancel={() => setAddCatModal(null)}
          adding={addingCat}
        />
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <Gem size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold">Labour Charges:</span> Hierarchy is Metal &rarr; Category &rarr; Size.
          Rates are applied per piece based on customer type (Retail / Showroom / Wholesale) at billing.
          Add new metals, categories or sizes here &mdash; no code change needed.
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex gap-2 border-b border-slate-200 flex-wrap">
            {tabMetals.map((mt) => {
              const count = rows.filter((r) => r.metal_type === mt).length;
              return (
                <button
                  key={mt}
                  onClick={() => { setMetalTab(mt); setOpenCategory(null); setPendingAdd(null); }}
                  className={`px-5 py-2.5 text-sm font-bold rounded-t-xl border border-b-0 transition-colors relative -mb-px ${
                    activeTab === mt
                      ? "bg-white border-slate-200 text-indigo-700 z-10"
                      : "bg-slate-50 border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {mt}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === mt ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {categoryList.length === 0 ? (
              <div className="text-center py-14 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="text-4xl mb-2">No categories</p>
                <p className="font-bold">No categories for {activeTab}</p>
                <p className="text-xs mt-1">Add a category to start adding sizes.</p>
              </div>
            ) : (
              categoryList.map((cat) => (
                <CategoryPanel
                  key={`${activeTab}::${cat}`}
                  metalType={activeTab}
                  category={cat}
                  rows={categoriesForActive[cat]}
                  edits={edits}
                  setEdit={setEdit}
                  onAddRow={handleAddRow}
                  onDeleteRow={setDeleteTarget}
                  openKey={openCategory}
                  setOpenKey={setOpenCategory}
                  pendingAdd={pendingAdd}
                  setPendingAdd={setPendingAdd}
                  adding={addingRow}
                />
              ))
            )}

            <button
              onClick={() => setAddCatModal(activeTab)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-xl text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <FolderPlus size={16} /> Add Category to {activeTab}
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur py-3 border-t border-slate-200">
            {hasUnsaved && <span className="text-xs font-semibold text-amber-600">Unsaved rate changes</span>}
            <button
              onClick={handleSaveAll}
              disabled={saving || !hasUnsaved}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm px-5 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save All Rate Changes"}
            </button>
          </div>
        </>
      )}
    </>
  );
};

// ─── Page wrapper ─────────────────────────────────────────────────────────────
// The former "Order Bill Rates" toggle was removed — the Labour Charges tree is
// now the single source of truth for Estimate rates.

export default function SellingAdmin() {
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = useCallback((message, type = "success") =>
    setToast({ show: true, message, type }), []);

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Admin Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure labour charges used in Estimates</p>
        </div>
      </div>

      <LabourChargesAdmin showToast={showToast} />
    </div>
  );
}
