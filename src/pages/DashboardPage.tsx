import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Wallet, Building2,
    Clock, ArrowRight, Plus, FileText, PieChart
} from 'lucide-react';
import { useAppStore } from '../store';
import { getDashboardStats, getLedger } from '../ipc';
import type { DashboardStats } from '../ipc';
import type { JournalEntry, AppView } from '../store';

function KPICard({ title, value, icon: Icon, color, delay }: {
    title: string;
    value: string;
    icon: any;
    color: string;
    delay: number;
}) {
    return (
        <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            style={{ borderLeft: `4px solid ${color}` }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                <div className="stat-card__label">{title}</div>
                <div style={{
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-full)',
                    background: `${color}15`,
                    color: color
                }}>
                    <Icon size={18} />
                </div>
            </div>
            <div className="stat-card__value" style={{ fontSize: 'var(--text-2xl)' }}>
                ₹ {parseFloat(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        </motion.div>
    );
}

export function DashboardPage({ onNavigate }: { onNavigate: (page: AppView) => void }) {
    const { activeCompany } = useAppStore();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentActivity, setRecentActivity] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (activeCompany) loadDashboard();
    }, [activeCompany]);

    async function loadDashboard() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const [s, ledger] = await Promise.all([
                getDashboardStats(activeCompany.uuid),
                getLedger(activeCompany.uuid, { limit: 5, offset: 0 })
            ]);
            setStats(s);
            setRecentActivity(ledger.entries);
        } catch (err) {
            console.error("Failed to load dashboard:", err);
        } finally {
            setLoading(false);
        }
    }

    if (loading || !stats) {
        return (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                Loading dashboard...
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Dashboard</h1>
                    <p className="page-header__subtitle">Overview of {activeCompany?.company_name}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn--accent" onClick={() => onNavigate('voucher')}>
                        <Plus size={16} /> New Voucher
                    </button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="stat-grid" style={{ marginBottom: 'var(--space-8)' }}>
                <KPICard
                    title="Cash Balance"
                    value={stats.cash_balance}
                    icon={Wallet}
                    color="var(--color-primary-500)"
                    delay={0}
                />
                <KPICard
                    title="Bank Balance"
                    value={stats.bank_balance}
                    icon={Building2}
                    color="var(--color-accent-500)"
                    delay={0.1}
                />
                <KPICard
                    title="Monthly Income"
                    value={stats.monthly_income}
                    icon={TrendingUp}
                    color="var(--color-success-500)"
                    delay={0.2}
                />
                <KPICard
                    title="Monthly Expenses"
                    value={stats.monthly_expense}
                    icon={TrendingDown}
                    color="var(--color-danger-500)"
                    delay={0.3}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
                {/* Recent Activity */}
                <div className="card">
                    <div className="card__header">
                        <div style={{ fontWeight: 600 }}>Recent Activity</div>
                        <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => onNavigate('ledger')}
                        >
                            View All <ArrowRight size={14} />
                        </button>
                    </div>
                    <div className="card__body" style={{ padding: 0 }}>
                        {recentActivity.length === 0 ? (
                            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                No recent transactions.
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Voucher No</th>
                                        <th>Narration</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentActivity.map(entry => (
                                        <tr key={entry.entry_id}>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                                                {entry.date}
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                                                {entry.voucher_number}
                                            </td>
                                            <td>{entry.narration}</td>
                                            <td>
                                                <span className="badge" style={{ textTransform: 'capitalize' }}>
                                                    {entry.voucher_type.replace('_', ' ')}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Quick Actions & Alerts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                    {/* Pending Approvals Alert */}
                    {stats.pending_approvals > 0 ? (
                        <motion.div
                            className="card"
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            style={{
                                background: 'var(--color-warning-50)',
                                border: '1px solid var(--color-warning-200)'
                            }}
                        >
                            <div style={{ padding: 'var(--space-4)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-warning-700)', marginBottom: 'var(--space-2)' }}>
                                    <Clock size={20} />
                                    <div style={{ fontWeight: 600 }}>Pending Approvals</div>
                                </div>
                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning-800)', marginBottom: 'var(--space-3)' }}>
                                    You have {stats.pending_approvals} transactions waiting for approval.
                                </p>
                                <button
                                    className="btn btn--sm"
                                    style={{ background: 'var(--color-warning-500)', color: 'white', border: 'none' }}
                                    onClick={() => onNavigate('approvals')}
                                >
                                    Review Now
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            <div style={{ marginBottom: 'var(--space-2)' }}><Clock size={24} /></div>
                            <div>No pending approvals</div>
                        </div>
                    )}

                    {/* Shortcuts */}
                    <div className="card">
                        <div className="card__header">
                            <div style={{ fontWeight: 600 }}>Quick Shortcuts</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            <button className="btn btn--secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('reports')}>
                                <FileText size={16} /> Financial Reports
                            </button>
                            <button className="btn btn--secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('ledger')}>
                                <FileText size={16} /> Day Book
                            </button>
                            <button className="btn btn--secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('reports')}>
                                <PieChart size={16} /> GST Returns
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
