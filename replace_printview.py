#!/usr/bin/env python3
"""
Replace PrintView component in OrderBills.jsx with new print preview design.
"""
import sys

FILE_PATH = "frontend/src/pages/OrderBills.jsx"

# Read the file
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the old PrintView component (from line 277 to closing } at line 462)
old_start = "const PrintView = ({ bill, onClose }) => {"
old_end = "};\n\n// --- Modal state ---"

# Find the exact boundaries
start_idx = content.find(old_start)
if start_idx == -1:
    print("ERROR: Could not find start of PrintView")
    sys.exit(1)

# Find the closing }; before // --- Modal state ---
modal_comment_idx = content.find("// --- Modal state ---")
if modal_comment_idx == -1:
    print("ERROR: Could not find end marker")
    sys.exit(1)

# Search backwards from modal_comment_idx to find the closing };
search_from = modal_comment_idx
closing_brace_idx = content.rfind("};\n", 0, search_from)
if closing_brace_idx == -1:
    print("ERROR: Could not find closing brace")
    sys.exit(1)

# The old component spans from start_idx to closing_brace_idx + 3 (including };\n)
old_component = content[start_idx:closing_brace_idx + 3]

# New PrintView component
new_component = '''const PrintView = ({ bill, onClose }) => {
  const items   = bill.items || [];
  const products = parseProducts(bill.products);
  const paymentEntries = normalizePaymentEntries(bill.payment_entries || [], bill);
  const summary = computeEstimateBalance(items, paymentEntries, bill.discount, extractSettlementRates(bill));
  const isRetail = (bill.customer_type || "Retail").toLowerCase() === "retail";

  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }
          body * { visibility: hidden; }
          #estimate-print-area, #estimate-print-area * { visibility: visible; }
          #estimate-print-area { position: fixed; top: 0; left: 0; width: 100%; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Preview backdrop */}
      <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4">
        {/* Toolbar */}
        <div className="absolute top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center no-print print:hidden">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h2 className="text-sm font-bold text-slate-700">Est. Bill #{bill.ob_no}</h2>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        </div>

        {/* Paper card */}
        <div className="bg-white rounded-lg shadow-2xl max-w-[680px] max-h-[90vh] overflow-y-auto mt-12">
          <div id="estimate-print-area" className="p-8">
            {/* Header */}
            <div className="text-center border-b border-slate-300 pb-4 mb-5">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">JEWELLERY WORKS</h1>
              <p className="text-xs text-slate-500 mt-1">Est. Jewellery Order Estimate</p>
              <div className="h-px bg-slate-200 mt-3" />
            </div>

            {/* Bill meta row */}
            <div className="grid grid-cols-2 gap-6 text-xs mb-6">
              <div className="space-y-1.5">
                <p><span className="font-bold text-slate-700">Estimate No.:</span> #{bill.ob_no}</p>
                <p><span className="font-bold text-slate-700">Date:</span> {fmtDate(bill.date)}</p>
                <p><span className="font-bold text-slate-700">Metal:</span> {products.join(", ")}</p>
                {bill.product ? <p><span className="font-bold text-slate-700">Product:</span> {bill.product}</p> : null}
              </div>
              <div className="text-right space-y-1.5">
                <p className="font-black text-slate-800 text-sm">{bill.customer_name || "Walk-in Customer"}</p>
                {bill.customer_phone   ? <p className="text-slate-600">{bill.customer_phone}</p>   : null}
                {bill.customer_address ? <p className="text-slate-600">{bill.customer_address}</p> : null}
                <span className="inline-block bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded">
                  {bill.customer_type || "Retail"}
                </span>
              </div>
            </div>

            {/* Items per metal */}
            {products.map((metalType) => {
              const metalItems = items.filter((item) => (item.metal_type || "Gold 24K") === metalType);
              if (!metalItems.length) return null;
              const categories = [...new Set(metalItems.map((item) => item.category || "Standard"))];
              return (
                <div key={metalType} className="mb-4">
                  <h3 className="font-black text-slate-700 text-xs mb-2 uppercase tracking-wider bg-slate-100 px-2 py-1">
                    {metalType}
                  </h3>
                  {categories.map((category) => {
                    const catItems = metalItems.filter((item) => (item.category || "Standard") === category);
                    return (
                      <div key={`${metalType}-${category}`} className="mb-2.5">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{category}</p>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 border border-slate-300">
                              <th className="border border-slate-300 px-2 py-1 text-left font-black text-slate-700">Size</th>
                              <th className="border border-slate-300 px-2 py-1 text-center font-black text-slate-700">Pcs</th>
                              <th className="border border-slate-300 px-2 py-1 text-right font-black text-slate-700">Weight (g)</th>
                              {!isRetail && (
                                <>
                                  <th className="border border-slate-300 px-2 py-1 text-right font-black text-slate-700">LC/pc</th>
                                  <th className="border border-slate-300 px-2 py-1 text-right font-black text-slate-700">Labour</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {catItems.map((item) => {
                              const pcs    = parseInt(item.pcs, 10) || 0;
                              const weight = (parseFloat(item.size_value) || 0) * pcs;
                              const lc     = (parseFloat(item.lc_pp) || 0) * pcs;
                              return (
                                <tr
                                  key={itemKey(item.metal_type, item.category, item.size_label)}
                                  className="border border-slate-300 even:bg-slate-50"
                                >
                                  <td className="border border-slate-300 px-2 py-1 text-slate-700">{item.size_label}</td>
                                  <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-700">{pcs}</td>
                                  <td className="border border-slate-300 px-2 py-1 text-right text-slate-700">{fmt(weight, 4)}</td>
                                  {!isRetail && (
                                    <>
                                      <td className="border border-slate-300 px-2 py-1 text-right text-slate-700">{fmt(item.lc_pp, 0)}</td>
                                      <td className="border border-slate-300 px-2 py-1 text-right font-semibold text-slate-700">{fmt(lc, 0)}</td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Summary box */}
            <div className="ml-auto w-64 text-xs space-y-1 border border-slate-300 p-3 mt-5">
              {[
                ["Total Pcs",    String(summary.totalPcs)],
                ["Total Weight", `${fmt(summary.totalWeight, 4)}g`],
                ...(!isRetail ? [["Labour Total", fmtMoney(summary.labourTotal)]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-bold text-slate-700">{value}</span>
                </div>
              ))}
              {Object.entries(summary.requiredMetal || {}).map(([mt, required]) => {
                if ((required || 0) === 0 && (summary.metalReceived?.[mt] || 0) === 0) return null;
                return (
                  <div key={mt} className="py-0.5 border-b border-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-600">{mt} Needed</span>
                      <span className="font-bold text-slate-700">{fmt(required || 0, 4)}g</span>
                    </div>
                    {(summary.metalReceived?.[mt] || 0) > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>{mt} Received</span>
                        <span className="font-bold">{fmt(summary.metalReceived?.[mt] || 0, 4)}g</span>
                      </div>
                    )}
                    {(summary.metalDueUnsettled?.[mt] || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">{mt} Still Owed</span>
                        <span className="font-bold text-rose-600">{fmt(summary.metalDueUnsettled?.[mt] || 0, 4)}g</span>
                      </div>
                    )}
                    {(summary.metalShortfallSettled?.[mt] || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 italic text-xs">&#8627; Paid in Cash</span>
                        <span className="font-bold text-amber-600">{fmt(summary.metalShortfallSettled?.[mt], 4)}g</span>
                      </div>
                    )}
                    {(summary.metalCredit?.[mt] || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">{mt} Extra Metal</span>
                        <span className="font-bold text-emerald-600">{fmt(summary.metalCredit?.[mt] || 0, 4)}g</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-between py-0.5 border-b border-slate-200">
                <span className="text-slate-600">Money Received</span>
                <span className="font-bold text-slate-700">{fmtMoney(summary.moneyPaid)}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-300">
                <span className="text-slate-600">Final Payable</span>
                <span className="font-bold text-slate-700">{fmtMoney(summary.totalAmount || 0)}</span>
              </div>
              {summary.discount > 0 && (
                <div className="flex justify-between py-0.5 border-b border-slate-200 text-emerald-600">
                  <span className="font-semibold">Discount</span>
                  <span className="font-bold">- {fmtMoney(summary.discount)}</span>
                </div>
              )}
              {summary.amountGiven > 0 ? (
                <div className="flex justify-between py-1 font-black text-sm text-amber-600">
                  <span>Return to Customer</span>
                  <span>{fmtMoney(summary.amountGiven)}</span>
                </div>
              ) : summary.refundDue > 0 ? (
                <div className="flex justify-between py-1 font-black text-sm text-emerald-600">
                  <span>Cash Refund</span>
                  <span>{fmtMoney(summary.refundDue)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-0.5 border-b border-slate-300 font-black text-sm">
                    <span>Cash Remaining</span>
                    <span>{fmtMoney(summary.amountDue)}</span>
                  </div>
                  {Object.values(summary.metalDueUnsettled || {}).some((v) => v > 0) && (
                    <div className="flex justify-between py-0.5 font-semibold text-xs">
                      <span className="text-slate-600">Metal Still Owed</span>
                      <span className="text-rose-600">See above</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 border-t border-slate-300 pt-4">
              <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                <div className="border-b border-slate-400">
                  <p className="text-slate-600 mb-1">Customer Signature: _______________</p>
                </div>
                <div className="text-right border-b border-slate-400">
                  <p className="text-slate-600 mb-1">Date: __________</p>
                </div>
              </div>
              <p className="text-center text-xs text-slate-400 italic">
                This is a computer-generated estimate.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
'''

# Replace the component
new_content = content[:start_idx] + new_component + content[closing_brace_idx + 3:]

# Write the file back
with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✓ PrintView component replaced successfully")
print(f"  Old component: {len(old_component)} chars")
print(f"  New component: {len(new_component)} chars")
