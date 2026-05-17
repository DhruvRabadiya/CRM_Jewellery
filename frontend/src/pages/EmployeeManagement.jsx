import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Shield, User, Calendar, Eye, EyeOff,
  Settings2, Check, X, ChevronRight, Lock, Unlock, Trash2, AlertTriangle,
} from 'lucide-react';
import api from '../api/axiosConfig';
import { updateUserPermissions, deleteEmployee } from '../api/permissionsService';
import { useAuth } from '../context/AuthContext';
import { PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from '../utils/permissions';
import Toast from '../components/Toast';
import Modal from '../components/Modal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ROLE_CONFIG = {
  ADMIN: {
    label:  'Admin',
    pill:   'bg-amber-100 text-amber-700 border border-amber-200',
    avatar: 'from-amber-400 to-orange-500',
    icon:   Shield,
  },
  EMPLOYEE: {
    label:  'Employee',
    pill:   'bg-blue-100 text-blue-700 border border-blue-200',
    avatar: 'from-blue-400 to-indigo-500',
    icon:   User,
  },
};
const defaultRole = ROLE_CONFIG.EMPLOYEE;

const GROUP_COLORS = {
  blue:   { header: 'bg-blue-50   border-blue-100',   badge: 'bg-blue-500',   dot: 'bg-blue-500'   },
  indigo: { header: 'bg-indigo-50 border-indigo-100', badge: 'bg-indigo-500', dot: 'bg-indigo-500' },
  violet: { header: 'bg-violet-50 border-violet-100', badge: 'bg-violet-500', dot: 'bg-violet-500' },
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────

const Toggle = ({ on, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!on)}
    disabled={disabled}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border-2 transition-colors duration-200 focus:outline-none ${
      disabled
        ? 'cursor-not-allowed opacity-40 border-gray-200 bg-gray-100'
        : on
          ? 'border-blue-500 bg-blue-500 cursor-pointer'
          : 'border-gray-200 bg-gray-100 cursor-pointer hover:border-gray-300'
    }`}
    aria-checked={on}
    role="switch"
  >
    <span
      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${
        on ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, accent }) => {
  const colors = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-500',   val: 'text-blue-700'   },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'text-amber-500',  val: 'text-amber-700'  },
    slate:  { bg: 'bg-slate-50',  border: 'border-slate-100',  icon: 'text-slate-400',  val: 'text-slate-700'  },
  };
  const c = colors[accent] || colors.slate;
  return (
    <div className={`rounded-xl border ${c.bg} ${c.border} px-5 py-4 flex items-center gap-4`}>
      <div className={`p-2.5 rounded-lg bg-white shadow-sm border ${c.border}`}>
        <span className={c.icon}>{icon}</span>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-2xl font-black leading-tight ${c.val}`}>{value}</p>
      </div>
    </div>
  );
};

// ─── Access Panel (modal) ─────────────────────────────────────────────────────

const AccessPanel = ({ user: targetUser, onClose, onSaved }) => {
  const [pending,  setPending]  = useState(new Set(targetUser.permissions || []));
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  const isAdmin = targetUser.role === 'ADMIN';

  const toggle = (key) => {
    if (isAdmin) return;
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else               next.add(key);
      return next;
    });
    setDirty(true);
  };

  const grantGroup = (items) => {
    if (isAdmin) return;
    setPending((prev) => {
      const next = new Set(prev);
      items.forEach((item) => next.add(item.key));
      return next;
    });
    setDirty(true);
  };

  const revokeGroup = (items) => {
    if (isAdmin) return;
    setPending((prev) => {
      const next = new Set(prev);
      items.forEach((item) => next.delete(item.key));
      return next;
    });
    setDirty(true);
  };

  const grantAll = () => {
    if (isAdmin) return;
    setPending(new Set(ALL_PERMISSION_KEYS));
    setDirty(true);
  };

  const revokeAll = () => {
    if (isAdmin) return;
    setPending(new Set());
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserPermissions(targetUser.id, [...pending]);
      onSaved([...pending]);
      onClose();
    } catch (err) {
      // bubble up to parent toast
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const cfg = ROLE_CONFIG[targetUser.role] || defaultRole;

  return (
    <div className="flex flex-col max-h-[80vh]">

      {/* User info strip */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100 rounded-t-2xl">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${cfg.avatar} flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm`}>
          {getInitials(targetUser.username)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-800 text-sm leading-tight truncate">{targetUser.username}</p>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${cfg.pill}`}>
            <cfg.icon size={9} />
            {cfg.label}
          </span>
        </div>

        {isAdmin ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-bold flex-shrink-0">
            <Lock size={11} />
            Full Access
          </span>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={grantAll}  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">Grant All</button>
            <button onClick={revokeAll} className="text-[10px] font-bold text-red-500    hover:text-red-700    hover:bg-red-50    px-2 py-1 rounded-lg transition-colors">Revoke All</button>
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="px-5 py-8 text-center flex flex-col items-center gap-3 text-gray-400">
          <Shield size={32} className="text-amber-300" />
          <p className="text-sm font-semibold text-gray-500">Admin accounts have unrestricted access to all features.</p>
          <p className="text-xs text-gray-400">Permissions cannot be configured for admin users.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {PERMISSION_GROUPS.map((group, idx) => {
            const c = GROUP_COLORS[group.color] || GROUP_COLORS.blue;
            const allOn  = group.items.every((i) => pending.has(i.key));
            const noneOn = group.items.every((i) => !pending.has(i.key));
            // Insert a visual divider whenever the area changes
            const prevArea = idx > 0 ? PERMISSION_GROUPS[idx - 1].area : group.area;
            const showDivider = idx > 0 && group.area !== prevArea;
            return (
              <React.Fragment key={group.key}>
                {showDivider && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest px-1">
                      Selling Counter
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
              <div className={`rounded-xl border overflow-hidden ${c.header}`}>
                {/* Group header */}
                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${c.header}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.badge}`} />
                    <span className="text-xs font-black text-gray-700 uppercase tracking-wider">{group.label}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">{group.desc}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!allOn  && <button onClick={() => grantGroup(group.items)}  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 px-1.5 py-0.5 rounded transition-colors">All</button>}
                    {!noneOn && <button onClick={() => revokeGroup(group.items)} className="text-[10px] font-bold text-red-500    hover:text-red-700    px-1.5 py-0.5 rounded transition-colors">None</button>}
                  </div>
                </div>

                {/* Permission rows */}
                <div className="bg-white divide-y divide-gray-50">
                  {group.items.map((item) => {
                    const isOn = pending.has(item.key);
                    return (
                      <div
                        key={item.key}
                        onClick={() => toggle(item.key)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50/40 transition-colors ${isOn ? 'bg-blue-50/20' : ''}`}
                      >
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors ${
                          isOn ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-200'
                        }`}>
                          {isOn && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold leading-tight ${isOn ? 'text-gray-800' : 'text-gray-500'}`}>
                            {item.label}
                          </p>
                          <p className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5 truncate">{item.desc}</p>
                        </div>
                        <Toggle on={isOn} onChange={() => toggle(item.key)} />
                      </div>
                    );
                  })}
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Footer actions */}
      {!isAdmin && (
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between rounded-b-2xl gap-3">
          <p className={`text-xs font-semibold ${dirty ? 'text-amber-600' : 'text-gray-400'}`}>
            {dirty ? '⚠ Unsaved changes — employee must re-login to apply.' : 'Changes take effect on employee\'s next login.'}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-5 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Access'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EmployeeManagement = () => {
  const { user: currentUser } = useAuth();

  const [users,             setUsers]             = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accessTarget,      setAccessTarget]      = useState(null);
  const [confirmDelete,     setConfirmDelete]     = useState(null); // user object to delete
  const [deleting,          setDeleting]          = useState(false);
  const [showPassword,      setShowPassword]      = useState(false);
  const [createForm,        setCreateForm]        = useState({ username: '', password: '', role: 'EMPLOYEE' });
  const [toast,             setToast]             = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data?.data ?? response.data ?? []);
    } catch {
      showToast('Failed to fetch employees', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/users', createForm);
      showToast('Employee created successfully ✓', 'success');
      setIsCreateModalOpen(false);
      setCreateForm({ username: '', password: '', role: 'EMPLOYEE' });
      setShowPassword(false);
      fetchUsers();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to create employee', 'error');
    }
  };

  /** Called when AccessPanel saves — update the local users list without a full refetch. */
  const handlePermissionsSaved = (userId, newPermissions) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, permissions: newPermissions } : u))
    );
    showToast('Access permissions updated ✓', 'success');
    setAccessTarget(null);
  };

  const handleAccessSave = async (newPerms) => {
    if (!accessTarget) return;
    try {
      handlePermissionsSaved(accessTarget.id, newPerms);
    } catch {
      showToast('Failed to update permissions', 'error');
    }
  };

  const handleDeleteEmployee = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteEmployee(confirmDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
      showToast(`${confirmDelete.username} has been removed ✓`, 'success');
      setConfirmDelete(null);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete employee', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const adminCount    = users.filter((u) => u.role === 'ADMIN').length;
  const employeeCount = users.filter((u) => u.role === 'EMPLOYEE').length;

  return (
    <div className="p-6 space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">Employee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage staff accounts and role-based access</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all"
        >
          <UserPlus size={16} />
          Add Employee
        </button>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Users size={18} />}  label="Total Members" value={loading ? '—' : users.length} accent="slate" />
        <StatCard icon={<Shield size={18} />} label="Admins"         value={loading ? '—' : adminCount}    accent="amber" />
        <StatCard icon={<User size={18} />}   label="Employees"      value={loading ? '—' : employeeCount} accent="blue"  />
      </div>

      {/* ── Employee Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Staff Directory</span>
          {!loading && (
            <span className="text-xs text-gray-400 font-semibold">{users.length} member{users.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider font-black">
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Access</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">

              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-3.5 w-6 bg-gray-100 rounded" /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex-shrink-0" />
                        <div className="h-3.5 w-32 bg-gray-100 rounded" />
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="h-5 w-20 bg-gray-100 rounded-full" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-16 bg-gray-100 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-24 bg-gray-100 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-7 w-24 bg-gray-100 rounded-lg mx-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-300">
                      <Users size={36} />
                      <p className="text-sm font-semibold text-gray-400">No employees yet</p>
                      <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-xs font-bold text-blue-500 hover:text-blue-700 underline underline-offset-2"
                      >
                        Add the first employee
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user, idx) => {
                  const cfg       = ROLE_CONFIG[user.role] || defaultRole;
                  const RoleIcon  = cfg.icon;
                  const isAdmin   = user.role === 'ADMIN';
                  const permCount = Array.isArray(user.permissions) ? user.permissions.length : 0;

                  return (
                    <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">

                      {/* # */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-gray-300">#{idx + 1}</span>
                      </td>

                      {/* Name + avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${cfg.avatar} flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm`}>
                            {getInitials(user.username)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 leading-tight">{user.username}</p>
                            <p className="text-[10px] text-gray-400 font-semibold">ID #{user.id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.pill}`}>
                          <RoleIcon size={11} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Permission count */}
                      <td className="px-5 py-3.5">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                            <Lock size={11} /> Full Access
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                            permCount > 0 ? 'text-emerald-600' : 'text-red-400'
                          }`}>
                            {permCount > 0 ? <Unlock size={11} /> : <Lock size={11} />}
                            {permCount} / {ALL_PERMISSION_KEYS.length} permissions
                          </span>
                        )}
                      </td>

                      {/* Joined date */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <Calendar size={12} className="flex-shrink-0" />
                          <span className="text-xs font-semibold">{fmtDate(user.created_at)}</span>
                        </div>
                      </td>

                      {/* Actions: Access + Delete */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setAccessTarget(user)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                              isAdmin
                                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                            }`}
                          >
                            <Settings2 size={12} />
                            {isAdmin ? 'View' : 'Access'}
                          </button>

                          {/* Hide delete for the currently logged-in admin's own row */}
                          {user.id !== currentUser?.id && (
                            <button
                              onClick={() => setConfirmDelete(user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all active:scale-95"
                              title="Delete employee"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Access Panel Modal ── */}
      {accessTarget && (
        <Modal
          isOpen={!!accessTarget}
          onClose={() => setAccessTarget(null)}
          title={`Access — ${accessTarget.username}`}
          maxWidth="max-w-lg"
        >
          <AccessPanel
            user={accessTarget}
            onClose={() => setAccessTarget(null)}
            onSaved={(newPerms) => handlePermissionsSaved(accessTarget.id, newPerms)}
          />
        </Modal>
      )}

      {/* ── Create Employee Modal ── */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); setShowPassword(false); }}
        title="Add New Employee"
      >
        <form onSubmit={handleCreateUser} className="space-y-5">

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              required
              placeholder="e.g. ramesh_kumar"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-gray-50 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Set a strong password"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-11 text-sm text-gray-800 bg-gray-50 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'EMPLOYEE', label: 'Employee', desc: 'Standard floor access', Icon: User,   cfg: ROLE_CONFIG.EMPLOYEE },
                { value: 'ADMIN',    label: 'Admin',    desc: 'Full system access',   Icon: Shield, cfg: ROLE_CONFIG.ADMIN    },
              ].map(({ value, label, desc, Icon, cfg }) => {
                const selected = createForm.role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, role: value })}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                      selected
                        ? value === 'ADMIN'
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-blue-400 bg-blue-50'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={selected ? (value === 'ADMIN' ? 'text-amber-600' : 'text-blue-600') : 'text-gray-400'} />
                      <span className={`text-sm font-black ${selected ? (value === 'ADMIN' ? 'text-amber-700' : 'text-blue-700') : 'text-gray-500'}`}>{label}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold leading-tight">{desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setIsCreateModalOpen(false); setShowPassword(false); }}
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              Create Employee
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <Modal
          isOpen={!!confirmDelete}
          onClose={() => !deleting && setConfirmDelete(null)}
          title="Delete Employee"
          maxWidth="max-w-sm"
        >
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">This action cannot be undone.</p>
                <p className="text-xs text-red-500 mt-1 leading-relaxed">
                  The account for <span className="font-black">"{confirmDelete.username}"</span> will be permanently deleted.
                  They will immediately lose all access to the system.
                </p>
              </div>
            </div>

            {/* User preview */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
              {(() => {
                const cfg = ROLE_CONFIG[confirmDelete.role] || defaultRole;
                return (
                  <>
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${cfg.avatar} flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm`}>
                      {getInitials(confirmDelete.username)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{confirmDelete.username}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.pill}`}>
                        <cfg.icon size={9} />{cfg.label}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEmployee}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast((t) => ({ ...t, show: false }))}
        />
      )}
    </div>
  );
};

export default EmployeeManagement;
