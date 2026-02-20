import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Loader2, Edit2, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../ipc';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Account } from '../store';

export function AccountsPage() {
    const { activeCompany, addToast } = useAppStore();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterType, setFilterType] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);

    useEffect(() => {
        if (activeCompany) loadAccounts();
    }, [activeCompany]);

    async function loadAccounts() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const accs = await getAccounts(activeCompany.uuid);
            setAccounts(accs);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load accounts: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    const filteredAccounts = accounts.filter(acc => {
        if (filterType && acc.account_type !== filterType) return false;
        if (searchTerm && !acc.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    const grouped = filteredAccounts.reduce<Record<string, Account[]>>((groups, acc) => {
        const key = acc.account_type.charAt(0).toUpperCase() + acc.account_type.slice(1);
        if (!groups[key]) groups[key] = [];
        groups[key].push(acc);
        return groups;
    }, {});

    const typeColors: Record<string, string> = {
        Asset: 'var(--color-primary-400)',
        Liability: 'var(--color-danger-500)',
        Equity: 'var(--color-accent-400)',
        Income: 'var(--color-success-500)',
        Expense: 'var(--color-warning-500)',
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Chart of Accounts</h1>
                    <p className="page-header__subtitle">{accounts.length} accounts • Indian Schedule III</p>
                </div>
                <button className="btn btn--accent" onClick={() => setShowCreate(true)}>
                    <Plus size={16} /> Add Account
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div className="input-group" style={{ flex: 1, maxWidth: 320 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            className="input"
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search accounts..."
                            style={{ paddingLeft: 32, width: '100%' }}
                        />
                    </div>
                </div>
                {['', 'asset', 'liability', 'equity', 'income', 'expense'].map(type => (
                    <button
                        key={type}
                        className={`btn ${filterType === type ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                        onClick={() => setFilterType(type)}
                    >
                        {type ? type.charAt(0).toUpperCase() + type.slice(1) : 'All'}
                    </button>
                ))}
            </div>

            {/* Grouped Accounts */}
            {loading ? (
                <div className="empty-state">
                    <Loader2 size={24} className="spinner" />
                    <p style={{ marginTop: 'var(--space-2)' }}>Loading accounts...</p>
                </div>
            ) : (
                Object.entries(grouped).map(([type, accs], i) => (
                    <motion.div
                        key={type}
                        className="card"
                        style={{ marginBottom: 'var(--space-4)' }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <div style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 'var(--radius-full)',
                                    background: typeColors[type] || 'var(--text-tertiary)',
                                }} />
                                <span style={{ fontWeight: 600 }}>{type}</span>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                    ({accs.length})
                                </span>
                            </div>
                        </div>
                        <div className="card__body" style={{ padding: 0 }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Account Name</th>
                                        <th>ID</th>
                                        <th>Group</th>
                                        <th>System</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accs.map(acc => (
                                        <tr key={acc.account_id} className="group-row">
                                            <td style={{ fontWeight: 500 }}>{acc.name}</td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                                {acc.account_id}
                                            </td>
                                            <td style={{ fontSize: 'var(--text-xs)' }}>{acc.group_code || '—'}</td>
                                            <td>
                                                {acc.is_system && (
                                                    <span className="badge badge--draft">System</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                                                    <button
                                                        className="btn btn--sm btn--secondary"
                                                        onClick={() => setEditingAccount(acc)}
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    {!acc.is_system && (
                                                        <button
                                                            className="btn btn--sm btn--secondary"
                                                            style={{ color: 'var(--color-danger-500)' }}
                                                            onClick={async () => {
                                                                if (await confirm(`Delete account "${acc.name}"?`)) {
                                                                    try {
                                                                        await deleteAccount(activeCompany!.uuid, acc.account_id);
                                                                        addToast({ type: 'success', message: 'Account deleted' });
                                                                        loadAccounts();
                                                                    } catch (err: any) {
                                                                        addToast({ type: 'error', message: `Cannot delete: ${err}` });
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                ))
            )}

            {showCreate && (
                <CreateAccountModal
                    accounts={accounts}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { loadAccounts(); setShowCreate(false); }}
                />
            )}

            {editingAccount && (
                <EditAccountModal
                    account={editingAccount}
                    accounts={accounts}
                    onClose={() => setEditingAccount(null)}
                    onUpdated={() => { loadAccounts(); setEditingAccount(null); }}
                />
            )}
        </div>
    );
}

function CreateAccountModal({
    accounts,
    onClose,
    onCreated,
}: {
    accounts: Account[];
    onClose: () => void;
    onCreated: () => void;
}) {
    const { activeCompany, addToast } = useAppStore();
    const [name, setName] = useState('');
    const [type, setType] = useState('asset');
    const [parent, setParent] = useState('');
    const [groupCode, setGroupCode] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!activeCompany || !name.trim()) return;

        const formData = new FormData(e.target as HTMLFormElement);
        const gstin = formData.get('gstin') as string;
        const state = formData.get('state') as string;
        const address = formData.get('address') as string;
        const email = formData.get('email') as string;
        const phone = formData.get('phone') as string;

        setSubmitting(true);
        try {
            await createAccount(activeCompany.uuid, {
                name: name.trim(),
                account_type: type,
                parent_account: parent || null,
                group_code: groupCode || null,
                gstin: gstin || null,
                state: state || null,
                address: address || null,
                email: email || null,
                phone: phone || null,
            });
            addToast({ type: 'success', message: `Account "${name}" created` });
            onCreated();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed: ${err}` });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
            <motion.div
                className="modal"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="modal__title">Add New Account</h2>
                <form onSubmit={handleSubmit}>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Account Name *</label>
                        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prepaid Insurance" required autoFocus />
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Account Type *</label>
                        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                            <option value="asset">Asset</option>
                            <option value="liability">Liability</option>
                            <option value="equity">Equity</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                        </select>
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Parent Account (optional)</label>
                        <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
                            <option value="">No parent</option>
                            {accounts.filter(a => a.account_type === type).map(acc => (
                                <option key={acc.account_id} value={acc.account_id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Group Code (optional)</label>
                        <input className="input" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} placeholder="e.g. 1100" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">GSTIN (optional)</label>
                            <input className="input" placeholder="27ABCDE1234F1Z5" name="gstin" />
                        </div>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">State (optional)</label>
                            <input className="input" placeholder="Maharashtra" name="state" />
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Address (optional)</label>
                        <textarea className="input" rows={2} placeholder="Billing Address" name="address" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">Email (optional)</label>
                            <input className="input" type="email" placeholder="client@example.com" name="email" />
                        </div>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">Phone (optional)</label>
                            <input className="input" type="tel" placeholder="+91 9876543210" name="phone" />
                        </div>
                    </div>
                    <div className="modal__actions">
                        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn--accent" disabled={submitting}>
                            {submitting ? 'Creating...' : 'Create Account'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}

function EditAccountModal({
    account,
    accounts,
    onClose,
    onUpdated,
}: {
    account: Account;
    accounts: Account[];
    onClose: () => void;
    onUpdated: () => void;
}) {
    const { activeCompany, addToast } = useAppStore();
    const [name, setName] = useState(account.name);
    const [type] = useState(account.account_type);
    const [parent, setParent] = useState(account.parent_account || '');
    const [groupCode, setGroupCode] = useState(account.group_code || '');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!activeCompany || !name.trim()) return;

        const formData = new FormData(e.target as HTMLFormElement);
        const gstin = formData.get('gstin') as string;
        const state = formData.get('state') as string;
        const address = formData.get('address') as string;
        const email = formData.get('email') as string;
        const phone = formData.get('phone') as string;

        setSubmitting(true);
        try {
            await updateAccount(activeCompany.uuid, {
                account_id: account.account_id,
                name: name.trim(),
                account_type: type,
                parent_account: parent || null,
                group_code: groupCode || null,
                gstin: gstin || null,
                state: state || null,
                address: address || null,
                email: email || null,
                phone: phone || null,
            });
            addToast({ type: 'success', message: `Account updated` });
            onUpdated();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed: ${err}` });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
            <motion.div
                className="modal"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="modal__title">Edit Account</h2>
                <form onSubmit={handleSubmit}>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Account Name *</label>
                        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Account Type (Fixed)</label>
                        <select className="input" value={type} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }}>
                            <option value="asset">Asset</option>
                            <option value="liability">Liability</option>
                            <option value="equity">Equity</option>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                        </select>
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Parent Account</label>
                        <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
                            <option value="">No parent</option>
                            {accounts
                                .filter(a => a.account_type === type && a.account_id !== account.account_id)
                                .map(acc => (
                                    <option key={acc.account_id} value={acc.account_id}>{acc.name}</option>
                                ))}
                        </select>
                    </div>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Group Code</label>
                        <input className="input" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">GSTIN</label>
                            <input className="input" defaultValue={account.gstin || ''} name="gstin" />
                        </div>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">State</label>
                            <input className="input" defaultValue={account.state || ''} name="state" />
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Address</label>
                        <textarea className="input" rows={2} defaultValue={account.address || ''} name="address" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">Email</label>
                            <input className="input" type="email" defaultValue={account.email || ''} name="email" />
                        </div>
                        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="input-group__label">Phone</label>
                            <input className="input" type="tel" defaultValue={account.phone || ''} name="phone" />
                        </div>
                    </div>
                    <div className="modal__actions">
                        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn--primary" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
