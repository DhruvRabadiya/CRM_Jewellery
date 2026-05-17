const express = require('express');
const router  = express.Router();
const authController            = require('../controllers/authController');
const { authenticateToken,
        requireAdmin }          = require('../middleware/authMiddleware');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login', authController.loginUser);

// ── Authenticated (any role) ──────────────────────────────────────────────────
router.post('/change-password',  authenticateToken, authController.changePassword);
// Lightweight list used by employee-assignment dropdowns (non-admin safe)
router.get('/employees',         authenticateToken, authController.fetchEmployeeList);

// ── Admin-only ────────────────────────────────────────────────────────────────
router.post('/users',                   authenticateToken, requireAdmin, authController.createUser);
router.get('/users',                    authenticateToken, requireAdmin, authController.fetchUsers);
router.put('/users/:id/permissions',    authenticateToken, requireAdmin, authController.updatePermissions);
router.delete('/users/:id',             authenticateToken, requireAdmin, authController.deleteUser);

module.exports = router;
