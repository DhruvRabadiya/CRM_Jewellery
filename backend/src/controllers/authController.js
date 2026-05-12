'use strict';

/**
 * authController.js — Authentication & User Management
 * ───────────────────────────────────────────────────────
 * Handles login, password change, and admin user CRUD.
 *
 * All DB calls use the promise helpers (db.pGet / db.pRun / db.pAll)
 * so that errors propagate correctly via async/await rather than being
 * silently swallowed inside callback chains.
 */

const db          = require('../../config/dbConfig');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const logger      = require('../utils/logger');
const { JWT_SECRET } = require('../middleware/authMiddleware');

// Minimum password length enforced on creation and change
const MIN_PASSWORD_LENGTH = 6;

// ─── Login ────────────────────────────────────────────────────────────────────

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await db.pGet(
      `SELECT * FROM users WHERE username = ?`,
      [String(username).trim()]
    );

    // Use a constant-time comparison guard — always compare even if user is missing
    // to prevent user enumeration via timing attacks.
    const dummyHash  = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hashToTest = user ? user.password_hash : dummyHash;
    const validPassword = await bcrypt.compare(password, hashToTest);

    if (!user || !validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    logger.error('Login error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Change password ──────────────────────────────────────────────────────────

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; // from authMiddleware

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new passwords are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await db.pGet(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validOld = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validOld) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.pRun(
      `UPDATE users SET password_hash = ? WHERE id = ?`,
      [newHash, userId]
    );

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    logger.error('Change password error', { message: err.message, userId: req.user?.id });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Admin: create user ───────────────────────────────────────────────────────

const createUser = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (String(username).trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
    const hashed       = await bcrypt.hash(password, 10);

    const { lastID } = await db.pRun(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      [String(username).trim(), hashed, assignedRole]
    );

    return res.status(201).json({
      message: 'User created successfully',
      user: { id: lastID, username: String(username).trim(), role: assignedRole },
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    logger.error('Create user error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Admin: list users ────────────────────────────────────────────────────────

const fetchUsers = async (req, res) => {
  try {
    // Never return password_hash or other sensitive columns
    const rows = await db.pAll(
      `SELECT id, username, role, created_at FROM users ORDER BY id ASC`
    );
    return res.json(rows);
  } catch (err) {
    logger.error('Fetch users error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { loginUser, changePassword, createUser, fetchUsers };
