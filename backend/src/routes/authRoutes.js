const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// Public Login Route
router.post('/login', authController.loginUser);

// Protected Auth Routes (Require Token)
router.post('/change-password', authenticateToken, authController.changePassword);

// Administrative Routes (Require Token + ADMIN Role)
router.post('/users', authenticateToken, requireAdmin, authController.createUser);
router.get('/users', authenticateToken, authController.fetchUsers);

module.exports = router;
