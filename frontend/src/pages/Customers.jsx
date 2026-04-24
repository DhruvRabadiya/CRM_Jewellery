import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Search, Edit3, Trash2, X, Phone, Building2,
  MapPin, User, RefreshCw, ChevronRight, AlertCircle, BookOpen,
} from "lucide-react";
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerLedger,
} from "../api/customerService";
import Toast from "../components/Toast";

const EMPTY_FORM = {
  party_name: "",
  firm_name: "",
  address: "",
  city: "",
  phone_no: "",
  telephone_no: "",
  customer_type: "Retail",
};

const CUSTOMER_TYPES = ["Wholesale", "Showroom", "Retail"];

const FIELD_CONFIG = [
  { key: "party_name", label: "Party Name", placeholder: "e.g. Rajesh Shah", icon: User, required: true, type: "text" },
  { key: "firm_name", label: "Firm Name", placeholder: "e.g. Shah Jewellers", icon: Building2, required: true, type: "text" },
  { key: "address", label: "Address", placeholder: "e.g. 123 Gold Market, MG Road", icon: MapPin, required: true, type: "textarea" },
  { key: "city", label: "City", placeholder: "e.g. Mumbai", icon: MapPin, required: true, type: "text" },
  { key: "phone_no", label: "Phone No.", placeholder: "e.g. 9876543210", icon: Phone, required: true, type: "tel" },
  { key: "telephone_no", label: "Telephone No.", placeholder: "e.g. 02212345678", icon: Phone, required: false, type: "tel" },
];

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // "create" | "edit"
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [ledgerState, setLedgerState] = useState({ open: false, loading: false, data: null });

  // Expanded card for mobile
  const [expandedId, setExpandedId] = useState(null);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCustomers(searchQuery);
      if (result.success) {
        setCustomers(result.data || []);
      }
    } catch (error) {
      showToast("Failed to load customers", "error");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchCustomers]);

  // Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.party_name.trim()) errors.party_name = "Party name is required";
    if (!formData.firm_name.trim()) errors.firm_name = "Firm name is required";
    if (!formData.address.trim()) errors.address = "Address is required";
    if (!formData.city.trim()) errors.city = "City is required";
    if (!formData.phone_no.trim()) {
      errors.phone_no = "Phone number is required";
    } else {
      const cleaned = formData.phone_no.replace(/[\s\-().+]/g, "");
      if (!/^\d{10,15}$/.test(cleaned)) {
        errors.phone_no = "Phone must be 10-15 digits";
      }
    }
    if (formData.telephone_no.trim()) {
      const cleaned = formData.telephone_no.replace(/[\s\-().+]/g, "");
      if (!/^\d{10,15}$/.test(cleaned)) {
        errors.telephone_no = "Invalid telephone format";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenCreate = () => {
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setModalMode("create");
    setEditId(null);
    setShowModal(true);
  };

  const handleOpenEdit = (customer) => {
    setFormData({
      party_name: customer.party_name || "",
      firm_name: customer.firm_name || "",
      address: customer.address || "",
      city: customer.city || "",
      phone_no: customer.phone_no || "",
      telephone_no: customer.telephone_no || "",
      customer_type: customer.customer_type || "Retail",
    });
    setFormErrors({});
    setModalMode("edit");
    setEditId(customer.id);
    setShowModal(true);
  };

  const handleOpenDelete = (customer) => {
    setDeleteTarget(customer);
    setShowDeleteConfirm(true);
  };

  const handleOpenLedger = async (customer) => {
    setLedgerState({ open: true, loading: true, data: null });
    try {
      const result = await getCustomerLedger(customer.id);
      setLedgerState({ open: true, loading: false, data: result.data || result });
    } catch (error) {
      setLedgerState({ open: false, loading: false, data: null });
      showToast(error.message || "Failed to load customer ledger", "error");
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setEditId(null);
  };

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      let result;
      if (modalMode === "create") {
        result = await createCustomer(formData);
      } else {
        result = await updateCustomer(editId, formData);
      }

      if (result.success) {
        showToast(result.message, "success");
        closeModal();
        fetchCustomers();
      }
    } catch (error) {
      showToast(error.message || "Operation failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteCustomer(deleteTarget.id);
      if (result.success) {
        showToast(result.message, "success");
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
        fetchCustomers();
      }
    } catch (error) {
      showToast(error.message || "Failed to delete customer", "error");
    }
  };

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-semibold text-sm">Loading Customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 relative max-w-7xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Users className="text-white" size={20} />
            </div>
            Customers
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            {customers.length} customer{customers.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCustomers}
            className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-3 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleOpenCreate}
            id="add-customer-btn"
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6 relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          id="customer-search"
          placeholder="Search by name, firm, city, or phone..."
          className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-11 pr-4 py-3 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all placeholder:text-slate-400"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Customer list */}
      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <Users className="mx-auto text-slate-300 mb-4" size={48} strokeWidth={1.5} />
          <p className="font-bold text-slate-600 text-base">
            {searchQuery ? "No matching customers found." : "No customers yet."}
          </p>
          <p className="text-sm text-slate-400 mt-1 mb-6">
            {searchQuery ? "Try a different search term." : "Add your first customer to get started."}
          </p>
          {!searchQuery && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Plus size={16} /> Add First Customer
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_0.7fr_0.7fr_0.6fr_120px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Party Name</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Firm Name</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Address</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">City</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Phone</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Type</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Actions</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-slate-100">
            {customers.map((cust) => (
              <div key={cust.id}>
                {/* Desktop row */}
                <div
                  className="hidden md:grid grid-cols-[1fr_1fr_1fr_0.7fr_0.7fr_0.6fr_120px] gap-4 px-5 py-3.5 items-center hover:bg-emerald-50/30 transition-colors group cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <User size={14} />
                    </div>
                    <span className="font-bold text-slate-800 text-sm truncate">{cust.party_name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-600 text-sm truncate">{cust.firm_name}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium truncate" title={cust.address}>
                    {cust.address}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-600 truncate">{cust.city}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-slate-700">{cust.phone_no}</span>
                    {cust.telephone_no && (
                      <span className="text-[10px] text-slate-400 font-medium">Tel: {cust.telephone_no}</span>
                    )}
                  </div>
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      cust.customer_type === "Wholesale" ? "bg-blue-100 text-blue-700" :
                      cust.customer_type === "Showroom" ? "bg-purple-100 text-purple-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{cust.customer_type || "Retail"}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => handleOpenLedger(cust)}
                      className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg border border-slate-200 hover:border-indigo-200 transition-all active:scale-95"
                      title="Ledger"
                    >
                      <BookOpen size={13} />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(cust)}
                      className="p-2 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg border border-slate-200 hover:border-blue-200 transition-all active:scale-95"
                      title="Edit"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleOpenDelete(cust)}
                      className="p-2 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 hover:border-red-200 transition-all active:scale-95"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="md:hidden px-4 py-3">
                  <button
                    onClick={() => setExpandedId(expandedId === cust.id ? null : cust.id)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                        <User size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold text-slate-800 text-sm truncate">{cust.party_name}</p>
                        <p className="text-xs text-slate-500 font-medium truncate">{cust.firm_name} · {cust.city}</p>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-slate-400 transition-transform flex-shrink-0 ${
                        expandedId === cust.id ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                  {expandedId === cust.id && (
                    <div className="mt-3 ml-12 space-y-2 text-sm">
                      <p className="text-slate-500 flex items-center gap-2">
                        <MapPin size={12} className="text-slate-400" /> {cust.address}
                      </p>
                      <p className="text-slate-700 font-bold flex items-center gap-2">
                        <Phone size={12} className="text-slate-400" /> {cust.phone_no}
                      </p>
                      {cust.telephone_no && (
                        <p className="text-slate-500 flex items-center gap-2">
                          <Phone size={12} className="text-slate-400" /> Tel: {cust.telephone_no}
                        </p>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleOpenLedger(cust)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold text-xs py-2 rounded-lg active:scale-95 transition-all"
                        >
                          <BookOpen size={12} /> Ledger
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cust)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 border border-blue-200 font-bold text-xs py-2 rounded-lg active:scale-95 transition-all"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleOpenDelete(cust)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 border border-red-200 font-bold text-xs py-2 rounded-lg active:scale-95 transition-all"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
              {customers.length} customer{customers.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-0 max-w-lg w-full shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
            {/* Color bar */}
            <div className={`h-1.5 flex-shrink-0 ${modalMode === "create" ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-gradient-to-r from-blue-500 to-indigo-600"}`}></div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Header */}
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    modalMode === "create"
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    {modalMode === "create" ? <Plus size={20} /> : <Edit3 size={20} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">
                      {modalMode === "create" ? "Add Customer" : "Edit Customer"}
                    </h3>
                    <p className="text-slate-400 text-xs font-medium mt-0.5">
                      {modalMode === "create" ? "Register a new customer account." : "Update customer details."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4" id="customer-form">
                {FIELD_CONFIG.map((field) => {
                  const IconComp = field.icon;
                  const hasError = formErrors[field.key];
                  return (
                    <div key={field.key}>
                      <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wider">
                        <IconComp size={12} className="text-slate-400" />
                        {field.label}
                        {field.required && <span className="text-red-400">*</span>}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          className={`w-full bg-slate-50 border text-slate-800 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:ring-2 transition-all resize-none placeholder:text-slate-400 ${
                            hasError
                              ? "border-red-300 focus:ring-red-500/30 focus:border-red-400 bg-red-50/30"
                              : "border-slate-200 focus:ring-emerald-500/30 focus:border-emerald-400"
                          }`}
                          rows={2}
                          value={formData[field.key]}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                        />
                      ) : (
                        <input
                          type={field.type}
                          className={`w-full bg-slate-50 border text-slate-800 rounded-xl px-4 py-3 font-semibold text-sm focus:outline-none focus:ring-2 transition-all placeholder:text-slate-400 ${
                            hasError
                              ? "border-red-300 focus:ring-red-500/30 focus:border-red-400 bg-red-50/30"
                              : "border-slate-200 focus:ring-emerald-500/30 focus:border-emerald-400"
                          }`}
                          value={formData[field.key]}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                        />
                      )}
                      {hasError && (
                        <p className="mt-1 text-xs font-bold text-red-500 flex items-center gap-1">
                          <AlertCircle size={11} /> {hasError}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Customer Type */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wider">
                    Customer Type
                  </label>
                  <div className="flex gap-2">
                    {CUSTOMER_TYPES.map((ct) => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => handleChange("customer_type", ct)}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 transition-all ${
                          formData.customer_type === ct
                            ? ct === "Wholesale" ? "bg-blue-600 border-blue-600 text-white" : ct === "Showroom" ? "bg-purple-600 border-purple-600 text-white" : "bg-slate-700 border-slate-700 text-white"
                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >{ct}</button>
                    ))}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-1 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      modalMode === "create"
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30"
                    }`}
                  >
                    {modalMode === "create" ? <Plus size={16} /> : <Edit3 size={16} />}
                    {isSubmitting
                      ? "Saving..."
                      : modalMode === "create"
                      ? "Add Customer"
                      : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

            {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                Confirm Delete
              </h3>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete{" "}
              <span className="font-bold">{deleteTarget.party_name}</span>?
              This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;