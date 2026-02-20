import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, RefreshCw, Loader2, BookOpen, Download, Printer, Trash2, Search, Edit2 } from 'lucide-react';
import { useAppStore } from '../store';
import { getLedger, deleteEntry } from '../ipc';
import type { JournalEntry, LedgerLine } from '../store';
import { exportLedgerCSV } from '../utils/csvExport';

export function LedgerPage() {
    const { activeCompany, addToast, setView, setEditingEntryId } = useAppStore();
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [lines, setLines] = useState<LedgerLine[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterVoucher, setFilterVoucher] = useState<string>('');
    const [filterFrom, setFilterFrom] = useState<string>('');
    const [filterTo, setFilterTo] = useState<string>('');
    const [filterAccount, setFilterAccount] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [page, setPage] = useState(0);
    const pageSize = 25;

    // Use store filters if available
    const { ledgerFilter, setLedgerFilter } = useAppStore();

    useEffect(() => {
        if (ledgerFilter.accountId || ledgerFilter.dateFrom || ledgerFilter.dateTo) {
            if (ledgerFilter.accountId) setFilterAccount(ledgerFilter.accountId);
            if (ledgerFilter.dateFrom) setFilterFrom(ledgerFilter.dateFrom);
            if (ledgerFilter.dateTo) setFilterTo(ledgerFilter.dateTo);

            // Clear store filter so it doesn't persist aggressively if user navigates away and back
            // But we might want it to persist? For now, let's treat it as a "one-off" navigation from reports.
            setLedgerFilter({});
        }
    }, [ledgerFilter, setLedgerFilter]);

    useEffect(() => {
        if (activeCompany) {
            loadLedger();
        }
    }, [activeCompany, page, filterVoucher, filterFrom, filterTo, searchTerm, filterAccount]);

    async function loadLedger() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const result = await getLedger(activeCompany.uuid, {
                account_id: filterAccount || null,
                voucher_type: filterVoucher || null,
                from_date: filterFrom || null,
                to_date: filterTo || null,
                search_term: searchTerm || null,
                limit: pageSize,
                offset: page * pageSize,
            });
            setEntries(result.entries);
            setLines(result.lines);
            setTotalCount(result.total_count);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load ledger: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    function getLinesForEntry(entryId: string): LedgerLine[] {
        return lines.filter(l => l.entry_id === entryId);
    }

    const handleExport = async () => {
        if (entries.length === 0) {
            addToast({ type: 'warning', message: 'No entries to export' });
            return;
        }

        setExporting(true);
        try {
            const path = await exportLedgerCSV(entries, lines);
            if (path) {
                addToast({ type: 'success', message: `Export completed: ${path}` });
            }
        } catch (error: any) {
            console.error("Export failed:", error);
            addToast({ type: 'error', message: `Export failed: ${error.message || error}` });
        } finally {
            setExporting(false);
        }
    };

    const handleEdit = (entry: JournalEntry) => {
        setEditingEntryId(entry.entry_id);
        setView('voucher');
    };

    const deleteEntryData = async (entryId: string) => {
        if (!confirm('Are you sure you want to void this entry? This action cannot be undone.')) return;
        if (!activeCompany) return;

        try {
            await deleteEntry(activeCompany.uuid, entryId);
            addToast({ type: 'success', message: 'Entry voided' });
            loadLedger();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to void: ${err}` });
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Day Book / Ledger</h1>
                    <p className="page-header__subtitle">
                        {totalCount} entries • {activeCompany?.company_name}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--secondary btn--sm" onClick={loadLedger}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={handleExport}
                        disabled={exporting}
                    >
                        {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                        {exporting ? 'Saving...' : 'Export CSV'}
                    </button>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => window.print()}
                        title="Print or Save as PDF"
                    >
                        <Printer size={14} /> Print
                    </button>
                    <button className="btn btn--accent" onClick={() => { setEditingEntryId(null); setView('voucher'); }}>
                        <Plus size={16} /> New Entry
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <motion.div
                className="card"
                style={{ marginBottom: 'var(--space-4)' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="card__body" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
                        <label className="input-group__label">Search</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                className="input"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                                placeholder="Search narration or voucher no..."
                                style={{ paddingLeft: 32, width: '100%' }}
                            />
                        </div>
                    </div>
                    <div className="input-group" style={{ minWidth: 140 }}>
                        <label className="input-group__label">Voucher Type</label>
                        <select
                            className="input"
                            value={filterVoucher}
                            onChange={(e) => { setFilterVoucher(e.target.value); setPage(0); }}
                        >
                            <option value="">All Types</option>
                            <option value="journal">Journal</option>
                            <option value="receipt">Receipt</option>
                            <option value="payment">Payment</option>
                            <option value="contra">Contra</option>
                            <option value="sales">Sales</option>
                            <option value="purchase">Purchase</option>
                            <option value="debit_note">Debit Note</option>
                            <option value="credit_note">Credit Note</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label className="input-group__label">From</label>
                        <input
                            className="input"
                            type="date"
                            value={filterFrom}
                            onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-group__label">To</label>
                        <input
                            className="input"
                            type="date"
                            value={filterTo}
                            onChange={(e) => { setFilterTo(e.target.value); setPage(0); }}
                        />
                    </div>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { setFilterVoucher(''); setFilterFrom(''); setFilterTo(''); setSearchTerm(''); setPage(0); }}
                    >
                        Clear Filters
                    </button>
                </div>
            </motion.div>

            {/* Ledger Table */}
            <motion.div
                className="card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="card__body" style={{ padding: 0, overflowX: 'auto' }}>
                    {loading ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <Loader2 size={24} className="spinner" />
                            <p style={{ marginTop: 'var(--space-2)' }}>Loading ledger...</p>
                        </div>
                    ) : entries.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 100 }}>Voucher</th>
                                    <th style={{ width: 100 }}>Date</th>
                                    <th>Narration</th>
                                    <th>Account</th>
                                    <th style={{ width: 120 }}>Debit (₹)</th>
                                    <th style={{ width: 120 }}>Credit (₹)</th>
                                    <th style={{ width: 110 }}>Status</th>
                                    <th style={{ width: 80 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => {
                                    const entryLines = getLinesForEntry(entry.entry_id);
                                    const isVoided = entry.approval_status === 'voided';
                                    const rowStyle = isVoided ? { opacity: 0.6, textDecoration: 'line-through' } : {};

                                    return entryLines.map((line, idx) => (
                                        <tr key={line.line_id} style={rowStyle}>
                                            {idx === 0 && (
                                                <>
                                                    <td rowSpan={entryLines.length} style={{ verticalAlign: 'top' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                                                                {entry.voucher_number}
                                                            </span>
                                                            <span className="badge badge--draft" style={{ textTransform: 'capitalize', fontSize: '10px', padding: '2px 6px' }}>
                                                                {entry.voucher_type.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td
                                                        rowSpan={entryLines.length}
                                                        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', verticalAlign: 'top' }}
                                                    >
                                                        {entry.date}
                                                    </td>
                                                    <td
                                                        rowSpan={entryLines.length}
                                                        style={{ verticalAlign: 'top', maxWidth: 300 }}
                                                    >
                                                        <div>{entry.narration}</div>
                                                        {entry.actor_type === 'ai' && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                color: 'var(--color-accent-400)',
                                                                fontWeight: 600,
                                                            }}>
                                                                🤖 AI Generated
                                                            </span>
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                            <td>{line.account_name}</td>
                                            <td className="col-amount col-debit">
                                                {parseFloat(line.debit) > 0 ? formatCurrency(line.debit) : ''}
                                            </td>
                                            <td className="col-amount col-credit">
                                                {parseFloat(line.credit) > 0 ? formatCurrency(line.credit) : ''}
                                            </td>
                                            {idx === 0 && (
                                                <>
                                                    <td rowSpan={entryLines.length} style={{ verticalAlign: 'top' }}>
                                                        <span className={`badge badge--${isVoided ? 'danger' : (entry.approval_status === 'pending_approval' ? 'pending' : entry.approval_status)}`}>
                                                            {entry.approval_status.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td rowSpan={entryLines.length} style={{ verticalAlign: 'top', textAlign: 'right' }}>
                                                        {!isVoided && (
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                                                                <button
                                                                    className="btn-icon"
                                                                    onClick={() => handleEdit(entry)}
                                                                    title="Edit Entry"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    className="btn-icon danger"
                                                                    onClick={() => deleteEntryData(entry.entry_id)}
                                                                    title="Void Entry"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ));
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <BookOpen size={48} className="empty-state__icon" />
                            <p className="empty-state__title">No journal entries</p>
                            <p>Create your first entry to get started.</p>
                            <button
                                className="btn btn--accent"
                                style={{ marginTop: 'var(--space-4)' }}
                                onClick={() => setView('voucher')}
                            >
                                <Plus size={14} /> Create Entry
                            </button>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalCount > pageSize && (
                    <div className="card__body" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button
                                className="btn btn--secondary btn--sm"
                                disabled={page === 0}
                                onClick={() => setPage(p => p - 1)}
                            >
                                Previous
                            </button>
                            <button
                                className="btn btn--secondary btn--sm"
                                disabled={(page + 1) * pageSize >= totalCount}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
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
