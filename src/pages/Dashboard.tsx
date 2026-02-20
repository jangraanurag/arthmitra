import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    TrendingUp, IndianRupee, BookOpen,
    ClipboardCheck, AlertTriangle, Activity, ArrowUpRight,
} from 'lucide-react';
import type { Easing } from 'framer-motion';
import { useAppStore } from '../store';
import { getLedger, getAccounts } from '../ipc';

export function Dashboard() {
    const { activeCompany, addToast, setView } = useAppStore();
    const [stats, setStats] = useState({
        totalEntries: 0,
        pendingApprovals: 0,
        totalAccounts: 0,
        recentEntries: [] as any[],
    });

    useEffect(() => {
        if (activeCompany) loadDashboardData();
    }, [activeCompany]);

    async function loadDashboardData() {
        if (!activeCompany) return;
        try {
            const [ledgerResult, accounts] = await Promise.all([
                getLedger(activeCompany.uuid, { limit: 5, offset: 0 }),
                getAccounts(activeCompany.uuid),
            ]);

            setStats({
                totalEntries: ledgerResult.total_count,
                pendingApprovals: ledgerResult.entries.filter(e => e.approval_status === 'pending_approval').length,
                totalAccounts: accounts.length,
                recentEntries: ledgerResult.entries,
            });
        } catch (err: any) {
            addToast({ type: 'error', message: `Dashboard load failed: ${err}` });
        }
    }

    const easeOut = [0.16, 1, 0.3, 1] as Easing;
    const fadeIn = (i: number) => ({
        initial: { opacity: 0, y: 15 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: i * 0.06, duration: 0.4, ease: easeOut },
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Dashboard</h1>
                    <p className="page-header__subtitle">
                        {activeCompany?.company_name} — Financial Overview
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="stat-grid">
                <motion.div className="stat-card" {...fadeIn(0)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="stat-card__label">Total Entries</span>
                        <div className="stat-card__icon stat-card__icon--blue">
                            <BookOpen size={20} />
                        </div>
                    </div>
                    <div className="stat-card__value">{stats.totalEntries}</div>
                    <div className="stat-card__change stat-card__change--neutral">
                        <Activity size={12} /> All voucher types
                    </div>
                </motion.div>

                <motion.div className="stat-card" {...fadeIn(1)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="stat-card__label">Pending Approvals</span>
                        <div className="stat-card__icon stat-card__icon--orange">
                            <ClipboardCheck size={20} />
                        </div>
                    </div>
                    <div className="stat-card__value">{stats.pendingApprovals}</div>
                    <div className="stat-card__change stat-card__change--neutral">
                        {stats.pendingApprovals > 0 ? (
                            <><AlertTriangle size={12} /> Requires CA attention</>
                        ) : (
                            <>All clear</>
                        )}
                    </div>
                </motion.div>

                <motion.div className="stat-card" {...fadeIn(2)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="stat-card__label">Active Accounts</span>
                        <div className="stat-card__icon stat-card__icon--green">
                            <IndianRupee size={20} />
                        </div>
                    </div>
                    <div className="stat-card__value">{stats.totalAccounts}</div>
                    <div className="stat-card__change stat-card__change--neutral">
                        Schedule III COA
                    </div>
                </motion.div>

                <motion.div className="stat-card" {...fadeIn(3)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="stat-card__label">Data Integrity</span>
                        <div className="stat-card__icon stat-card__icon--green">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <div className="stat-card__value" style={{ color: 'var(--color-success-500)' }}>✓</div>
                    <div className="stat-card__change stat-card__change--up">
                        Audit chain verified
                    </div>
                </motion.div>
            </div>

            {/* Recent Entries */}
            <motion.div className="card" style={{ marginTop: 'var(--space-6)' }} {...fadeIn(4)}>
                <div className="card__header">
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Recent Journal Entries</h3>
                    <button className="btn btn--ghost btn--sm" onClick={() => setView('ledger')}>
                        View All <ArrowUpRight size={14} />
                    </button>
                </div>
                <div className="card__body" style={{ padding: 0 }}>
                    {stats.recentEntries.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Narration</th>
                                    <th>Voucher</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentEntries.map(entry => (
                                    <tr key={entry.entry_id}>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                                            {entry.date}
                                        </td>
                                        <td>{entry.narration}</td>
                                        <td>
                                            <span className="badge badge--draft" style={{ textTransform: 'capitalize' }}>
                                                {entry.voucher_type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                            {entry.source}
                                        </td>
                                        <td>
                                            <span className={`badge badge--${entry.approval_status === 'pending_approval' ? 'pending' : entry.approval_status}`}>
                                                {entry.approval_status.replace('_', ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <BookOpen size={48} className="empty-state__icon" />
                            <p className="empty-state__title">No entries yet</p>
                            <p>Journal entries will appear here once created.</p>
                            <button
                                className="btn btn--accent"
                                style={{ marginTop: 'var(--space-4)' }}
                                onClick={() => setView('ledger')}
                            >
                                Go to Ledger
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
