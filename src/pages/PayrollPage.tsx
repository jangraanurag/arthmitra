import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Users, Plus, X, RefreshCw, Play, CheckCircle,
    User, Briefcase, Settings, Save
} from 'lucide-react';
import { useAppStore } from '../store';

interface Employee {
    employee_id: string;
    name: string;
    designation: string;
    department: string;
    doj: string;
    pan?: string;
    pf_number?: string;
    esi_number?: string;
    bank_name?: string;
    bank_account?: string;
    bank_ifsc?: string;
    status: string;
}

interface SalaryStructure {
    structure_id: string;
    employee_id: string;
    effective_from: string;
    basic: number;
    hra: number;
    conveyance: number;
    special: number;
    other_earnings: number;
    pf_applicable: boolean;
    esi_applicable: boolean;
    pt_applicable: boolean;
}

interface PayrollRun {
    run_id: string;
    period_month: number;
    period_year: number;
    status: string;
    processed_at?: string;
    created_at: string;
}

interface PayrollEntry {
    entry_id: string;
    run_id: string;
    employee_id: string;
    employee_name: string;
    basic: number;
    hra: number;
    conveyance: number;
    special: number;
    other_earnings: number;
    gross: number;
    pf_employee: number;
    pf_employer: number;
    esi_employee: number;
    esi_employer: number;
    pt: number;
    tds: number;
    other_deductions: number;
    total_deductions: number;
    net_pay: number;
    journal_entry_id?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n);
const now = new Date();

const EMPTY_EMP = {
    name: '', designation: '', department: '',
    doj: now.toISOString().split('T')[0],
    pan: '', pf_number: '', esi_number: '',
    bank_name: '', bank_account: '', bank_ifsc: '',
};
const EMPTY_SAL = {
    basic: '', hra: '', conveyance: '', special: '', other_earnings: '',
    pf_applicable: true, esi_applicable: true, pt_applicable: true,
    effective_from: now.toISOString().split('T')[0],
};

export function PayrollPage() {
    const { activeCompany } = useAppStore();
    const uuid = activeCompany?.uuid ?? '';

    const [tab, setTab] = useState<'employees' | 'run' | 'history'>('employees');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(false);

    // Employee form
    const [showEmpForm, setShowEmpForm] = useState(false);
    const [editEmp, setEditEmp] = useState<Employee | null>(null);
    const [empForm, setEmpForm] = useState({ ...EMPTY_EMP });

    // Salary structure drawer
    const [salEmp, setSalEmp] = useState<Employee | null>(null);
    const [salForm, setSalForm] = useState({ ...EMPTY_SAL });

    // Payroll run state
    const [runMonth, setRunMonth] = useState(now.getMonth() + 1);
    const [runYear, setRunYear] = useState(now.getFullYear());
    const [computing, setComputing] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [computedRun, setComputedRun] = useState<PayrollRun | null>(null);
    const [computedEntries, setComputedEntries] = useState<PayrollEntry[]>([]);

    const fetchAll = useCallback(async () => {
        if (!uuid) return;
        setLoading(true);
        try {
            const [emps, rs] = await Promise.all([
                invoke<Employee[]>('get_employees', { uuid }),
                invoke<PayrollRun[]>('get_payroll_runs', { uuid }),
            ]);
            setEmployees(emps);
            setRuns(rs);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [uuid]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const openAddEmp = () => { setEditEmp(null); setEmpForm({ ...EMPTY_EMP }); setShowEmpForm(true); };
    const openEditEmp = (emp: Employee) => {
        setEditEmp(emp);
        setEmpForm({
            name: emp.name, designation: emp.designation, department: emp.department,
            doj: emp.doj, pan: emp.pan ?? '', pf_number: emp.pf_number ?? '',
            esi_number: emp.esi_number ?? '', bank_name: emp.bank_name ?? '',
            bank_account: emp.bank_account ?? '', bank_ifsc: emp.bank_ifsc ?? '',
        });
        setShowEmpForm(true);
    };

    const handleSaveEmp = async () => {
        try {
            const req = {
                name: empForm.name, designation: empForm.designation,
                department: empForm.department, doj: empForm.doj,
                pan: empForm.pan || null, pf_number: empForm.pf_number || null,
                esi_number: empForm.esi_number || null, bank_name: empForm.bank_name || null,
                bank_account: empForm.bank_account || null, bank_ifsc: empForm.bank_ifsc || null,
            };
            if (editEmp) {
                await invoke('update_employee', { uuid, employeeId: editEmp.employee_id, req });
            } else {
                await invoke('create_employee', { uuid, req });
            }
            setShowEmpForm(false);
            fetchAll();
        } catch (e: unknown) { alert(`Error: ${e}`); }
    };

    const openSalary = async (emp: Employee) => {
        setSalEmp(emp);
        try {
            const sal = await invoke<SalaryStructure | null>('get_salary_structure', { uuid, employeeId: emp.employee_id });
            if (sal) {
                setSalForm({
                    basic: String(sal.basic), hra: String(sal.hra),
                    conveyance: String(sal.conveyance), special: String(sal.special),
                    other_earnings: String(sal.other_earnings),
                    pf_applicable: sal.pf_applicable, esi_applicable: sal.esi_applicable,
                    pt_applicable: sal.pt_applicable,
                    effective_from: now.toISOString().split('T')[0],
                });
            } else {
                setSalForm({ ...EMPTY_SAL });
            }
        } catch (e) { console.error(e); }
    };

    const handleSaveSalary = async () => {
        if (!salEmp) return;
        try {
            await invoke('save_salary_structure', {
                uuid,
                req: {
                    employee_id: salEmp.employee_id,
                    effective_from: salForm.effective_from,
                    basic: parseFloat(salForm.basic) || 0,
                    hra: parseFloat(salForm.hra) || 0,
                    conveyance: parseFloat(salForm.conveyance) || 0,
                    special: parseFloat(salForm.special) || 0,
                    other_earnings: parseFloat(salForm.other_earnings) || 0,
                    pf_applicable: salForm.pf_applicable,
                    esi_applicable: salForm.esi_applicable,
                    pt_applicable: salForm.pt_applicable,
                },
            });
            setSalEmp(null);
        } catch (e: unknown) { alert(`Error: ${e}`); }
    };

    const handleCompute = async () => {
        setComputing(true);
        try {
            const [run, entries] = await invoke<[PayrollRun, PayrollEntry[]]>('compute_payroll', {
                uuid, month: runMonth, year: runYear,
            });
            setComputedRun(run);
            setComputedEntries(entries);
        } catch (e: unknown) { alert(`Error: ${e}`); }
        finally { setComputing(false); }
    };

    const handleProcess = async () => {
        if (!computedRun) return;
        setProcessing(true);
        try {
            await invoke('process_payroll', { uuid, runId: computedRun.run_id });
            setComputedRun(null);
            setComputedEntries([]);
            fetchAll();
            setTab('history');
        } catch (e: unknown) { alert(`Error: ${e}`); }
        finally { setProcessing(false); }
    };

    const totalGross = computedEntries.reduce((s, e) => s + e.gross, 0);
    const totalDed = computedEntries.reduce((s, e) => s + e.total_deductions, 0);
    const totalNet = computedEntries.reduce((s, e) => s + e.net_pay, 0);

    return (
        <div className="page-padding">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">
                        <Briefcase size={24} />
                        Payroll
                    </h1>
                    <p className="page-header__subtitle">Employees · Salary Structures · Monthly Processing</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--ghost" onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    {tab === 'employees' && (
                        <button className="btn btn--primary" onClick={openAddEmp}>
                            <Plus size={16} /> Add Employee
                        </button>
                    )}
                </div>
            </div>

            {/* Summary KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-4)', margin: 'var(--space-4) 0' }}>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Active Employees</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{employees.filter(e => e.status === 'active').length}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Payroll Runs</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{runs.length}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Last Run</div>
                    <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
                        {runs[0] ? `${MONTHS[runs[0].period_month - 1]} ${runs[0].period_year}` : '—'}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
                {(['employees', 'run', 'history'] as const).map(t => (
                    <button key={t} className={`tab ${tab === t ? 'tab--active' : ''}`} onClick={() => setTab(t)}>
                        {t === 'employees' ? <><Users size={14} /> Employees</>
                            : t === 'run' ? <><Play size={14} /> Run Payroll</>
                                : <><CheckCircle size={14} /> History</>}
                    </button>
                ))}
            </div>

            {/* ─── Employees Tab ─── */}
            {tab === 'employees' && (
                <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Employee</th><th>Designation</th><th>Department</th><th>DOJ</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No employees yet. Add your first employee.</td></tr>
                            ) : employees.map(emp => (
                                <tr key={emp.employee_id}>
                                    <td>
                                        <strong>{emp.name}</strong>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{emp.employee_id}</div>
                                    </td>
                                    <td>{emp.designation}</td>
                                    <td>{emp.department}</td>
                                    <td>{emp.doj}</td>
                                    <td>
                                        <span className={`badge ${emp.status === 'active' ? 'badge--success' : 'badge--secondary'}`}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                                            <button className="btn btn--ghost btn--sm" title="Edit" onClick={() => openEditEmp(emp)}>
                                                <Settings size={14} />
                                            </button>
                                            <button className="btn btn--ghost btn--sm" title="Salary Structure" onClick={() => openSalary(emp)}>
                                                <Briefcase size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── Run Payroll Tab ─── */}
            {tab === 'run' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div className="card" style={{ padding: 'var(--space-5)' }}>
                        <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', fontWeight: 600 }}>Select Period</h3>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
                            <div className="input-group" style={{ margin: 0 }}>
                                <label>Month</label>
                                <select style={{ width: 140 }} value={runMonth} onChange={e => setRunMonth(Number(e.target.value))}>
                                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div className="input-group" style={{ margin: 0 }}>
                                <label>Year</label>
                                <input style={{ width: 100 }} type="number" value={runYear} onChange={e => setRunYear(Number(e.target.value))} />
                            </div>
                            <button className="btn btn--primary" onClick={handleCompute} disabled={computing || employees.length === 0}>
                                {computing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                                {computing ? 'Computing…' : 'Compute'}
                            </button>
                        </div>
                    </div>

                    {computedEntries.length > 0 && computedRun && (
                        <div className="card">
                            <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>Payroll Preview — {MONTHS[runMonth - 1]} {runYear}</span>
                                    <span style={{ marginLeft: 12, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{computedEntries.length} employees</span>
                                </div>
                                <button className="btn btn--primary" onClick={handleProcess} disabled={processing}>
                                    {processing ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                    {processing ? 'Processing…' : 'Post to Ledger'}
                                </button>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr><th>Employee</th><th>Basic</th><th>HRA</th><th>Gross</th><th>PF (Emp)</th><th>ESI (Emp)</th><th>PT</th><th>Total Ded.</th><th>Net Pay</th></tr>
                                </thead>
                                <tbody>
                                    {computedEntries.map(e => (
                                        <tr key={e.entry_id}>
                                            <td><strong>{e.employee_name}</strong></td>
                                            <td>₹{fmt(e.basic)}</td>
                                            <td>₹{fmt(e.hra)}</td>
                                            <td><strong>₹{fmt(e.gross)}</strong></td>
                                            <td>₹{fmt(e.pf_employee)}</td>
                                            <td>₹{fmt(e.esi_employee)}</td>
                                            <td>₹{fmt(e.pt)}</td>
                                            <td style={{ color: 'var(--color-warning)' }}>₹{fmt(e.total_deductions)}</td>
                                            <td><strong style={{ color: 'var(--color-success)' }}>₹{fmt(e.net_pay)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ fontWeight: 700 }}>
                                        <td colSpan={3}>Totals</td>
                                        <td>₹{fmt(totalGross)}</td>
                                        <td colSpan={4} style={{ color: 'var(--color-warning)' }}>₹{fmt(totalDed)}</td>
                                        <td style={{ color: 'var(--color-success)' }}>₹{fmt(totalNet)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ─── History Tab ─── */}
            {tab === 'history' && (
                <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                    <table className="data-table">
                        <thead>
                            <tr><th>Period</th><th>Status</th><th>Processed At</th><th>Created At</th></tr>
                        </thead>
                        <tbody>
                            {runs.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>No payroll runs yet.</td></tr>
                            ) : runs.map(r => (
                                <tr key={r.run_id}>
                                    <td><strong>{MONTHS[r.period_month - 1]} {r.period_year}</strong></td>
                                    <td>
                                        <span className={`badge ${r.status === 'processed' ? 'badge--success' : 'badge--secondary'}`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td>{r.processed_at ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.processed_at)) : '—'}</td>
                                    <td>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(r.created_at))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── Employee Form Modal ─── */}
            {showEmpForm && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowEmpForm(false)}
                >
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3>{editEmp ? <><Settings size={18} /> Edit Employee</> : <><Plus size={18} /> Add Employee</>}</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setShowEmpForm(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <div className="input-group">
                                <label>Full Name</label>
                                <input
                                    value={empForm.name}
                                    onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Ram Kumar"
                                    required
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>Designation</label>
                                    <input
                                        value={empForm.designation}
                                        onChange={e => setEmpForm(f => ({ ...f, designation: e.target.value }))}
                                        placeholder="e.g. Manager"
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Department</label>
                                    <input
                                        value={empForm.department}
                                        onChange={e => setEmpForm(f => ({ ...f, department: e.target.value }))}
                                        placeholder="e.g. Sales"
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Date of Joining</label>
                                <input
                                    type="date"
                                    value={empForm.doj}
                                    onChange={e => setEmpForm(f => ({ ...f, doj: e.target.value }))}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>PAN</label>
                                    <input
                                        value={empForm.pan}
                                        onChange={e => setEmpForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                                        placeholder="AAAAA9999A"
                                        maxLength={10}
                                        style={{ fontFamily: 'var(--font-mono)' }}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>PF Number</label>
                                    <input
                                        value={empForm.pf_number}
                                        onChange={e => setEmpForm(f => ({ ...f, pf_number: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>ESI Number</label>
                                    <input
                                        value={empForm.esi_number}
                                        onChange={e => setEmpForm(f => ({ ...f, esi_number: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Bank Name</label>
                                    <input
                                        value={empForm.bank_name}
                                        onChange={e => setEmpForm(f => ({ ...f, bank_name: e.target.value }))}
                                        placeholder="e.g. SBI"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>Account Number</label>
                                    <input
                                        value={empForm.bank_account}
                                        onChange={e => setEmpForm(f => ({ ...f, bank_account: e.target.value }))}
                                        placeholder="Account No."
                                    />
                                </div>
                                <div className="input-group">
                                    <label>IFSC Code</label>
                                    <input
                                        value={empForm.bank_ifsc}
                                        onChange={e => setEmpForm(f => ({ ...f, bank_ifsc: e.target.value }))}
                                        placeholder="e.g. SBIN0001234"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--ghost" onClick={() => setShowEmpForm(false)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleSaveEmp} disabled={!empForm.name}>
                                <Save size={16} /> {editEmp ? 'Save Changes' : 'Add Employee'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Salary Structure Modal ─── */}
            {salEmp && (
                <div
                    className="modal-overlay"
                    onClick={() => setSalEmp(null)}
                >
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3><Briefcase size={18} /> Salary Structure — {salEmp.name}</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setSalEmp(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Earnings</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="input-group">
                                    <label>Basic (₹)</label>
                                    <input type="number" value={salForm.basic as string}
                                        onChange={e => setSalForm(f => ({ ...f, basic: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label>HRA (₹)</label>
                                    <input type="number" value={salForm.hra as string}
                                        onChange={e => setSalForm(f => ({ ...f, hra: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label>Conveyance (₹)</label>
                                    <input type="number" value={salForm.conveyance as string}
                                        onChange={e => setSalForm(f => ({ ...f, conveyance: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label>Special Allowance (₹)</label>
                                    <input type="number" value={salForm.special as string}
                                        onChange={e => setSalForm(f => ({ ...f, special: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label>Other Earnings (₹)</label>
                                    <input type="number" value={salForm.other_earnings as string}
                                        onChange={e => setSalForm(f => ({ ...f, other_earnings: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label>Effective From</label>
                                    <input type="date" value={salForm.effective_from}
                                        onChange={e => setSalForm(f => ({ ...f, effective_from: e.target.value }))} />
                                </div>
                            </div>

                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 'var(--space-2)' }}>Statutory Deductions</p>
                            {[
                                { label: 'PF Applicable (12% of Basic)', key: 'pf_applicable' },
                                { label: 'ESI Applicable (if gross ≤ ₹21,000)', key: 'esi_applicable' },
                                { label: 'Professional Tax Applicable', key: 'pt_applicable' },
                            ].map(({ label, key }) => (
                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                                    <input type="checkbox" checked={(salForm as Record<string, string | boolean>)[key] as boolean}
                                        onChange={e => setSalForm(f => ({ ...f, [key]: e.target.checked }))} />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--ghost" onClick={() => setSalEmp(null)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleSaveSalary}>
                                <Save size={16} /> Save Structure
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
