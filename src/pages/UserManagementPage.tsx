import { useState, useEffect } from 'react';
import { useAppStore, UserInfo } from '../store';
import { getUsers, createUser, updateUser, deleteUser, changePassword } from '../ipc';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Plus, Edit3, Key, Shield, UserCheck,
    UserX, X, Save, Eye, EyeOff,
} from 'lucide-react';

export function UserManagementPage() {
    const { addToast, currentUser } = useAppStore();
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
    const [changePasswordUser, setChangePasswordUser] = useState<UserInfo | null>(null);

    // Create form
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newDisplayName, setNewDisplayName] = useState('');
    const [newRole, setNewRole] = useState<string>('operator');
    const [showNewPw, setShowNewPw] = useState(false);

    // Edit form
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editRole, setEditRole] = useState('');

    // Change password form
    const [cpNewPassword, setCpNewPassword] = useState('');
    const [cpConfirm, setCpConfirm] = useState('');

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await getUsers();
            setUsers(data);
        } catch (err: any) {
            addToast({ type: 'error', message: typeof err === 'string' ? err : 'Failed to load users' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createUser(newUsername, newPassword, newDisplayName, newRole);
            addToast({ type: 'success', message: `User "${newUsername}" created.` });
            setShowCreateModal(false);
            resetCreateForm();
            loadUsers();
        } catch (err: any) {
            addToast({ type: 'error', message: typeof err === 'string' ? err : 'Failed to create user' });
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        try {
            await updateUser(editingUser.user_id, editDisplayName, editRole);
            addToast({ type: 'success', message: `User "${editingUser.username}" updated.` });
            setEditingUser(null);
            loadUsers();
        } catch (err: any) {
            addToast({ type: 'error', message: typeof err === 'string' ? err : 'Failed to update user' });
        }
    };

    const handleToggleActive = async (user: UserInfo) => {
        try {
            if (user.is_active) {
                await deleteUser(user.user_id);
                addToast({ type: 'success', message: `User "${user.username}" deactivated.` });
            } else {
                await updateUser(user.user_id, undefined, undefined, true);
                addToast({ type: 'success', message: `User "${user.username}" re-activated.` });
            }
            loadUsers();
        } catch (err: any) {
            addToast({ type: 'error', message: typeof err === 'string' ? err : 'Failed to toggle user' });
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!changePasswordUser) return;
        if (cpNewPassword !== cpConfirm) {
            addToast({ type: 'error', message: 'Passwords do not match.' });
            return;
        }
        try {
            await changePassword(changePasswordUser.user_id, cpNewPassword);
            addToast({ type: 'success', message: `Password changed for "${changePasswordUser.username}".` });
            setChangePasswordUser(null);
            setCpNewPassword('');
            setCpConfirm('');
        } catch (err: any) {
            addToast({ type: 'error', message: typeof err === 'string' ? err : 'Failed to change password' });
        }
    };

    const resetCreateForm = () => {
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewRole('operator');
    };

    const openEdit = (user: UserInfo) => {
        setEditDisplayName(user.display_name);
        setEditRole(user.role);
        setEditingUser(user);
    };

    return (
        <div className="page-padding">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">
                        <Users size={24} />
                        User Management
                    </h1>
                    <p className="page-header__subtitle">Manage application users and access roles</p>
                </div>
                <button
                    className="btn btn--primary"
                    onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
                >
                    <Plus size={16} />
                    Add User
                </button>
            </div>

            {/* Users Table */}
            <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Display Name</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th>Created</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No users found.</td></tr>
                        ) : users.map((user) => (
                            <tr key={user.user_id} style={{ opacity: user.is_active ? 1 : 0.5 }}>
                                <td><strong>{user.username}</strong></td>
                                <td>{user.display_name}</td>
                                <td>
                                    <span className={`badge ${user.role === 'admin' ? 'badge--primary' : 'badge--secondary'}`}>
                                        {user.role === 'admin' ? <Shield size={12} /> : <UserCheck size={12} />}
                                        {user.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={`badge ${user.is_active ? 'badge--success' : 'badge--danger'}`}>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>{user.last_login ? new Date(user.last_login).toLocaleString() : '—'}</td>
                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            title="Edit"
                                            onClick={() => openEdit(user)}
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            title="Change Password"
                                            onClick={() => setChangePasswordUser(user)}
                                        >
                                            <Key size={14} />
                                        </button>
                                        {user.user_id !== currentUser?.user_id && (
                                            <button
                                                className={`btn btn--ghost btn--sm ${user.is_active ? 'btn--danger-text' : ''}`}
                                                title={user.is_active ? 'Deactivate' : 'Re-activate'}
                                                onClick={() => handleToggleActive(user)}
                                            >
                                                {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Create User Modal ──────────────────────────────────────── */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowCreateModal(false)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal__header">
                                <h3><Plus size={18} /> Create User</h3>
                                <button className="btn btn--ghost btn--icon" onClick={() => setShowCreateModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <div className="input-group">
                                        <label>Username</label>
                                        <input
                                            value={newUsername}
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            placeholder="e.g. john_doe"
                                            required
                                            minLength={3}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Display Name</label>
                                        <input
                                            value={newDisplayName}
                                            onChange={(e) => setNewDisplayName(e.target.value)}
                                            placeholder="e.g. John Doe"
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Password</label>
                                        <div style={{ position: 'relative', width: '100%' }}>
                                            <input
                                                type={showNewPw ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Min 6 characters"
                                                required
                                                minLength={6}
                                            />
                                            <button
                                                type="button"
                                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                                                onClick={() => setShowNewPw(!showNewPw)}
                                            >
                                                {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label>Role</label>
                                        <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                                            <option value="operator">Operator</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal__footer">
                                    <button type="button" className="btn btn--ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn--primary">
                                        <Save size={16} /> Create User
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Edit User Modal ────────────────────────────────────────── */}
            <AnimatePresence>
                {editingUser && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setEditingUser(null)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal__header">
                                <h3><Edit3 size={18} /> Edit User — {editingUser.username}</h3>
                                <button className="btn btn--ghost btn--icon" onClick={() => setEditingUser(null)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleUpdate}>
                                <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <div className="input-group">
                                        <label>Display Name</label>
                                        <input
                                            value={editDisplayName}
                                            onChange={(e) => setEditDisplayName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Role</label>
                                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                            <option value="operator">Operator</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal__footer">
                                    <button type="button" className="btn btn--ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                                    <button type="submit" className="btn btn--primary">
                                        <Save size={16} /> Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Change Password Modal ──────────────────────────────────── */}
            <AnimatePresence>
                {changePasswordUser && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setChangePasswordUser(null)}
                    >
                        <motion.div
                            className="modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal__header">
                                <h3><Key size={18} /> Change Password — {changePasswordUser.username}</h3>
                                <button className="btn btn--ghost btn--icon" onClick={() => setChangePasswordUser(null)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleChangePassword}>
                                <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <div className="input-group">
                                        <label>New Password</label>
                                        <input
                                            type="password"
                                            value={cpNewPassword}
                                            onChange={(e) => setCpNewPassword(e.target.value)}
                                            placeholder="Min 6 characters"
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Confirm Password</label>
                                        <input
                                            type="password"
                                            value={cpConfirm}
                                            onChange={(e) => setCpConfirm(e.target.value)}
                                            placeholder="Re-enter password"
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                </div>
                                <div className="modal__footer">
                                    <button type="button" className="btn btn--ghost" onClick={() => setChangePasswordUser(null)}>Cancel</button>
                                    <button type="submit" className="btn btn--primary">
                                        <Key size={16} /> Change Password
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
