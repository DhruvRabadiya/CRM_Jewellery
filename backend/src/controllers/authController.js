'use strict';

/**
 * authController.js — Authentication & User Management
 * ───────────────────────────────────────────────────────
 * Handles login, password change, admin user CRUD, and permission management.
 *
 * Permission model:
 *   • ADMIN role  → always has every permission (bypass all checks).
 *   • EMPLOYEE    → access governed by the `permissions` JSON column.
 *   • Permissions are embedded in the JWT so the frontend reads them without
 *     an extra round-trip.  Changes take effect on the employee's next login.
 */

const db          = require('../../config/dbConfig');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const logger      = require('../utils/logger');
const { JWT_SECRET }                                        = require('../middleware/authMiddleware');
const { ALL_PERMISSION_KEYS, DEFAULT_EMPLOYEE_PERMISSIONS } = require('../utils/permissions');

// Minimum password length enforced on creation and change
const MIN_PASSWORD_LENGTH = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the permissions JSON stored in the DB; always returns a clean array. */
const parsePerms = (raw) => {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/** Strip sensitive columns and parse permissions for a safe public user object. */
const safeUser = (row) => ({
  id:          row.id,
  username:    row.username,
  role:        row.role,
  permissions: parsePerms(row.permissions),
  created_at:  row.created_at,
});

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

    // Constant-time guard to prevent user enumeration via timing.
    const dummyHash   = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hashToTest  = user ? user.password_hash : dummyHash;
    const validPassword = await bcrypt.compare(password, hashToTest);

    if (!user || !validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const permissions = user.role === 'ADMIN' ? ALL_PERMISSION_KEYS : parsePerms(user.permissions);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, role: user.role, permissions },
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
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new passwords are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await db.pGet(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validOld = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validOld) return res.status(401).json({ error: 'Incorrect current password' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.pRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, userId]);

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

    // ADMIN accounts get all permissions; new employees get sensible defaults.
    const defaultPerms = assignedRole === 'ADMIN'
      ? ALL_PERMISSION_KEYS
      : DEFAULT_EMPLOYEE_PERMISSIONS;

    const hashed = await bcrypt.hash(password, 10);

    const { lastID } = await db.pRun(
      `INSERT INTO users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)`,
      [String(username).trim(), hashed, assignedRole, JSON.stringify(defaultPerms)]
    );

    return res.status(201).json({
      message: 'User created successfully',
      user: { id: lastID, username: String(username).trim(), role: assignedRole, permissions: defaultPerms },
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
    const rows = await db.pAll(
      `SELECT id, username, role, permissions, created_at FROM users ORDER BY id ASC`
    );
    return res.json(rows.map(safeUser));
  } catch (err) {
    logger.error('Fetch users error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Admin: update user permissions ──────────────────────────────────────────

const updatePermissions = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });

    // Validate incoming permissions array
    const incoming = req.body.permissions;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'permissions must be an array of permission keys' });
    }

    // Strip any unrecognised keys — ensures forward-compatibility if old clients send stale keys
    const clean = incoming.filter((k) => ALL_PERMISSION_KEYS.includes(k));

    const target = await db.pGet(`SELECT id, role FROM users WHERE id = ?`, [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // ADMIN accounts always have full access — their column is advisory only.
    // We still allow saving for consistency but the JWT for admins always returns ALL_PERMISSION_KEYS.
    if (target.role === 'ADMIN') {
      return res.status(400).json({
        error: 'Admin accounts always have full access — permissions cannot be restricted.',
      });
    }

    await db.pRun(
      `UPDATE users SET permissions = ? WHERE id = ?`,
      [JSON.stringify(clean), targetId]
    );

    return res.json({
      message:     'Permissions updated successfully',
      user_id:     targetId,
      permissions: clean,
    });
  } catch (err) {
    logger.error('Update permissions error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Any authenticated user: lightweight employee list (for dropdowns) ────────

/**
 * Returns id + username for every user — no sensitive data.
 * Accessible to any authenticated user (not admin-only) so that employee-role
 * users can populate "assign to employee" dropdowns without triggering a 403.
 */
const fetchEmployeeList = async (req, res) => {
  try {
    const rows = await db.pAll(
      `SELECT id, username FROM users ORDER BY username ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Fetch employee list error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Admin: delete user ───────────────────────────────────────────────────────

const deleteUser = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });

    // Prevent an admin from deleting their own account
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const target = await db.pGet(`SELECT id, role FROM users WHERE id = ?`, [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Prevent deleting the last admin account to avoid lockout
    if (target.role === 'ADMIN') {
      const adminCount = await db.pGet(
        `SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN'`
      );
      if ((adminCount?.cnt ?? 0) <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin account — at least one admin must remain.',
        });
      }
    }

    await db.pRun(`DELETE FROM users WHERE id = ?`, [targetId]);
    return res.json({ message: 'Employee deleted successfully', id: targetId });
  } catch (err) {
    logger.error('Delete user error', { message: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { loginUser, changePassword, createUser, fetchUsers, fetchEmployeeList, updatePermissions, deleteUser };
