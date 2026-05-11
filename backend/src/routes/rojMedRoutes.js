'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/rojMedController');
const { requireAdmin } = require('../middleware/authMiddleware');

// ── Day routes ────────────────────────────────────────────────────────────────
router.get ('/today',               ctrl.getToday);
router.get ('/days',                ctrl.listDays);
router.get ('/today-summary',       ctrl.getTodaySummary);
router.get ('/day/:date',           ctrl.getDay);
router.post('/day/:date/close',     ctrl.closeDay);
router.post('/day/:date/reopen',    requireAdmin, ctrl.reopenDay);

// ── Entry routes ──────────────────────────────────────────────────────────────
router.post  ('/day/:date/entries', ctrl.addEntry);
router.put   ('/entries/:id',       ctrl.editEntry);
router.delete('/entries/:id',       ctrl.deleteEntry);

// ── Report routes ─────────────────────────────────────────────────────────────
router.get('/party-summary',        ctrl.getPartySummary);

module.exports = router;
