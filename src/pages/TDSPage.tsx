import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    FileText, CheckCircle, Clock, AlertTriangle, Plus, X, RefreshCw,
    BarChart2, Receipt, Save
} from 'lucide-react';
import { useAppStore } from '../store';

interface TdsSection {
    section_code: string;
    description: string;
    threshold_single: number;
    threshold_annual: number;
    rate_individual: number;
    rate_company: number;
}

interface TdsDeduction {
    deduction_id: string;
    entry_id?: string;
    section_code: string;
    party_account_id: string;
    party_name: string;
    payment_amount: number;
    tds_rate: number;
    tds_amount: number;
    pan?: string;
    deposit_status: 'pending' | 'deposited';
    challan_no?: string;
    deposit_date?: string;
    period_month: number;
    period_year: number;
    created_at: string;
}

interface TdsLiabilitySummary {
    section_code: string;
    description: string;
    total_payment: number;
    total_tds: number;
    total_deposited: number;
    total_pending: number;
    deductions_count: number;
}

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n);

const now = new Date();

export function TDSPage() {
    const { activeCompany } = useAppStore();
    const uuid = activeCompany?.uuid ?? '';

    const [tab, setTab] = useState<'register' | 'liability'>('register');
    const [sections, setSections] = useState<TdsSection[]>([]);
    const [deductions, setDeductions] = useState<TdsDeduction[]>([]);
    const [liability, setLiability] = useState<TdsLiabilitySummary[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState('');

    // Record TDS modal
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        section_code: '',
        party_name: '',
        party_account_id: '',
        payment_amount: '',
        tds_rate: '',
        tds_amount: '',
        pan: '',
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
    });

    // Deposit modal
    const [depositTarget, setDepositTarget] = useState<TdsDeduction | null>(null);
    const [challanNo, setChallanNo] = useState('');
    const [depositDate, setDepositDate] = useState(now.toISOString().split('T')[0]);

    const fetchAll = useCallback(async () => {
        if (!uuid) return;
        setLoading(true);
        try {
            const [s, d, l] = await Promise.all([
                invoke<TdsSection[]>('get_tds_sections', { uuid }),
                invoke<TdsDeduction[]>('get_tds_deductions', {
                    uuid,
                    status: filterStatus || null,
                    fromDate: null,
                    toDate: null,
                }),
                invoke<TdsLiabilitySummary[]>('get_tds_liability_report', {
                    uuid,
                    fromDate: null,
                    toDate: null,
                }),
            ]);
            setSections(s);
            setDeductions(d);
            setLiability(l);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [uuid, filterStatus]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Auto-calculate TDS when section or amount changes
    const handleSectionChange = (code: string) => {
        const sec = sections.find(s => s.section_code === code);
        const rate = sec ? sec.rate_individual : 0;
        const amt = parseFloat(form.payment_amount) || 0;
        setForm(f => ({
            ...f,
            section_code: code,
            tds_rate: String(rate),
            tds_amount: amt > 0 ? String(((amt * rate) / 100).toFixed(2)) : '',
        }));
    };

    const handleAmountChange = (val: string) => {
        const amt = parseFloat(val) || 0;
        const rate = parseFloat(form.tds_rate) || 0;
        setForm(f => ({
            ...f,
            payment_amount: val,
            tds_amount: amt > 0 && rate > 0 ? String(((amt * rate) / 100).toFixed(2)) : f.tds_amount,
        }));
    };

    const handleSubmitDeduction = async () => {
        try {
            await invoke('create_tds_deduction', {
                uuid,
                req: {
                    entry_id: null,
                    section_code: form.section_code,
                    party_account_id: form.party_account_id || form.party_name,
                    party_name: form.party_name,
                    payment_amount: parseFloat(form.payment_amount),
                    tds_rate: parseFloat(form.tds_rate),
                    tds_amount: parseFloat(form.tds_amount),
                    pan: form.pan || null,
                    period_month: form.period_month,
                    period_year: form.period_year,
                },
            });
            setShowForm(false);
            setForm({
                section_code: '', party_name: '', party_account_id: '',
                payment_amount: '', tds_rate: '', tds_amount: '', pan: '',
                period_month: now.getMonth() + 1, period_year: now.getFullYear(),
            });
            fetchAll();
        } catch (e: unknown) {
            alert(`Error: ${e}`);
        }
    };

    const handleDeposit = async () => {
        if (!depositTarget) return;
        try {
            await invoke('mark_tds_deposited', {
                uuid,
                deductionId: depositTarget.deduction_id,
                challanNo,
                depositDate,
            });
            setDepositTarget(null);
            fetchAll();
        } catch (e: unknown) {
            alert(`Error: ${e}`);
        }
    };

    const totalPending = liability.reduce((s, r) => s + r.total_pending, 0);
    const totalDeposited = liability.reduce((s, r) => s + r.total_deposited, 0);

    return (
        <div className="page-padding">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">
                        <FileText size={24} />
                        TDS Management
                    </h1>
                    <p className="page-header__subtitle">Tax Deducted at Source — Track, Record & Deposit</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--ghost" onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button className="btn btn--primary" onClick={() => setShowForm(true)}>
                        <Plus size={16} /> Record TDS
                    </button>
                </div>
            </div>

            {/* Summary KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-4)', margin: 'var(--space-4) 0' }}>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Pending Deposit</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-warning)' }}>₹{fmt(totalPending)}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Total Deposited</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-success)' }}>₹{fmt(totalDeposited)}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Deductions Recorded</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{deductions.length}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
                {(['register', 'liability'] as const).map(t => (
                    <button
                        key={t}
                        className={`tab ${tab === t ? 'tab--active' : ''}`}
                        onClick={() => setTab(t)}
                    >
                        {t === 'register' ? <><Receipt size={14} /> TDS Register</> : <><BarChart2 size={14} /> Liability Report</>}
                    </button>
                ))}
            </div>

            {tab === 'register' && (
                <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 'var(--space-3)' }}>
                        <select
                            style={{ width: 180 }}
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="deposited">Deposited</option>
                        </select>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Party</th>
                                <th>Section</th>
                                <th>Period</th>
                                <th>Payment</th>
                                <th>Rate</th>
                                <th>TDS Amount</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deductions.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No TDS deductions recorded yet.</td></tr>
                            ) : deductions.map(d => (
                                <tr key={d.deduction_id}>
                                    <td>
                                        <strong>{d.party_name}</strong>
                                        {d.pan && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>PAN: {d.pan}</div>}
                                    </td>
                                    <td>
                                        <span className="badge badge--secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                                            {d.section_code}
                                        </span>
                                    </td>
                                    <td>{MONTHS[d.period_month - 1]} {d.period_year}</td>
                                    <td>₹{fmt(d.payment_amount)}</td>
                                    <td>{d.tds_rate}%</td>
                                    <td><strong>₹{fmt(d.tds_amount)}</strong></td>
                                    <td>
                                        {d.deposit_status === 'deposited' ? (
                                            <span className="badge badge--success">
                                                <CheckCircle size={12} /> Deposited
                                            </span>
                                        ) : (
                                            <span className="badge badge--warning">
                                                <Clock size={12} /> Pending
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {d.deposit_status === 'pending' && (
                                            <button className="btn btn--ghost btn--sm" onClick={() => setDepositTarget(d)}>
                                                Mark Deposited
                                            </button>
                                        )}
                                        {d.challan_no && (
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                                Challan: {d.challan_no}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'liability' && (
                <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>Description</th>
                                <th>Payments</th>
                                <th>Total TDS</th>
                                <th>Deposited</th>
                                <th>Pending</th>
                                <th>#</th>
                            </tr>
                        </thead>
                        <tbody>
                            {liability.length === 0 ? (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No TDS recorded yet.</td></tr>
                            ) : liability.map(r => (
                                <tr key={r.section_code}>
                                    <td><code>{r.section_code}</code></td>
                                    <td>{r.description}</td>
                                    <td>₹{fmt(r.total_payment)}</td>
                                    <td><strong>₹{fmt(r.total_tds)}</strong></td>
                                    <td style={{ color: 'var(--color-success)' }}>₹{fmt(r.total_deposited)}</td>
                                    <td style={{ color: r.total_pending > 0 ? 'var(--color-warning)' : undefined, fontWeight: r.total_pending > 0 ? 700 : 400 }}>
                                        {r.total_pending > 0 && <AlertTriangle size={12} style={{ marginRight: 4 }} />}
                                        ₹{fmt(r.total_pending)}
                                    </td>
                                    <td>{r.deductions_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Record TDS Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3><Plus size={18} /> Record TDS Deduction</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setShowForm(false)}><X size={18} /></button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <div className="input-group">
                                <label>TDS Section</label>
                                <select value={form.section_code} onChange={e => handleSectionChange(e.target.value)}>
                                    <option value="">Select section…</option>
                                    {sections.map(s => (
                                        <option key={s.section_code} value={s.section_code}>{s.section_code} — {s.description}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Party / Vendor Name</label>
                                <input value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} placeholder="e.g. ABC Consultants Pvt Ltd" />
                            </div>
                            <div className="input-group">
                                <label>PAN (optional)</label>
                                <input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="AAAAA9999A" maxLength={10} style={{ fontFamily: 'var(--font-mono)' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>Payment Amount (₹)</label>
                                    <input type="number" value={form.payment_amount} onChange={e => handleAmountChange(e.target.value)} placeholder="0.00" />
                                </div>
                                <div className="input-group">
                                    <label>TDS Rate (%)</label>
                                    <input type="number" value={form.tds_rate} onChange={e => setForm(f => ({ ...f, tds_rate: e.target.value }))} placeholder="10" />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>TDS Amount (₹)</label>
                                <input type="number" value={form.tds_amount} onChange={e => setForm(f => ({ ...f, tds_amount: e.target.value }))} style={{ fontWeight: 700 }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>Period Month</label>
                                    <select value={form.period_month} onChange={e => setForm(f => ({ ...f, period_month: Number(e.target.value) }))}>
                                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>Period Year</label>
                                    <input type="number" value={form.period_year} onChange={e => setForm(f => ({ ...f, period_year: Number(e.target.value) }))} />
                                </div>
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleSubmitDeduction} disabled={!form.section_code || !form.party_name || !form.tds_amount}>
                                <Save size={16} /> Record Deduction
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deposit Modal */}
            {depositTarget && (
                <div className="modal-overlay" onClick={() => setDepositTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3><CheckCircle size={18} /> Mark as Deposited</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setDepositTarget(null)}><X size={18} /></button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                                <strong>{depositTarget.party_name}</strong> — {depositTarget.section_code}<br />
                                TDS Amount: <strong>₹{fmt(depositTarget.tds_amount)}</strong>
                            </div>
                            <div className="input-group">
                                <label>Challan Number</label>
                                <input value={challanNo} onChange={e => setChallanNo(e.target.value)} placeholder="e.g. 12345678" />
                            </div>
                            <div className="input-group">
                                <label>Deposit Date</label>
                                <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--ghost" onClick={() => setDepositTarget(null)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleDeposit} disabled={!challanNo}>
                                <CheckCircle size={16} /> Confirm Deposit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
