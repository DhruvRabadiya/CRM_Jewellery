'use strict';

const svc = require('../services/rojMedService');

const ok  = (res, data)        => res.status(200).json({ success: true,  data });
const created = (res, data)    => res.status(201).json({ success: true,  data });
const fail = (res, msg, code = 400) => res.status(code).json({ success: false, message: msg });

// ─── Day ─────────────────────────────────────────────────────────────────────

/** GET /api/roj-med/today  — get or create today's day */
async function getToday(req, res) {
  try {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const day = await svc.getOrCreateDay(dateStr);
    const full = await svc.getDayWithEntries(day.id);
    ok(res, full);
  } catch (err) {
    fail(res, err.message, 500);
  }
}

/** GET /api/roj-med/day/:date  — get or create a specific day (YYYY-MM-DD) */
async function getDay(req, res) {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 'Invalid date format. Use YYYY-MM-DD');
    const day  = await svc.getOrCreateDay(date);
    const full = await svc.getDayWithEntries(day.id);
    ok(res, full);
  } catch (err) {
    fail(res, err.message, 500);
  }
}

/** GET /api/roj-med/days  — list recent days for history navigation */
async function listDays(req, res) {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '90',  10), 365);
    const offset = parseInt(req.query.offset || '0', 10);
    const days   = await svc.listDays(limit, offset);
    ok(res, days);
  } catch (err) {
    fail(res, err.message, 500);
  }
}

/** POST /api/roj-med/day/:date/close  — close a day */
async function closeDay(req, res) {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 'Invalid date format. Use YYYY-MM-DD');
    const day = await svc.getOrCreateDay(date);
    const result = await svc.closeDay(day.id, req.body?.notes || '');
    ok(res, result);
  } catch (err) {
    fail(res, err.message, 400);
  }
}

/** POST /api/roj-med/day/:date/reopen  — reopen a closed day (admin) */
async function reopenDay(req, res) {
  try {
    const { date } = req.params;
    const day = await svc.getOrCreateDay(date);
    const result = await svc.reopenDay(day.id);
    ok(res, result);
  } catch (err) {
    fail(res, err.message, 400);
  }
}

// ─── Entries ──────────────────────────────────────────────────────────────────

/** POST /api/roj-med/day/:date/entries  — add entry to a day */
async function addEntry(req, res) {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 'Invalid date format. Use YYYY-MM-DD');

    const { entry_type } = req.body;
    const VALID_TYPES = ['CASH_IN', 'CASH_OUT', 'METAL_IN', 'METAL_OUT', 'EXPENSE', 'COUNTER_SALE', 'METAL_PURCHASE'];
    if (!VALID_TYPES.includes(entry_type)) return fail(res, `entry_type must be one of: ${VALID_TYPES.join(', ')}`);

    const day    = await svc.getOrCreateDay(date);
    const result = await svc.addEntry(day.id, req.body);
    created(res, result);
  } catch (err) {
    fail(res, err.message, 400);
  }
}

/** PUT /api/roj-med/entries/:id  — edit an entry */
async function editEntry(req, res) {
  try {
    const entryId = parseInt(req.params.id, 10);
    if (!entryId) return fail(res, 'Invalid entry id');
    const result = await svc.editEntry(entryId, req.body);
    ok(res, result);
  } catch (err) {
    fail(res, err.message, 400);
  }
}

/** DELETE /api/roj-med/entries/:id  — delete an entry */
async function deleteEntry(req, res) {
  try {
    const entryId = parseInt(req.params.id, 10);
    if (!entryId) return fail(res, 'Invalid entry id');
    const result = await svc.deleteEntry(entryId);
    ok(res, result);
  } catch (err) {
    fail(res, err.message, 400);
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/** GET /api/roj-med/party-summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
async function getPartySummary(req, res) {
  try {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const from = req.query.from || todayStr;
    const to   = req.query.to   || todayStr;
    const data = await svc.getPartySummary(from, to);
    ok(res, data);
  } catch (err) {
    fail(res, err.message, 500);
  }
}

/** GET /api/roj-med/today-summary  — lightweight card data for dashboard */
async function getTodaySummary(req, res) {
  try {
    const data = await svc.getTodaySummary();
    ok(res, data);
  } catch (err) {
    fail(res, err.message, 500);
  }
}

module.exports = {
  getToday, getDay, listDays,
  closeDay, reopenDay,
  addEntry, editEntry, deleteEntry,
  getPartySummary, getTodaySummary,
};
