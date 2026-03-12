import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield } from 'lucide-react';
import api from '../api/axiosConfig';
import Toast from '../components/Toast';
import Modal from '../components/Modal';

const EmployeeManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'EMPLOYEE' });
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const fetchUsers = async () => {
        try {
            const response = await api.get('/auth/users');
            setUsers(response.data);
        } catch (error) {
            setToast({ show: true, message: 'Failed to fetch users', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            await api.post('/auth/users', createForm);
            setToast({ show: true, message: 'Employee created successfully', type: 'success' });
            setIsCreateModalOpen(false);
            setCreateForm({ username: '', password: '', role: 'EMPLOYEE' });
            fetchUsers();
        } catch (error) {
            setToast({ 
                show: true, 
                message: error.response?.data?.error || 'Failed to create employee', 
                type: 'error' 
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold font-outfit text-white">Employee Management</h1>
                    <p className="text-slate-400 mt-1">Create and manage access for your staff.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium border border-blue-500 shadow-lg shadow-blue-500/20"
                >
                    <UserPlus className="w-4 h-4" />
                    Add Employee
                </button>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800/50 border-b border-slate-700/50">
                                <th className="p-4 font-semibold text-slate-300">ID</th>
                                <th className="p-4 font-semibold text-slate-300">Username</th>
                                <th className="p-4 font-semibold text-slate-300">Role</th>
                                <th className="p-4 font-semibold text-slate-300">Joined Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {loading ? (
                                <tr><td colSpan="4" className="text-center p-8 text-slate-400">Loading employees...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan="4" className="text-center p-8 text-slate-400">No employees found.</td></tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-700/20 transition-colors">
                                        <td className="p-4 text-slate-400">#{user.id}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <span className="text-slate-200 font-medium">{user.username}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {user.role === 'ADMIN' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    <Shield className="w-3 h-3" />
                                                    Admin
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    Employee
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-slate-400">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create New User"
            >
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500"
                            value={createForm.username}
                            onChange={e => setCreateForm({...createForm, username: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500"
                            value={createForm.password}
                            onChange={e => setCreateForm({...createForm, password: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Role Configuration</label>
                        <select
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500"
                            value={createForm.role}
                            onChange={e => setCreateForm({...createForm, role: e.target.value})}
                        >
                            <option value="EMPLOYEE">Standard Employee</option>
                            <option value="ADMIN">System Administrator</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-2">
                            Employees have restricted dashboard access and cannot delete historical processes, whereas Administrators possess universal control.
                        </p>
                    </div>

                    <div className="pt-4 border-t border-slate-700 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsCreateModalOpen(false)}
                            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/20"
                        >
                            Create User
                        </button>
                    </div>
                </form>
            </Modal>

            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
        </div>
    );
};

export default EmployeeManagement;
