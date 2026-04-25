import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Coins, Landmark, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { createCustomerLedgerEntry, getCustomerLedger, getCustomers } from "../api/customerService";
import Toast from "../components/Toast";
import { useSellingSync } from "../context/SellingSyncContext";

const fmtMoney = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const EMPTY_FORM = {
  entry_date: new Date().toISOString().split("T")[0],
  transaction_type: "Payment",
  payment_mode: "Cash",
  amount: "",
  adjustment_direction: "credit",
  reference_no: "",
  notes: "",
};

const SellingLedger = () => {
  const { versions, markDirty } = useSellingSync();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entryForm, setEntryForm] = useState(EMPTY_FORM);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const result = await getCustomers(searchQuery);
      const rows = result?.data || [];
      setCustomers(rows);
      setSelectedCustomerId((current) => current || rows[0]?.id || null);
    } catch (error) {
      showToast(error?.message || "Failed to load customers", "error");
    } finally {
      setLoadingCustomers(false);
    }
  }, [searchQuery, showToast]);

  const fetchLedger = useCallback(async (customerId) => {
    if (!customerId) {
      setLedgerData(null);
      return;
    }

    setLoadingLedger(true);
    try {
      const result = await getCustomerLedger(customerId);
      setLedgerData(result?.data || result);
    } catch (error) {
      showToast(error?.message || "Failed to load ledger", "error");
    } finally {
      setLoadingLedger(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers, versions.customers, versions.ledger]);

  useEffect(() => {
    fetchLedger(selectedCustomerId);
  }, [fetchLedger, selectedCustomerId, versions.ledger]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || ledgerData?.customer || null,
    [customers, ledgerData, selectedCustomerId]
  );

  const statement = ledgerData?.statement || [];
  const summary = ledgerData?.ledger_summary || {
    total_payable: 0,
    total_paid: 0,
    remaining_balance: 0,
  };

  const handleCreateEntry = async (event) => {
    event.preventDefault();
    if (!selectedCustomerId) return;

    setSubmitting(true);
    try {
      await createCustomerLedgerEntry(selectedCustomerId, entryForm);
      showToast(`${entryForm.transaction_type} recorded`);
      setEntryForm({
        ...EMPTY_FORM,
        entry_date: entryForm.entry_date || EMPTY_FORM.entry_date,
      });
      setShowEntryForm(false);
      markDirty(["ledger", "customers", "dashboard"]);
      await fetchLedger(selectedCustomerId);
    } catch (error) {
      showToast(error?.message || "Failed to record ledger entry", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <BookOpen className="text-white" size={20} />
            </div>
            Customer Ledger
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-[52px]">
            Professional customer-wise statements with real-time balances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchCustomers();
              fetchLedger(selectedCustomerId);
            }}
            className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowEntryForm((current) => !current)}
            disabled={!selectedCustomerId}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Plus size={14} /> Add Entry
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search customer"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Customers</p>
            </div>
            <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100">
              {loadingCustomers ? (
                <div className="p-6 text-sm text-slate-500 text-center">Loading customers...</div>
              ) : customers.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">No customers found.</div>
              ) : (
                customers.map((customer) => {
                  const active = customer.id === selectedCustomerId;
                  return (
                    <button
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        active ? "bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{customer.party_name}</p>
                          <p className="text-xs text-slate-500 truncate">{customer.phone_no || "No phone"}</p>
                        </div>
                        <span className={`text-[11px] font-black px-2 py-1 rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {fmtMoney(customer.outstanding_balance || 0)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Landmark size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Total Payable</p>
                  <p className="text-xl font-black text-slate-800">{fmtMoney(summary.total_payable)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Coins size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Total Paid</p>
                  <p className="text-xl font-black text-slate-800">{fmtMoney(summary.total_paid)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Wallet size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Outstanding</p>
                  <p className="text-xl font-black text-slate-800">{fmtMoney(summary.remaining_balance)}</p>
                </div>
              </div>
            </div>
          </div>

          {showEntryForm && selectedCustomer && (
            <form onSubmit={handleCreateEntry} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-800">New Ledger Entry</h2>
                  <p className="text-xs text-slate-500 mt-1">Record a payment or accounting adjustment for {selectedCustomer.party_name}.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Transaction Date</label>
                  <input
                    type="date"
                    value={entryForm.entry_date}
                    onChange={(event) => setEntryForm((current) => ({ ...current, entry_date: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Transaction Type</label>
                  <select
                    value={entryForm.transaction_type}
                    onChange={(event) => setEntryForm((current) => ({ ...current, transaction_type: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option value="Payment">Payment</option>
                    <option value="Adjustment">Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entryForm.amount}
                    onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    {entryForm.transaction_type === "Payment" ? "Payment Mode" : "Adjustment Type"}
                  </label>
                  {entryForm.transaction_type === "Payment" ? (
                    <select
                      value={entryForm.payment_mode}
                      onChange={(event) => setEntryForm((current) => ({ ...current, payment_mode: event.target.value }))}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online">Online</option>
                    </select>
                  ) : (
                    <select
                      value={entryForm.adjustment_direction}
                      onChange={(event) => setEntryForm((current) => ({ ...current, adjustment_direction: event.target.value }))}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    >
                      <option value="credit">Credit Adjustment</option>
                      <option value="debit">Debit Adjustment</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Reference ID</label>
                  <input
                    type="text"
                    value={entryForm.reference_no}
                    onChange={(event) => setEntryForm((current) => ({ ...current, reference_no: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="Receipt / note no."
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                  <input
                    type="text"
                    value={entryForm.notes}
                    onChange={(event) => setEntryForm((current) => ({ ...current, notes: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="Optional note"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEntryForm(false)}
                  className="px-4 py-2.5 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:bg-emerald-300"
                >
                  {submitting ? "Saving..." : "Save Entry"}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-black text-slate-800">{selectedCustomer?.party_name || "Select a customer"}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {selectedCustomer ? `${selectedCustomer.phone_no || "No phone"} • ${selectedCustomer.customer_type || "Retail"}` : "Choose a customer to view the full ledger statement."}
              </p>
            </div>

            {loadingLedger ? (
              <div className="p-10 text-center text-sm text-slate-500">Loading ledger statement...</div>
            ) : !selectedCustomer ? (
              <div className="p-10 text-center text-sm text-slate-500">No customer selected.</div>
            ) : statement.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No ledger activity recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="text-left px-5 py-3 font-black">Date</th>
                      <th className="text-left px-5 py-3 font-black">Type</th>
                      <th className="text-left px-5 py-3 font-black">Reference</th>
                      <th className="text-right px-5 py-3 font-black">Debit</th>
                      <th className="text-right px-5 py-3 font-black">Credit</th>
                      <th className="text-right px-5 py-3 font-black">Running Balance</th>
                      <th className="text-left px-5 py-3 font-black">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="px-5 py-3 font-semibold text-slate-700">{row.transaction_date}</td>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-800">{row.transaction_type}</p>
                          {row.payment_mode ? <p className="text-xs text-slate-500">{row.payment_mode}</p> : null}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-700">{row.reference_no || "Manual Entry"}</p>
                          {row.notes ? <p className="text-xs text-slate-500 mt-1">{row.notes}</p> : null}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-800">{row.debit_amount ? fmtMoney(row.debit_amount) : "-"}</td>
                        <td className="px-5 py-3 text-right font-mono text-emerald-700">{row.credit_amount ? fmtMoney(row.credit_amount) : "-"}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-800">{fmtMoney(row.running_balance)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black ${
                            row.payment_status === "Completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : row.payment_status === "Partial"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}>
                            {row.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellingLedger;
