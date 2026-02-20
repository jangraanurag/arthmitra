import { useState, useEffect } from 'react';
import { useAppStore, ItemLedgerEntry } from '../store';
import { getItemLedger, getItems } from '../ipc';
import { RefreshCw, ArrowLeft, FileText, ChevronRight } from 'lucide-react';

export function ItemLedgerPage() {
    const { activeCompany, selectedItemId, setView, addToast } = useAppStore();
    const [entries, setEntries] = useState<ItemLedgerEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [itemName, setItemName] = useState('Loading...');

    useEffect(() => {
        if (activeCompany && selectedItemId) {
            loadData();
            loadItemName();
        } else {
            setView('stock_summary');
        }
    }, [activeCompany, selectedItemId]);

    const loadItemName = async () => {
        if (!activeCompany || !selectedItemId) return;
        try {
            // Optimization: We could fetch single item, but getItems is cached or fast enough for now
            const items = await getItems(activeCompany.uuid);
            const item = items.find(i => i.item_id === selectedItemId);
            if (item) setItemName(item.name);
        } catch (err) {
            console.error(err);
        }
    };

    const loadData = async () => {
        if (!activeCompany || !selectedItemId) return;
        setLoading(true);
        try {
            const data = await getItemLedger(activeCompany.uuid, selectedItemId);
            setEntries(data);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load item ledger: ${err}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page item-ledger-page">
            <header className="page-header">
                <div>
                    <nav className="header__breadcrumb" style={{ marginBottom: 'var(--space-2)' }}>
                        <button className="btn-link" onClick={() => setView('inventory')}>Inventory</button>
                        <ChevronRight size={14} className="text-secondary" />
                        <button className="btn-link" onClick={() => setView('stock_summary')}>Stock Summary</button>
                        <ChevronRight size={14} className="text-secondary" />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{itemName}</span>
                    </nav>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <button
                            className="btn btn--ghost btn--icon"
                            onClick={() => setView('stock_summary')}
                            title="Back"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="page-header__title">Item Ledger</h1>
                            <p className="page-header__subtitle">Transaction history for {itemName}</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--secondary btn--icon" onClick={loadData} disabled={loading} title="Refresh">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn btn--secondary" onClick={() => window.print()}>
                        <FileText size={18} /> Print
                    </button>
                </div>
            </header>

            <div className="card">
                <div className="card__body" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 'var(--space-6)' }}>Date</th>
                                    <th>Particulars</th>
                                    <th>Voucher Type</th>
                                    <th className="col-amount">In Qty</th>
                                    <th className="col-amount">Out Qty</th>
                                    <th className="col-amount">Rate</th>
                                    <th className="col-amount">Value</th>
                                    <th className="col-amount" style={{ background: 'var(--bg-subtle)', paddingRight: 'var(--space-6)' }}>Balance Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-tertiary)' }}>
                                            No transactions found for this item.
                                        </td>
                                    </tr>
                                ) : (
                                    entries.map(entry => (
                                        <tr key={entry.entry_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                            <td style={{ color: 'var(--text-secondary)', paddingLeft: 'var(--space-6)' }}>{new Date(entry.date).toLocaleDateString()}</td>
                                            <td style={{ fontWeight: 500 }}>
                                                {entry.voucher_number ? `Vch No: ${entry.voucher_number}` : 'Opening Balance'}
                                            </td>
                                            <td><span className="badge badge--draft">{entry.voucher_type}</span></td>
                                            <td className="col-amount" style={{ color: 'var(--color-success-600)' }}>
                                                {entry.txn_type === 'in' ? entry.quantity : '-'}
                                            </td>
                                            <td className="col-amount" style={{ color: 'var(--color-danger-600)' }}>
                                                {entry.txn_type === 'out' ? entry.quantity : '-'}
                                            </td>
                                            <td className="col-amount">{entry.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td className="col-amount">{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td className="col-amount" style={{ fontWeight: 600, background: 'var(--bg-subtle)', paddingRight: 'var(--space-6)' }}>
                                                {entry.running_qty}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
