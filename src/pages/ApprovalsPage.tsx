import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, Shield, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import { getLedger, approveEntry, deleteEntry } from '../ipc';
import type { JournalEntry, LedgerLine } from '../store';

export function ApprovalsPage() {
    const { activeCompany, addToast } = useAppStore();
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [lines, setLines] = useState<LedgerLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [approving, setApproving] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<string | null>(null);

    useEffect(() => {
        if (activeCompany) loadPending();
    }, [activeCompany]);

    async function loadPending() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const result = await getLedger(activeCompany.uuid, { limit: 100, offset: 0 });
            // Filter to pending entries
            const pending = result.entries.filter(e =>
                e.approval_status === 'pending_approval' || e.approval_status === 'draft'
            );
            setEntries(pending);
            setLines(result.lines);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load pending entries: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove(entryId: string) {
        if (!activeCompany) return;
        setApproving(entryId);
        try {
            await approveEntry(activeCompany.uuid, entryId);
            addToast({ type: 'success', message: 'Entry approved and posted to ledger' });
            // Remove from list
            setEntries(prev => prev.filter(e => e.entry_id !== entryId));
        } catch (err: any) {
            addToast({ type: 'error', message: `Approval failed: ${err}` });
        } finally {
            setApproving(null);
        }
    }

    async function handleReject(entryId: string) {
        if (!confirm('Are you sure you want to reject (void) this entry?')) return;
        if (!activeCompany) return;
        setRejecting(entryId);
        try {
            await deleteEntry(activeCompany.uuid, entryId);
            addToast({ type: 'success', message: 'Entry rejected (voided)' });
            // Remove from list
            setEntries(prev => prev.filter(e => e.entry_id !== entryId));
        } catch (err: any) {
            addToast({ type: 'error', message: `Rejection failed: ${err}` });
        } finally {
            setRejecting(null);
        }
    }

    function getLinesForEntry(entryId: string): LedgerLine[] {
        return lines.filter(l => l.entry_id === entryId);
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Pending Approvals</h1>
                    <p className="page-header__subtitle">
                        {entries.length} entries awaiting review
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="empty-state">
                    <Loader2 size={24} className="spinner" />
                    <p style={{ marginTop: 'var(--space-2)' }}>Loading pending entries...</p>
                </div>
            ) : entries.length === 0 ? (
                <motion.div
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <CheckCircle size={64} className="empty-state__icon" style={{ color: 'var(--color-success-500)', opacity: 0.5 }} />
                    <p className="empty-state__title">All clear!</p>
                    <p>No entries pending approval. All journal entries are approved.</p>
                </motion.div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {entries.map((entry, i) => {
                        const entryLines = getLinesForEntry(entry.entry_id);
                        return (
                            <motion.div
                                key={entry.entry_id}
                                className="card"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <div className="card__header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                        <Clock size={16} style={{ color: 'var(--color-warning-500)' }} />
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{entry.narration}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'flex', gap: 'var(--space-2)', marginTop: 2 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.date}</span>
                                                <span>•</span>
                                                <span style={{ textTransform: 'capitalize' }}>{entry.voucher_type.replace('_', ' ')}</span>
                                                <span>•</span>
                                                <span>
                                                    {entry.actor_type === 'ai' ? '🤖 AI Generated' : `By ${entry.created_by}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <button
                                            className="btn btn--secondary btn--sm"
                                            onClick={() => handleReject(entry.entry_id)}
                                            disabled={rejecting === entry.entry_id || approving === entry.entry_id}
                                            style={{ color: 'var(--color-danger-500)' }}
                                        >
                                            {rejecting === entry.entry_id ? (
                                                <Loader2 size={14} className="spinner" />
                                            ) : (
                                                'Reject'
                                            )}
                                        </button>
                                        <button
                                            className="btn btn--primary btn--sm"
                                            onClick={() => handleApprove(entry.entry_id)}
                                            disabled={approving === entry.entry_id || rejecting === entry.entry_id}
                                        >
                                            {approving === entry.entry_id ? (
                                                <Loader2 size={14} className="spinner" />
                                            ) : (
                                                <CheckCircle size={14} />
                                            )}
                                            Approve
                                        </button>
                                    </div>
                                </div>
                                {entryLines.length > 0 && (
                                    <div className="card__body" style={{ padding: 0 }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Account</th>
                                                    <th style={{ width: 120 }}>Debit (₹)</th>
                                                    <th style={{ width: 120 }}>Credit (₹)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {entryLines.map(line => (
                                                    <tr key={line.line_id}>
                                                        <td>{line.account_name}</td>
                                                        <td className="col-amount col-debit">
                                                            {parseFloat(line.debit) > 0 ? formatCurrency(line.debit) : ''}
                                                        </td>
                                                        <td className="col-amount col-credit">
                                                            {parseFloat(line.credit) > 0 ? formatCurrency(line.credit) : ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <div style={{
                                    padding: 'var(--space-3) var(--space-4)',
                                    borderTop: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-3)',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-tertiary)',
                                }}>
                                    <Shield size={12} />
                                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                                        Checksum: {entry.checksum.slice(0, 16)}...
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function formatCurrency(value: string): string {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
}
