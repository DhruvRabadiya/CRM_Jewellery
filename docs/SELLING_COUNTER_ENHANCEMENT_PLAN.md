# Selling Counter Enhancement — Implementation Plan

**Branch:** `feature/selling-counter-billing-ledger`
**Author:** Claude
**Date:** 2026-04-23
**Status:** Draft — awaiting review

---

## 1. Executive Summary

The codebase already implements **most** of what this brief requests. The `order_bills`
table is a near-perfect mirror of the Excel "Sample Bill Format" sheet, and the
`selling_bills` table already supports multi-metal exchange, mixed cash/online payments,
customer-wise ledger (`customer_ledger_entries`), counter cash tracking
(`counter_cash_ledger`), and a dashboard service (`sellingDashboardService.js`).

**The real work is closing five gaps, not building from scratch.** The biggest
decision to make up front is whether the bill the user sees in "Selling Counter →
Order Bills Tab" is the existing `order_bills` entity (which matches the Excel
exactly but has no customer FK, payments, or ledger) or the existing `selling_bills`
entity (which has payments + ledger but a different Excel layout). See §3.

---

## 2. Verified Excel Semantics (Source of Truth)

Bill format sheet `Sample Bill Format` drives all billing math. All values below are
confirmed against the cell formulas in the uploaded workbook.

### 2.1 Per-item row (rows 8–21)

| Column | Meaning | Formula |
|--------|---------|---------|
| A | SIZE (unit weight grams) | user input |
| B | PCS (pieces) | user input |
| C | Weight | `= A × B` |
| D | LC P.P (labour charge per piece) | auto-fetched from Labour Charges sheet |
| E | T. LC (total labour for row) | `= D × B` |

### 2.2 Summary rows (22–27)

| Field | Formula | Excel cell |
|-------|---------|-----------|
| TOTAL pieces | `SUM(B8:B21)` | B22 |
| TOTAL weight | `SUM(C8:C21)` | C22 |
| Labour Total | `SUM(E8:E21)` | E22 |
| T. Weight | `SUM(C8:C21)` *(same as above)* | B23 |
| F. JAMA | user input (metal deposit given by customer) | B24 |
| FINE +/- | `T.Weight − F.JAMA` | C24 |
| 10g RATE | user input (current 10 g gold rate) | B25 |
| Gold value raw | `FINE +/- × 10g RATE ÷ 10` | C25 |
| **Gold RS.** | `ROUND(C25, −1)` → round to nearest ₹10 | E24 |
| **Subtotal** | `Labour Total + Gold RS.` | E25 |
| AMT JAMA | user input (cash paid) | B26 |
| **AMT BAKI** | `Subtotal − AMT JAMA` | B27 |
| OF.G status | `IF(Gold RS ≤ 0 AND FINE +/- > 0, "OF.G AFSL", "OF.G HDF")` | C27 |

**"OF.G AFSL"** = "Out of Fine Gold — Against Future Settlement / Loan" (i.e., the
shop owes fine gold back to the customer). **"OF.G HDF"** = the settlement is cash.

### 2.3 Labour Charges sheet (three tables side-by-side)

- **Gold 24K** — sizes 0.05 g, 0.1 g, 0.25 g, 0.5 g, 1 g, 2 g, 5 g, 10 g, 20 g, 25 g, 50 g, 100 g — Retail / Showroom / Wholesale columns.
- **Silver** — sizes "1g-Bar", "2g-bar", "5g-C|B", "10g-C|B", "10g Colour", "20g Colour", "50g Colour", "20g-C|B", "25g-C|B", "50g-C|B", "100g-C|B", "200g Bar", "500g-Bar" — size is a text label encoding category, not a pure number.
- **Gold 22K** — same sizes as Gold 24K.

**Key Excel insight:** Silver sizes are *categorical* (Bar / C|B / Colour) rather
than pure numeric. The current `labour_charges` table handles this correctly with
the `(metal_type, category, size_label)` triple.

---

## 3. Critical Decision Point — Which Bill Table?

**The brief says:** "Bills are created inside: Selling Counter → Order Bills Tab."

Two tables could back this:

| | `order_bills` | `selling_bills` |
|---|---|---|
| Matches Excel "ESTIMATE" layout | ✅ identical fields (fine_jama, rate_10g, gold_rs, amt_baki, ofg_status, fine_carry) | ❌ different structure (rates, discount, metal_payments) |
| Customer FK | ❌ free-text only | ✅ `customer_id` |
| Multi-metal payments (exchange) | ❌ no | ✅ `selling_bill_metal_payments` |
| Mixed cash/online | ❌ single `amt_jama` | ✅ `cash_amount` + `online_amount` |
| Writes to `customer_ledger_entries` | ❌ no | ✅ yes |
| Writes to `counter_cash_ledger` | ❌ no | ✅ yes |
| Deducts `counter_inventory` on save | ❌ no | ✅ yes |

**Recommendation: Enhance `order_bills`** (Option A). The Excel layout is the source of
truth, and `order_bills` already matches it field-for-field. The gap is plumbing:
add customer FK, payment split, and ledger writes. `selling_bills` should be kept
as-is for quick-sale receipts or migrated away from in a later phase.

Alternative Option B: migrate `order_bills` fields into `selling_bills` and delete
`order_bills`. Much more work, much more risk.

Alternative Option C: keep both — `order_bills` for job-work estimates, `selling_bills`
for retail counter sales. Clarify UX so users know which to create.

**→ This plan assumes Option A unless you say otherwise.**

---

## 4. Gap Analysis (Option A)

Legend: ✅ done · ❗ needs work · ➕ new build

| Area | Status | Notes |
|---|---|---|
| Bill table + line items schema | ✅ | `order_bills` + `order_bill_items` |
| Excel formula correctness | ✅ | `_computeSummary()` in `orderBillService.js` matches all Excel formulas |
| Multi-metal support (items from multiple metals in one bill) | ✅ | `products` JSON array + per-item `metal_type` |
| Customer type selector (Retail/Showroom/Wholesale) | ✅ | `customer_type` column |
| Labour charges auto-fetch by metal × customer_type × size | ✅ | `ob_labour_rates` + `getLcPpFromRow` in `OrderBills.jsx` |
| Admin panel to edit labour charges (tiered) | ✅ | `SellingAdmin.jsx` + `labourChargeService` |
| Counter inventory view | ✅ | `SellingCounter.jsx` |
| Dashboard: metal inventory + cash | ✅ | `sellingDashboardService.js` — but sources from `selling_bills`, not `order_bills` (see §5.5) |
| **Customer search & link (FK)** | ❗ | `order_bills` has free-text customer fields only; needs `customer_id` FK + picker UI |
| **"Add new customer" modal from bill screen** | ❗ | Does not exist — need a reusable CustomerModal component |
| **Mixed payment modes (cash + online)** | ❗ | Only `amt_jama` (single amount) — need `cash_amount`, `online_amount` |
| **Metal exchange as ledger-linked deposit** | ❗ | `fine_jama` exists as a number but doesn't post a `METAL_IN` ledger entry |
| **Ledger writes on order bill lifecycle** | ❗ | `order_bills` doesn't touch `customer_ledger_entries` or `counter_cash_ledger` |
| **Outstanding balance sync** | ❗ | `customers.outstanding_balance` not updated from order_bills |
| **Dashboard sources from order_bills** | ❗ | Dashboard only knows about `selling_bills` |
| **OF.G AFSL / HDF visible in customer ledger** | ➕ | Metal-owed-back needs to show as a negative Gold 24K running balance |

---

## 5. Implementation Plan (Phased)

Each phase is independently deployable and reviewed before moving to the next. I
stop after each phase and ask for approval.

### Phase 1 — Schema migrations (additive, non-breaking)

**File:** `backend/config/dbConfig.js` — append to the existing inline migration block.

Add to `order_bills`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `customer_id` | INTEGER NULL | NULL | FK to `customers.id` (nullable for walk-in / legacy bills) |
| `cash_amount` | DECIMAL(12,2) | 0 | Cash component of `amt_jama` |
| `online_amount` | DECIMAL(12,2) | 0 | Online/UPI component of `amt_jama` |
| `payment_mode` | TEXT | 'Cash' | 'Cash' / 'Online' / 'Mixed' — derived from the two above |

Backfill rule (inline after ADD COLUMN): for legacy rows, set
`cash_amount = amt_jama`, `online_amount = 0`, `payment_mode = 'Cash'`.

No changes to `customers`, `customer_ledger_entries`, `counter_cash_ledger`,
`labour_charges`, `order_bill_items`, `counter_inventory` — all already-correct.

**Risk:** additive only, zero impact on existing bills.
**Rollback:** new columns are nullable with defaults, so SELECTs keep working even if
downgraded (columns ignored).

---

### Phase 2 — Backend: customer FK + payment split + ledger integration

**Files touched:**

1. `backend/src/services/orderBillService.js` — extend `createBill`, `updateBill`, `deleteBill`:
   - Accept `customer_id`, `cash_amount`, `online_amount` in payload.
   - If `customer_id` is absent but `customer_phone` is present, call `customerService.findOrCreateByPhone()` and use the returned id (same pattern `selling_bills` uses).
   - Derive `payment_mode` from the two amounts.
   - After bill insert/update, call a new private helper `_syncAccountingEntries(billId)` that:
     - Deletes existing ledger rows for this bill (reference_type = 'ORDER_BILL', reference_id = billId).
     - Inserts a `BILL_TOTAL` row in `customer_ledger_entries` with `amount_delta = subtotal`.
     - Inserts `PAYMENT_CASH` / `PAYMENT_ONLINE` rows for each non-zero payment.
     - Inserts `METAL_IN` row for `fine_jama` (weight_delta = fine_jama, metal_type = 'Gold 24K', metal_purity = 24).
     - If `ofg_status = 'OF.G AFSL'`, inserts an additional `METAL_OUT` row for `fine_carry` on the *bill's* side (shop owes gold back). New `line_type` value — see §6.2.
     - Inserts `counter_cash_ledger` rows for cash + online amounts.
     - Updates `customers.outstanding_balance` delta.
   - On `deleteBill`, removes all ledger rows and reverses the outstanding delta.
   - Wrap everything in `db.runTransaction()` exactly like `sellingBillService` does.

2. `backend/src/controllers/orderBillController.js` — pass through the new fields.

3. **No route changes** — existing `POST/PUT/DELETE /api/order-bills` stay the same.

**Test plan:**
- Create a bill with customer_id, mixed payments → verify 4 rows in `customer_ledger_entries` (BILL_TOTAL + PAYMENT_CASH + PAYMENT_ONLINE + METAL_IN) and 2 rows in `counter_cash_ledger`.
- Update the bill with different amounts → old ledger rows gone, new ones correct.
- Delete the bill → all ledger rows gone, outstanding_balance restored.
- Manual math check: run the Excel sample values (F. JAMA 50, 10g RATE 0, AMT JAMA 6000) through `_computeSummary` and assert exact match against Excel output.

---

### Phase 3 — Frontend: customer picker + new-customer modal + payment split

**Files touched:**

1. **New component** `frontend/src/components/CustomerPicker.jsx`:
   - Typeahead search (existing `/api/customers` endpoint).
   - "+ New Customer" button → opens `CustomerFormModal`.
   - Emits `{ customer_id, party_name, phone_no, city, customer_type }` on select.

2. **New component** `frontend/src/components/CustomerFormModal.jsx`:
   - Same fields as `Customers.jsx` add-customer form, extracted into a modal.
   - On save → `POST /api/customers` → resolves with the full new customer → `CustomerPicker` auto-selects it.

3. **Edit** `frontend/src/pages/OrderBills.jsx`:
   - Replace the free-text customer block with `<CustomerPicker>`.
   - Add `customer_id` state; send it in the bill payload.
   - When a customer is selected, auto-fill `customer_type` from their record (but allow override).
   - Split `AMT JAMA` input into two: `Cash` + `Online`, summed to display `amt_jama`. Show radio/toggle for payment mode ("Cash", "Online", "Mixed") that sets defaults.
   - Reuse `Customers.jsx` form styling so the modal feels native.

4. **Edit** `frontend/src/pages/Customers.jsx`:
   - Extract the existing form body into `CustomerFormModal` (DRY).

**UX rules:**
- Minimal clicks: pressing Enter in the phone field with a 10-digit number either auto-selects or opens the new-customer modal pre-filled.
- Existing customer's past F. JAMA balance shown next to the customer block (read from ledger). This is valuable for counter staff.

---

### Phase 4 — Ledger view for a single customer

**Files touched:**

1. `backend/src/services/customerService.js` — extend `getCustomerLedger(id)` to include `order_bills`-sourced ledger rows. Should already work once Phase 2 is live; verify the SQL joins all `reference_type` values (BILL_TOTAL can now come from SELLING_BILL or ORDER_BILL).

2. **New page** `frontend/src/pages/CustomerLedger.jsx` *(or extend existing Customers.jsx detail view)*:
   - Columns: Date, Bill No., Description, Metal In (g), Metal Out (g), Cash In, Cash Out, Running Balances (4 columns: Gold 24K, Gold 22K, Silver, Cash).
   - Filter by date range, metal, transaction type.
   - Print-friendly view.

**Accounting logic (critical):**

Four independent running balances per customer, computed chronologically:

```
gold24k_bal += weight_delta where metal_type='Gold 24K'
gold22k_bal += weight_delta where metal_type='Gold 22K'
silver_bal  += weight_delta where metal_type='Silver'
cash_bal    += amount_delta
```

Positive = customer credit (we owe them); negative = customer debit (they owe us).
Sign conventions codified in §6.2.

---

### Phase 5 — Dashboard updates

**File:** `backend/src/services/sellingDashboardService.js`.

Current state: aggregates only `selling_bills`. Needs to also aggregate `order_bills`.

Changes:
- `metal_inventory`: sum `weight_delta` across **all** `customer_ledger_entries` (both bill types) grouped by metal. Positive totals = metal on hand from customer deposits.
- `cash_status`: sum `amount` in `counter_cash_ledger` grouped by mode. Will naturally include the new order_bill entries from Phase 2.
- `receivable_total`: SUM of `customers.outstanding_balance` — unchanged, but now reflects order_bills too.
- Add two new dashboard cards:
  - **Pending OF.G AFSL bills** — list of bills where shop owes gold back (negative fine). Actionable follow-up list.
  - **Today's bills** — count + total of bills dated today across both tables.

**Frontend:** `Dashboard.jsx` (or `SellingDashboard.jsx`) — add the two cards, keep existing structure.

---

### Phase 6 — Admin panel polish (optional / time permitting)

Current `SellingAdmin.jsx` already supports:
- Metal → Category → Size tree.
- 3-tier rate cells.
- Bulk save.

Suggested polish:
- Drag-drop reorder of sizes within a metal (currently `sort_order` is numeric but not editable).
- CSV import/export for labour charges (Excel-friendly).
- Visual grouping that mirrors the Excel "Labour Charges" sheet layout (3 tables side by side) so the admin screen looks like the spreadsheet the client is used to.

Ship only if Phases 1–5 land cleanly.

---

## 6. Cross-cutting Specifications

### 6.1 Do-not-break integration points

These writes happen today and must remain atomic & correct after this work:

| Write | Trigger | File |
|---|---|---|
| `counter_inventory` negative row | `selling_bills` create | `sellingBillService._deductCounterStock` |
| `counter_inventory` positive row | `selling_bills` delete/revert | `sellingBillService._restoreCounterStock` |
| `customer_ledger_entries` rows | `selling_bills` lifecycle | `sellingBillService._insertAccountingEntries` |
| `counter_cash_ledger` rows | `selling_bills` lifecycle | same |
| `customers.outstanding_balance` update | `selling_bills` lifecycle | `sellingBillService._applyOutstandingDelta` |
| `stock_master` / `stock_transactions` writes during production | Melting / Rolling / Press / TPP / Packing completion | respective process services |
| `finished_goods` append-only on packing complete | `packingService.completePacking` | untouched |
| `svg_inventory` on vault transfers | `svgService.addSvgInventory` | untouched |

**None of the above are modified by this plan.** Phase 2 adds *new* writes from
`orderBillService` but the existing `sellingBillService` writes are unchanged.

### 6.2 Ledger sign conventions

`customer_ledger_entries.line_type` values (additive — no existing value changes):

| line_type | amount_delta sign | weight_delta sign | Meaning |
|---|---|---|---|
| `BILL_TOTAL` | + | 0 | Customer owes us (debit) |
| `PAYMENT_CASH` | − | 0 | Customer paid cash (credit) |
| `PAYMENT_ONLINE` | − | 0 | Customer paid online (credit) |
| `METAL_IN` | 0 | + | Customer gave us metal (credit in metal) |
| `METAL_OUT` | 0 | − | We returned metal to customer (debit in metal) |
| *new* `METAL_PAYABLE` | 0 | − (reserved) | OF.G AFSL — we owe fine back (tracked separately from actual METAL_OUT so reconciliation is clear) |

Running balance = `SUM(amount_delta)` and `SUM(weight_delta)` chronologically; see Phase 4.

### 6.3 Bill number policy

- `ob_no` is unique, auto-incremented, editable.
- `bill_no` on `selling_bills` likewise. These two sequences are independent —
  that's intentional under Option A (estimates vs. cash sales).

### 6.4 Edge cases to handle

| Case | Expected behavior |
|---|---|
| Bill with `customer_id = NULL` (anonymous walk-in) | Accept, but do not write to `customer_ledger_entries`. Still write to `counter_cash_ledger`. |
| Bill with `fine_jama > 0` but no customer | Reject with 400 — metal deposits must be attributable. |
| `amt_jama` where `cash + online` ≠ `amt_jama` on update | Backend recomputes `amt_jama = cash + online` — frontend amount is advisory only. |
| Bill deleted after customer deleted | Accept (customer_id can become dangling). Ledger rows already cascaded via soft-delete. |
| Bill update changes `customer_id` | Reverse old customer's ledger entries, insert new customer's. Transactional. |
| `fine_diff < 0` (customer gave MORE fine than bill weight) | `ofg_status = 'OF.G AFSL'`, `fine_carry = |fine_diff|`, gold_rs is usually ≤ 0. Matches Excel. |
| Mixed payment where one of cash/online is negative | Reject — both must be ≥ 0. |
| Customer_type change after bill created | Bill keeps its original `customer_type` (historical rate). Customer's default changes forward-only. |

---

## 7. Files to Change (Summary)

Backend — 4 files:
- `backend/config/dbConfig.js` — Phase 1 migrations.
- `backend/src/services/orderBillService.js` — Phase 2 main logic.
- `backend/src/services/customerService.js` — Phase 4 ledger extension.
- `backend/src/services/sellingDashboardService.js` — Phase 5 aggregation.

Frontend — 5 files, 2 new:
- `frontend/src/pages/OrderBills.jsx` — customer picker + payment split.
- `frontend/src/pages/Customers.jsx` — extract form into modal.
- `frontend/src/pages/CustomerLedger.jsx` — *new*.
- `frontend/src/components/CustomerPicker.jsx` — *new*.
- `frontend/src/components/CustomerFormModal.jsx` — *new*.
- `frontend/src/pages/Dashboard.jsx` / `SellingDashboard.jsx` — Phase 5 cards.

No changes to: any Production controller/service, any Stock service, `svgService`,
`jobService`, `finished_goods`, `svg_inventory`, any auth/middleware.

---

## 8. Test Strategy

Project has no existing automated tests, so verification is manual:

1. **Excel-parity unit script** — one-off Node script under `backend/scripts/verify-excel-math.js` that loads the sample bill values, calls `_computeSummary`, and asserts the numbers match the Excel totals. Runs before every release of this feature.
2. **Manual smoke test matrix** — for each customer type × each metal × each payment mode × (with/without fine exchange) create a bill and verify the ledger reflects it correctly.
3. **Regression check** — create/edit/delete one `selling_bill` end-to-end and verify the counter inventory, cash ledger, and customer ledger are unchanged from current behavior.

---

## 9. Risks & Open Questions

### Risks
1. **Double-counting.** If both `order_bills` and `selling_bills` write to the same customer ledger, the customer's balance will be inflated. Mitigation: per Phase 2, `reference_type = 'ORDER_BILL'` vs `'SELLING_BILL'` distinguishes them. Dashboard must deduplicate if a user creates both types for the same transaction (that's a workflow issue, not a code bug).
2. **Historical `amt_jama` backfill.** The Phase 1 backfill sets `cash_amount = amt_jama, online_amount = 0`. If some historical bills were actually online, this is wrong. Acceptable risk because the sum is preserved; individual cash/online totals may slightly drift.
3. **`findOrCreateByPhone` creates customers with minimal data.** A phone-only customer is created from walk-ins. Cleanup later via the Customers page.

### Open questions (want answers before starting Phase 2)
1. **Option A vs. B vs. C** in §3 — keep both bills, or consolidate?
2. **OF.G AFSL handling** — when the shop owes gold back, should the running gold balance show negative in the customer ledger, or should we also add a separate "Gold Owed to Customer" pot? I'm recommending a single negative balance (simpler, matches what traditional jewellers do) but this is a jeweller-operation choice.
3. **Order bill vs. tax invoice.** The Excel is labeled "ESTIMATE". If the client later needs a GST tax invoice, that's a separate document type. Confirm this is out of scope for now (brief says no tax).

---

## 10. Delivery Plan

| Phase | Effort estimate | Deliverable |
|---|---|---|
| 1 — Schema | ~30 min | Migration runs on startup, `order_bills` has 4 new columns. |
| 2 — Backend plumbing | ~2 hr | `POST/PUT/DELETE /api/order-bills` write ledger + cash + outstanding. |
| 3 — Frontend customer picker + payments | ~3 hr | `OrderBills.jsx` has customer search, new-customer modal, cash/online split. |
| 4 — Customer ledger page | ~2 hr | `/customers/:id/ledger` with 4 running balances. |
| 5 — Dashboard aggregation | ~1 hr | Dashboard counts both bill types. |
| 6 — Admin polish | ~1–2 hr optional | Drag-drop, CSV, side-by-side layout. |

I will pause between each phase for review.

---

## Appendix A — Excel formula → Code mapping (verified)

| Excel cell | Excel formula | Code location | Match? |
|---|---|---|---|
| C8 | `=A8*B8` | `orderBillService._computeSummary` item loop | ✅ |
| E8 | `=D8*B8` | same | ✅ |
| B22 | `=SUM(B8:B21)` | `total_pcs += pcs` | ✅ |
| C22 | `=SUM(C8:C21)` | `total_weight += weight` | ✅ |
| E22 | `=SUM(E8:E21)` | `labour_total += t_lc` | ✅ |
| C24 | `=B23−B24` | `fine_diff = total_weight − fine_jama` | ✅ |
| C25 | `=C24×B25/10` | `rawGoldRs = fine_diff × r10 / 10` | ✅ |
| E24 | `=ROUND(C25,−1)` | `Math.round(rawGoldRs/10)*10` | ✅ |
| E25 | `=E22+E24` | `subtotal = labour_total + gold_rs` | ✅ |
| B27 | `=E25−B26` | `amt_baki = subtotal − amt_jama` | ✅ |
| C27 | `=IF(AND(C25≤0,C24>0),"OF.G AFSL","OF.G HDF")` | explicit `if` block | ✅ (note: uses `gold_rs≤0` not `C25≤0` — equivalent after rounding) |

All core formulas already correct. **No changes needed to `_computeSummary`.**
