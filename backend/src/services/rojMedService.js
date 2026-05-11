'use strict';

/**
 * rojMedService.js — Roj Med (Daily Accounting) Service
 *
 * Handles all DB operations for the Roj Med module:
 *   - Open / get a day
 *   - CRUD on entries within a day
 *   - Compute running totals
 *   - Close a day (lock + snapshot + carry-forward setup)
 *   - Party-wise summary
 *   - Dashboard summary (today)
 */

const db = require('../../config/dbConfig');
const stockService = require('./stockService');

// ─── tiny promise helpers ────────────────────────────────────────────────────

const pRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    })
  );

const pGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    })
  );

const pAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    })
  );

const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r4 = (v) => Math.round((v || 0) * 10000) / 10000;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD in local time */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute entry totals from a list of entry rows.
 *
 * Cash vs Bank are split by payment_mode:
 *   total_cash_in / total_cash_out  → Cash-mode transactions only
 *   total_bank_in / total_bank_out  → Bank / UPI-mode transactions only
 *
 * This lets us maintain two separate running balances:
 *   cash_balance = opening_cash + total_cash_in - total_cash_out
 *   bank_balance = opening_bank + total_bank_in - total_bank_out
 *
 * total_expenses and total_counter_sales are mode-agnostic totals kept for
 * reporting convenience.
 */
function computeTotals(entries) {
  const totals = {
    total_cash_in:              0,  // Cash-mode inflows only
    total_cash_out:             0,  // Cash-mode outflows only
    total_bank_in:              0,  // Bank/UPI-mode inflows
    total_bank_out:             0,  // Bank/UPI-mode outflows
    total_metal_in_gold24k:     0,
    total_metal_out_gold24k:    0,
    total_metal_in_gold22k:     0,
    total_metal_out_gold22k:    0,
    total_metal_in_silver:      0,
    total_metal_out_silver:     0,
    total_expenses:             0,  // All expenses regardless of mode (reporting)
    total_counter_sales:        0,  // All counter sales regardless of mode (reporting)
    total_metal_purchase_value: 0,  // Full contract cost of METAL_PURCHASE entries
  };

  for (const e of entries) {
    const isBank = e.payment_mode === 'Bank / UPI';

    switch (e.entry_type) {
      case 'CASH_IN':
        if (isBank) totals.total_bank_in  = r2(totals.total_bank_in  + e.amount);
        else        totals.total_cash_in  = r2(totals.total_cash_in  + e.amount);
        break;

      case 'CASH_OUT':
        if (isBank) totals.total_bank_out = r2(totals.total_bank_out + e.amount);
        else        totals.total_cash_out = r2(totals.total_cash_out + e.amount);
        break;

      case 'EXPENSE':
        if (isBank) totals.total_bank_out = r2(totals.total_bank_out + e.amount);
        else        totals.total_cash_out = r2(totals.total_cash_out + e.amount);
        totals.total_expenses = r2(totals.total_expenses + e.amount);
        break;

      case 'COUNTER_SALE':
        if (isBank) totals.total_bank_in  = r2(totals.total_bank_in  + e.amount);
        else        totals.total_cash_in  = r2(totals.total_cash_in  + e.amount);
        totals.total_counter_sales = r2(totals.total_counter_sales + e.amount);
        break;

      case 'METAL_IN':
        if (e.metal_type === 'Gold 24K') totals.total_metal_in_gold24k = r4(totals.total_metal_in_gold24k + e.metal_weight);
        if (e.metal_type === 'Gold 22K') totals.total_metal_in_gold22k = r4(totals.total_metal_in_gold22k + e.metal_weight);
        if (e.metal_type === 'Silver')   totals.total_metal_in_silver  = r4(totals.total_metal_in_silver  + e.metal_weight);
        break;

      case 'METAL_OUT':
        if (e.metal_type === 'Gold 24K') totals.total_metal_out_gold24k = r4(totals.total_metal_out_gold24k + e.metal_weight);
        if (e.metal_type === 'Gold 22K') totals.total_metal_out_gold22k = r4(totals.total_metal_out_gold22k + e.metal_weight);
        if (e.metal_type === 'Silver')   totals.total_metal_out_silver  = r4(totals.total_metal_out_silver  + e.metal_weight);
        break;

      case 'METAL_PURCHASE':
        // Payment side: only the amount actually paid now leaves the cash/bank balance
        if (isBank) totals.total_bank_out = r2(totals.total_bank_out + e.amount);
        else        totals.total_cash_out = r2(totals.total_cash_out + e.amount);
        // Metal side: purchased metal arrives in stock
        if (e.metal_type === 'Gold 24K') totals.total_metal_in_gold24k = r4(totals.total_metal_in_gold24k + e.metal_weight);
        if (e.metal_type === 'Gold 22K') totals.total_metal_in_gold22k = r4(totals.total_metal_in_gold22k + e.metal_weight);
        if (e.metal_type === 'Silver')   totals.total_metal_in_silver  = r4(totals.total_metal_in_silver  + e.metal_weight);
        // Full contract value (incl. deferred/unpaid portion) — tracked separately
        totals.total_metal_purchase_value = r2(totals.total_metal_purchase_value + (e.metal_value || 0));
        break;

      default:
        break;
    }
  }
  return totals;
}

/**
 * Pull today's order_bills for a date as read-only "derived" entries.
 * These are auto-synced — never stored in roj_med_entries.
 * Each bill contributes: total billed, cash received, online received,
 * metal received (Gold 24K / 22K / Silver), and outstanding balance.
 */
async function getDerivedEntriesForDay(dateStr) {
  const bills = await pAll(
    `SELECT
       ob.id          AS bill_db_id,
       ob.ob_no,
       ob.date,
       ob.customer_id,
       ob.customer_name,
       ob.customer_type,
       ob.payment_mode,
       COALESCE(ob.total_amount, 0)    AS total_amount,
       COALESCE(ob.cash_amount, 0)     AS cash_amount,
       COALESCE(ob.online_amount, 0)   AS online_amount,
       COALESCE(ob.fine_jama, 0)       AS fine_jama,
       COALESCE(ob.jama_gold_22k, 0)   AS jama_gold_22k,
       COALESCE(ob.jama_silver, 0)     AS jama_silver,
       COALESCE(ob.rate_10g, 0)        AS rate_10g,
       COALESCE(ob.rate_gold_22k, 0)   AS rate_gold_22k,
       COALESCE(ob.rate_silver, 0)     AS rate_silver,
       COALESCE(ob.amt_baki, 0)        AS amt_baki,
       COALESCE(ob.refund_due, 0)      AS refund_due,
       COALESCE(ob.subtotal, 0)        AS subtotal,
       COALESCE(ob.labour_total, 0)    AS labour_total,
       COALESCE(ob.discount, 0)        AS discount
     FROM order_bills ob
     WHERE ob.date = ?
     ORDER BY ob.id ASC`,
    [dateStr]
  );

  if (!bills.length) return [];

  // Batch-load items grouped per bill to avoid N+1 queries
  const billIds = bills.map(b => b.bill_db_id);
  const placeholders = billIds.map(() => '?').join(',');
  const allItems = await pAll(
    `SELECT bill_id,
            metal_type,
            category,
            SUM(pcs)    AS total_pcs,
            SUM(weight) AS total_weight,
            SUM(t_lc)   AS total_lc
     FROM order_bill_items
     WHERE bill_id IN (${placeholders})
     GROUP BY bill_id, metal_type, category
     ORDER BY bill_id, metal_type`,
    billIds
  );

  // Index items by bill_id
  const itemsByBill = {};
  for (const item of allItems) {
    if (!itemsByBill[item.bill_id]) itemsByBill[item.bill_id] = [];
    itemsByBill[item.bill_id].push(item);
  }

  return bills.map(bill => ({
    id:                   `est_${bill.ob_no}`,
    is_derived:           true,
    source:               'estimate',
    entry_type:           'COUNTER_SALE',
    reference_type:       'order_bill',
    reference_no:         `Bill #${bill.ob_no}`,
    reference_id:         bill.ob_no,
    party_id:             bill.customer_id || null,
    party_name:           bill.customer_name || '',
    customer_type:        bill.customer_type || '',
    payment_mode:         bill.payment_mode || 'Cash',
    amount:               r2(bill.total_amount),
    cash_received:        r2(bill.cash_amount),
    online_received:      r2(bill.online_amount),
    outstanding:          r2(bill.amt_baki),
    refund_due:           r2(bill.refund_due),
    metal_gold24k_wt:     r4(bill.fine_jama),
    metal_gold22k_wt:     r4(bill.jama_gold_22k),
    metal_silver_wt:      r4(bill.jama_silver),
    rate_gold24k:         r2(bill.rate_10g),
    rate_gold22k:         r2(bill.rate_gold_22k),
    rate_silver:          r2(bill.rate_silver),
    subtotal:             r2(bill.subtotal),
    labour_total:         r2(bill.labour_total),
    discount:             r2(bill.discount),
    items:                itemsByBill[bill.bill_db_id] || [],
    entry_date:           dateStr,
    notes:                '',
  }));
}

/**
 * Aggregate totals from auto-derived estimate entries.
 * Separate from manual totals so the UI can show both clearly.
 */
function computeEstimateTotals(derivedEntries) {
  return derivedEntries.reduce(
    (acc, e) => {
      acc.bill_count++;
      acc.total_billed        = r2(acc.total_billed        + e.amount);
      acc.est_cash_in         = r2(acc.est_cash_in         + e.cash_received);
      acc.est_online_in       = r2(acc.est_online_in       + e.online_received);
      acc.est_outstanding     = r2(acc.est_outstanding     + e.outstanding);
      acc.est_metal_in_gold24k = r4(acc.est_metal_in_gold24k + e.metal_gold24k_wt);
      acc.est_metal_in_gold22k = r4(acc.est_metal_in_gold22k + e.metal_gold22k_wt);
      acc.est_metal_in_silver  = r4(acc.est_metal_in_silver  + e.metal_silver_wt);
      return acc;
    },
    {
      bill_count: 0,
      total_billed: 0,
      est_cash_in: 0,
      est_online_in: 0,
      est_outstanding: 0,
      est_metal_in_gold24k: 0,
      est_metal_in_gold22k: 0,
      est_metal_in_silver: 0,
    }
  );
}

// ─── Day management ──────────────────────────────────────────────────────────

/**
 * Get a day record by date string (YYYY-MM-DD).
 * If the day doesn't exist yet, create it with opening balances carried
 * from the most recent closed day.
 */
async function getOrCreateDay(dateStr) {
  let day = await pGet('SELECT * FROM roj_med_days WHERE day_date = ?', [dateStr]);
  if (day) return day;

  // Carry forward closing balances from the most recent closed day
  const prev = await pGet(
    `SELECT * FROM roj_med_days
     WHERE status = 'CLOSED' AND day_date < ?
     ORDER BY day_date DESC LIMIT 1`,
    [dateStr]
  );

  const openingCash       = prev ? r2(prev.closing_cash)              : 0;
  const openingBank       = prev ? r2(prev.closing_bank  || 0)        : 0;
  const openingGold24k    = prev ? r4(prev.closing_metal_gold24k)     : 0;
  const openingGold22k    = prev ? r4(prev.closing_metal_gold22k)     : 0;
  const openingSilver     = prev ? r4(prev.closing_metal_silver)      : 0;

  const result = await pRun(
    `INSERT INTO roj_med_days
       (day_date, status,
        opening_cash, opening_bank,
        opening_metal_gold24k, opening_metal_gold22k, opening_metal_silver,
        closing_cash, closing_bank,
        closing_metal_gold24k, closing_metal_gold22k, closing_metal_silver)
     VALUES (?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dateStr,
     openingCash, openingBank,
     openingGold24k, openingGold22k, openingSilver,
     openingCash, openingBank,
     openingGold24k, openingGold22k, openingSilver]
  );

  return pGet('SELECT * FROM roj_med_days WHERE id = ?', [result.lastID]);
}

/** Get a day by ID */
async function getDayById(id) {
  return pGet('SELECT * FROM roj_med_days WHERE id = ?', [id]);
}

/** List all days (for history / navigation) */
async function listDays(limit = 60, offset = 0) {
  return pAll(
    `SELECT * FROM roj_med_days ORDER BY day_date DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

// ─── Entry CRUD ──────────────────────────────────────────────────────────────

/** Return all entries for a day, ordered by sort_order / created_at */
async function getEntriesForDay(dayId) {
  return pAll(
    `SELECT e.*, c.party_name AS _party_name_live
     FROM roj_med_entries e
     LEFT JOIN customers c ON c.id = e.party_id
     WHERE e.day_id = ?
     ORDER BY e.sort_order ASC, e.created_at ASC`,
    [dayId]
  );
}

/**
 * Add an entry to a day.
 * Validates that the day is OPEN.
 * Returns the full day + entries after insertion.
 */
async function addEntry(dayId, entryData) {
  const day = await getDayById(dayId);
  if (!day) throw new Error('Day not found');
  if (day.status === 'CLOSED') throw new Error('This day is closed. You cannot add entries to a closed day.');

  const {
    entry_type, party_id, payment_mode = 'Cash',
    amount = 0,
    metal_type = '', metal_purity = '', metal_weight = 0, metal_rate = 0,
    expense_category = '',
    reference_type = '', reference_id = null, reference_no = '',
    notes = '', entry_time = '',
  } = entryData;

  // Resolve party name snapshot
  let partyName = entryData.party_name || '';
  if (party_id && !partyName) {
    const cust = await pGet('SELECT party_name FROM customers WHERE id = ?', [party_id]);
    if (cust) partyName = cust.party_name;
  }

  const metalValue = metal_rate > 0 && metal_weight > 0
    ? r2((metal_weight * metal_rate) / 10)
    : 0;

  // Next sort_order
  const maxSort = await pGet(
    'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM roj_med_entries WHERE day_id = ?',
    [dayId]
  );
  const sortOrder = (maxSort?.mx || 0) + 1;

  const insertResult = await pRun(
    `INSERT INTO roj_med_entries
       (day_id, entry_date, entry_time, sort_order,
        entry_type, party_id, party_name, payment_mode,
        amount, metal_type, metal_purity, metal_weight, metal_rate, metal_value,
        expense_category, reference_type, reference_id, reference_no, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dayId, day.day_date, entry_time, sortOrder,
      entry_type,
      party_id || null, partyName, payment_mode,
      r2(amount),
      metal_type, metal_purity, r4(metal_weight), r2(metal_rate), r2(metalValue),
      expense_category, reference_type, reference_id || null, reference_no, notes,
    ]
  );

  // ── Stock sync for METAL_PURCHASE ───────────────────────────────────────────
  if (entry_type === 'METAL_PURCHASE' && metal_type && metal_weight > 0) {
    const entryId = insertResult.lastID;
    const desc = `Metal purchase: ${r4(metal_weight)}g ${metal_type}${partyName ? ` from ${partyName}` : ''}`;
    await stockService.updateOpeningStock(metal_type, r4(metal_weight), true);
    await stockService.logTransaction(metal_type, 'PURCHASE', r4(metal_weight), desc, 'metal_purchase', entryId);
  }

  // Recompute and persist running closing balances on the day row
  await _updateDayClosingBalances(dayId);

  return getDayWithEntries(dayId);
}

/** Edit an existing entry (day must be OPEN) */
async function editEntry(entryId, entryData) {
  const entry = await pGet('SELECT * FROM roj_med_entries WHERE id = ?', [entryId]);
  if (!entry) throw new Error('Entry not found');

  const day = await getDayById(entry.day_id);
  if (!day) throw new Error('Day not found');
  if (day.status === 'CLOSED') throw new Error('This day is closed. You cannot edit entries in a closed day.');

  const {
    entry_type = entry.entry_type,
    party_id = entry.party_id,
    payment_mode = entry.payment_mode,
    amount = entry.amount,
    metal_type = entry.metal_type,
    metal_purity = entry.metal_purity,
    metal_weight = entry.metal_weight,
    metal_rate = entry.metal_rate,
    expense_category = entry.expense_category,
    reference_type = entry.reference_type,
    reference_id = entry.reference_id,
    reference_no = entry.reference_no,
    notes = entry.notes,
    entry_time = entry.entry_time,
  } = entryData;

  let partyName = entryData.party_name || entry.party_name || '';
  if (party_id && party_id !== entry.party_id) {
    const cust = await pGet('SELECT party_name FROM customers WHERE id = ?', [party_id]);
    if (cust) partyName = cust.party_name;
  }

  const metalValue = metal_rate > 0 && metal_weight > 0
    ? r2((metal_weight * metal_rate) / 10)
    : 0;

  // ── Stock reversal: if old entry was a METAL_PURCHASE, undo its stock effect ─
  if (entry.entry_type === 'METAL_PURCHASE' && entry.metal_weight > 0) {
    const oldTxn = await pGet(
      `SELECT * FROM stock_transactions WHERE reference_type = 'metal_purchase' AND reference_id = ?`,
      [entryId]
    );
    if (oldTxn) {
      await stockService.updateOpeningStock(oldTxn.metal_type, oldTxn.weight, false);
      await pRun(`DELETE FROM stock_transactions WHERE id = ?`, [oldTxn.id]);
    }
  }

  await pRun(
    `UPDATE roj_med_entries SET
       entry_type = ?, party_id = ?, party_name = ?, payment_mode = ?,
       amount = ?, metal_type = ?, metal_purity = ?,
       metal_weight = ?, metal_rate = ?, metal_value = ?,
       expense_category = ?, reference_type = ?, reference_id = ?,
       reference_no = ?, notes = ?, entry_time = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      entry_type, party_id || null, partyName, payment_mode,
      r2(amount), metal_type, metal_purity,
      r4(metal_weight), r2(metal_rate), r2(metalValue),
      expense_category, reference_type, reference_id || null,
      reference_no, notes, entry_time,
      entryId,
    ]
  );

  // ── Stock apply: if new entry_type is METAL_PURCHASE, log the new stock effect ─
  if (entry_type === 'METAL_PURCHASE' && metal_type && metal_weight > 0) {
    const desc = `Metal purchase: ${r4(metal_weight)}g ${metal_type}${partyName ? ` from ${partyName}` : ''}`;
    await stockService.updateOpeningStock(metal_type, r4(metal_weight), true);
    await stockService.logTransaction(metal_type, 'PURCHASE', r4(metal_weight), desc, 'metal_purchase', entryId);
  }

  await _updateDayClosingBalances(entry.day_id);
  return getDayWithEntries(entry.day_id);
}

/** Delete an entry (day must be OPEN) */
async function deleteEntry(entryId) {
  const entry = await pGet('SELECT * FROM roj_med_entries WHERE id = ?', [entryId]);
  if (!entry) throw new Error('Entry not found');

  const day = await getDayById(entry.day_id);
  if (!day) throw new Error('Day not found');
  if (day.status === 'CLOSED') throw new Error('This day is closed. You cannot delete entries from a closed day.');

  // ── Stock reversal: if deleted entry was a METAL_PURCHASE, undo its stock effect ─
  if (entry.entry_type === 'METAL_PURCHASE' && entry.metal_weight > 0) {
    const txn = await pGet(
      `SELECT * FROM stock_transactions WHERE reference_type = 'metal_purchase' AND reference_id = ?`,
      [entryId]
    );
    if (txn) {
      await stockService.updateOpeningStock(txn.metal_type, txn.weight, false);
      await pRun(`DELETE FROM stock_transactions WHERE id = ?`, [txn.id]);
    }
  }

  await pRun('DELETE FROM roj_med_entries WHERE id = ?', [entryId]);
  await _updateDayClosingBalances(entry.day_id);
  return getDayWithEntries(entry.day_id);
}

// ─── Close a day ─────────────────────────────────────────────────────────────

/**
 * Close (lock) a day.
 * Computes final totals + closing balances, then sets status = CLOSED.
 * Returns the final day + entries.
 */
async function closeDay(dayId, notes = '') {
  const day = await getDayById(dayId);
  if (!day) throw new Error('Day not found');
  if (day.status === 'CLOSED') throw new Error('This day is already closed.');

  const entries         = await getEntriesForDay(dayId);
  const estimateEntries = await getDerivedEntriesForDay(day.day_date);
  const manual          = computeTotals(entries);
  const est             = computeEstimateTotals(estimateEntries);

  // Combine manual + estimate inflows, split by payment mode
  // est_cash_in  = cash collected on estimates (cash_amount)
  // est_online_in = bank/UPI collected on estimates (online_amount)
  const combinedCashIn  = r2(manual.total_cash_in  + est.est_cash_in);
  const combinedBankIn  = r2(manual.total_bank_in  + est.est_online_in);
  const combinedGold24kIn = r4(manual.total_metal_in_gold24k + est.est_metal_in_gold24k);
  const combinedGold22kIn = r4(manual.total_metal_in_gold22k + est.est_metal_in_gold22k);
  const combinedSilverIn  = r4(manual.total_metal_in_silver  + est.est_metal_in_silver);

  const closingCash    = r2(day.opening_cash              + combinedCashIn    - manual.total_cash_out);
  const closingBank    = r2((day.opening_bank   || 0)     + combinedBankIn    - manual.total_bank_out);
  const closingGold24k = r4(day.opening_metal_gold24k     + combinedGold24kIn - manual.total_metal_out_gold24k);
  const closingGold22k = r4(day.opening_metal_gold22k     + combinedGold22kIn - manual.total_metal_out_gold22k);
  const closingSilver  = r4(day.opening_metal_silver      + combinedSilverIn  - manual.total_metal_out_silver);

  await pRun(
    `UPDATE roj_med_days SET
       status = 'CLOSED',
       closing_cash                = ?,
       closing_bank                = ?,
       closing_metal_gold24k       = ?,
       closing_metal_gold22k       = ?,
       closing_metal_silver        = ?,
       total_cash_in               = ?,
       total_cash_out              = ?,
       total_bank_in               = ?,
       total_bank_out              = ?,
       total_metal_in_gold24k      = ?,
       total_metal_out_gold24k     = ?,
       total_metal_in_gold22k      = ?,
       total_metal_out_gold22k     = ?,
       total_metal_in_silver       = ?,
       total_metal_out_silver      = ?,
       total_expenses              = ?,
       total_counter_sales         = ?,
       total_metal_purchase_value  = ?,
       notes = ?,
       closed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      closingCash, closingBank, closingGold24k, closingGold22k, closingSilver,
      combinedCashIn,     manual.total_cash_out,
      combinedBankIn,     manual.total_bank_out,
      combinedGold24kIn,  manual.total_metal_out_gold24k,
      combinedGold22kIn,  manual.total_metal_out_gold22k,
      combinedSilverIn,   manual.total_metal_out_silver,
      manual.total_expenses,
      r2(manual.total_counter_sales + est.total_billed),
      manual.total_metal_purchase_value,
      notes || day.notes,
      dayId,
    ]
  );

  return getDayWithEntries(dayId);
}

/** Reopen a closed day (admin action) */
async function reopenDay(dayId) {
  const day = await getDayById(dayId);
  if (!day) throw new Error('Day not found');
  if (day.status === 'OPEN') throw new Error('This day is already open.');

  await pRun(
    `UPDATE roj_med_days SET status = 'OPEN', closed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [dayId]
  );

  return getDayWithEntries(dayId);
}

// ─── Composite read ───────────────────────────────────────────────────────────

/**
 * Return day row + manual entries + auto-derived estimate entries + combined live totals.
 *
 * live_totals combines both manual entries and estimate receipts so summary
 * cards and the day-close snapshot reflect all actual transactions.
 *
 * manual_totals  = only user-recorded roj_med_entries
 * estimate_totals = auto-derived from order_bills for this date
 */
async function getDayWithEntries(dayId) {
  const day            = await getDayById(dayId);
  if (!day) return null;
  const entries        = await getEntriesForDay(dayId);
  const estimateEntries = await getDerivedEntriesForDay(day.day_date);

  const manualTotals   = computeTotals(entries);
  const estTotals      = computeEstimateTotals(estimateEntries);

  // Split inflows: est_cash_in → cash column; est_online_in → bank column
  const combinedCashIn = r2(manualTotals.total_cash_in + estTotals.est_cash_in);
  const combinedBankIn = r2(manualTotals.total_bank_in + estTotals.est_online_in);

  const cashBalance = r2(day.opening_cash         + combinedCashIn - manualTotals.total_cash_out);
  const bankBalance = r2((day.opening_bank || 0)  + combinedBankIn - manualTotals.total_bank_out);

  return {
    ...day,
    entries,
    estimate_entries: estimateEntries,
    manual_totals:    manualTotals,
    estimate_totals:  estTotals,
    live_totals: {
      // Cash-mode only
      total_cash_in:                combinedCashIn,
      total_cash_out:               manualTotals.total_cash_out,
      // Bank/UPI-mode only
      total_bank_in:                combinedBankIn,
      total_bank_out:               manualTotals.total_bank_out,
      // Expense / purchase totals (mode-agnostic, for reporting)
      total_expenses:               manualTotals.total_expenses,
      total_metal_purchase_value:   manualTotals.total_metal_purchase_value,
      // Counter sales (mode-agnostic)
      total_counter_sales:          r2(manualTotals.total_counter_sales + estTotals.total_billed),
      // Metal in/out (combined with estimates)
      total_metal_in_gold24k:       r4(manualTotals.total_metal_in_gold24k + estTotals.est_metal_in_gold24k),
      total_metal_in_gold22k:       r4(manualTotals.total_metal_in_gold22k + estTotals.est_metal_in_gold22k),
      total_metal_in_silver:        r4(manualTotals.total_metal_in_silver  + estTotals.est_metal_in_silver),
      total_metal_out_gold24k:      manualTotals.total_metal_out_gold24k,
      total_metal_out_gold22k:      manualTotals.total_metal_out_gold22k,
      total_metal_out_silver:       manualTotals.total_metal_out_silver,
      // Running balances
      cash_balance:                 cashBalance,
      bank_balance:                 bankBalance,
      metal_bal_gold24k:            r4(day.opening_metal_gold24k + manualTotals.total_metal_in_gold24k + estTotals.est_metal_in_gold24k - manualTotals.total_metal_out_gold24k),
      metal_bal_gold22k:            r4(day.opening_metal_gold22k + manualTotals.total_metal_in_gold22k + estTotals.est_metal_in_gold22k - manualTotals.total_metal_out_gold22k),
      metal_bal_silver:             r4(day.opening_metal_silver  + manualTotals.total_metal_in_silver  + estTotals.est_metal_in_silver  - manualTotals.total_metal_out_silver),
    },
  };
}

// ─── Party-wise summary ───────────────────────────────────────────────────────

/**
 * Return a party-wise summary for a date range.
 * Groups entries by party and aggregates cash in/out and metal in/out.
 */
async function getPartySummary(fromDate, toDate) {
  const rows = await pAll(
    `SELECT
       e.party_id,
       e.party_name,
       e.entry_type,
       e.metal_type,
       SUM(e.amount)       AS total_amount,
       SUM(e.metal_weight) AS total_weight
     FROM roj_med_entries e
     WHERE e.entry_date BETWEEN ? AND ?
       AND e.party_id IS NOT NULL
     GROUP BY e.party_id, e.entry_type, e.metal_type
     ORDER BY e.party_name ASC`,
    [fromDate, toDate]
  );

  // Pivot into party → { cashIn, cashOut, metals }
  const map = {};
  for (const row of rows) {
    const key = row.party_id;
    if (!map[key]) {
      map[key] = { party_id: row.party_id, party_name: row.party_name, cash_in: 0, cash_out: 0, expenses: 0, metals: {} };
    }
    const p = map[key];
    if (row.entry_type === 'CASH_IN' || row.entry_type === 'COUNTER_SALE') {
      p.cash_in = r2(p.cash_in + row.total_amount);
    }
    if (row.entry_type === 'CASH_OUT' || row.entry_type === 'EXPENSE') {
      p.cash_out = r2(p.cash_out + row.total_amount);
      if (row.entry_type === 'EXPENSE') p.expenses = r2(p.expenses + row.total_amount);
    }
    if ((row.entry_type === 'METAL_IN' || row.entry_type === 'METAL_OUT') && row.metal_type) {
      if (!p.metals[row.metal_type]) p.metals[row.metal_type] = { in: 0, out: 0 };
      if (row.entry_type === 'METAL_IN')  p.metals[row.metal_type].in  = r4(p.metals[row.metal_type].in  + row.total_weight);
      if (row.entry_type === 'METAL_OUT') p.metals[row.metal_type].out = r4(p.metals[row.metal_type].out + row.total_weight);
    }
  }

  return Object.values(map);
}

// ─── Dashboard summary (today) ────────────────────────────────────────────────

async function getTodaySummary() {
  const today = todayStr();
  const day   = await pGet('SELECT * FROM roj_med_days WHERE day_date = ?', [today]);

  if (!day) {
    return {
      exists: false,
      day_date: today,
      status: 'NOT_STARTED',
      cash_balance: 0,
      total_cash_in: 0,
      total_cash_out: 0,
      total_expenses: 0,
      metal_bal_gold24k: 0,
      metal_bal_gold22k: 0,
      metal_bal_silver: 0,
      entry_count: 0,
    };
  }

  const entries         = await getEntriesForDay(day.id);
  const estimateEntries = await getDerivedEntriesForDay(day.day_date);
  const manual          = computeTotals(entries);
  const est             = computeEstimateTotals(estimateEntries);

  // Split by mode: cash estimates → cash; online estimates → bank
  const combinedCashIn = r2(manual.total_cash_in + est.est_cash_in);
  const combinedBankIn = r2(manual.total_bank_in + est.est_online_in);
  const cashBal        = r2(day.opening_cash          + combinedCashIn - manual.total_cash_out);
  const bankBal        = r2((day.opening_bank || 0)   + combinedBankIn - manual.total_bank_out);

  return {
    exists: true,
    day_id: day.id,
    day_date: day.day_date,
    status: day.status,
    opening_cash:               day.opening_cash,
    opening_bank:               day.opening_bank || 0,
    cash_balance:               cashBal,
    bank_balance:               bankBal,
    total_cash_in:              combinedCashIn,
    total_cash_out:             manual.total_cash_out,
    total_bank_in:              combinedBankIn,
    total_bank_out:             manual.total_bank_out,
    total_expenses:             manual.total_expenses,
    total_counter_sales:        r2(manual.total_counter_sales + est.total_billed),
    total_metal_purchase_value: manual.total_metal_purchase_value,
    bill_count:                 est.bill_count,
    metal_bal_gold24k:          r4(day.opening_metal_gold24k + manual.total_metal_in_gold24k + est.est_metal_in_gold24k - manual.total_metal_out_gold24k),
    metal_bal_gold22k:          r4(day.opening_metal_gold22k + manual.total_metal_in_gold22k + est.est_metal_in_gold22k - manual.total_metal_out_gold22k),
    metal_bal_silver:           r4(day.opening_metal_silver  + manual.total_metal_in_silver  + est.est_metal_in_silver  - manual.total_metal_out_silver),
    entry_count:                entries.length,
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

/** Recompute and persist the live closing balances on the day row (called after every entry mutation) */
async function _updateDayClosingBalances(dayId) {
  const day    = await getDayById(dayId);
  if (!day || day.status === 'CLOSED') return;

  const entries         = await getEntriesForDay(dayId);
  const estimateEntries = await getDerivedEntriesForDay(day.day_date);
  const totals          = computeTotals(entries);
  const est             = computeEstimateTotals(estimateEntries);

  // Merge estimate contributions: cash estimates → cash, online estimates → bank
  const combinedCashIn  = r2(totals.total_cash_in + est.est_cash_in);
  const combinedBankIn  = r2(totals.total_bank_in + est.est_online_in);
  const combinedG24kIn  = r4(totals.total_metal_in_gold24k + est.est_metal_in_gold24k);
  const combinedG22kIn  = r4(totals.total_metal_in_gold22k + est.est_metal_in_gold22k);
  const combinedSilvIn  = r4(totals.total_metal_in_silver  + est.est_metal_in_silver);
  const combinedSales   = r2(totals.total_counter_sales    + est.total_billed);

  await pRun(
    `UPDATE roj_med_days SET
       closing_cash               = ?,
       closing_bank               = ?,
       closing_metal_gold24k      = ?,
       closing_metal_gold22k      = ?,
       closing_metal_silver       = ?,
       total_cash_in              = ?,
       total_cash_out             = ?,
       total_bank_in              = ?,
       total_bank_out             = ?,
       total_metal_in_gold24k     = ?,
       total_metal_out_gold24k    = ?,
       total_metal_in_gold22k     = ?,
       total_metal_out_gold22k    = ?,
       total_metal_in_silver      = ?,
       total_metal_out_silver     = ?,
       total_expenses             = ?,
       total_counter_sales        = ?,
       total_metal_purchase_value = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      r2(day.opening_cash           + combinedCashIn - totals.total_cash_out),
      r2((day.opening_bank || 0)    + combinedBankIn - totals.total_bank_out),
      r4(day.opening_metal_gold24k  + combinedG24kIn - totals.total_metal_out_gold24k),
      r4(day.opening_metal_gold22k  + combinedG22kIn - totals.total_metal_out_gold22k),
      r4(day.opening_metal_silver   + combinedSilvIn - totals.total_metal_out_silver),
      combinedCashIn,   totals.total_cash_out,
      combinedBankIn,   totals.total_bank_out,
      combinedG24kIn,   totals.total_metal_out_gold24k,
      combinedG22kIn,   totals.total_metal_out_gold22k,
      combinedSilvIn,   totals.total_metal_out_silver,
      totals.total_expenses,  combinedSales,
      totals.total_metal_purchase_value,
      dayId,
    ]
  );
}

module.exports = {
  getOrCreateDay,
  getDayById,
  getDayWithEntries,
  listDays,
  addEntry,
  editEntry,
  deleteEntry,
  closeDay,
  reopenDay,
  getPartySummary,
  getTodaySummary,
};
