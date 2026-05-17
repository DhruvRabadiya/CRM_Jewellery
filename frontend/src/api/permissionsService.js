import api from './axiosConfig';

const BASE = '/auth/users';

/**
 * Update the permission set for an EMPLOYEE user.
 * @param {number} userId
 * @param {string[]} permissions  Array of permission key strings
 */
export const updateUserPermissions = (userId, permissions) =>
  api.put(`${BASE}/${userId}/permissions`, { permissions }).then((r) => r.data);

/**
 * Permanently delete a user account (admin only).
 * @param {number} userId
 */
export const deleteEmployee = (userId) =>
  api.delete(`${BASE}/${userId}`).then((r) => r.data);
