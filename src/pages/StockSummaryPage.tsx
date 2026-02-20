import { useState, useEffect } from 'react';
import { useAppStore, StockSummaryItem } from '../store';
import { getStockSummary } from '../ipc';
import { RefreshCw, ArrowLeft, FileText, Search } from 'lucide-react';

export function StockSummaryPage() {
    const { activeCompany, setView, setSelectedItemId, addToast } = useAppStore();
    const [items, setItems] = useState<StockSummaryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (activeCompany) {
            loadData();
        }
    }, [activeCompany]);

    const loadData = async () => {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const data = await getStockSummary(activeCompany.uuid);
            setItems(data);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load stock summary: ${err}` });
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = (itemId: string) => {
        setSelectedItemId(itemId);
        setView('item_ledger');
    };

    const filteredItems = items.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.sku && i.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const totalValue = filteredItems.reduce((sum, item) => sum + item.closing_value, 0);

    return (
        <div className="page stock-summary-page">
            <header className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <button
                            className="btn btn--ghost btn--icon"
                            onClick={() => setView('inventory')}
                            title="Back to Inventory"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="page-header__title">Stock Summary</h1>
                            <p className="page-header__subtitle">Current stock levels and valuation</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--secondary btn--icon" onClick={loadData} disabled={loading} title="Refresh">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn btn--secondary" onClick={() => window.print()}>
                        <FileText size={18} /> Print / Export
                    </button>
                </div>
            </header>

            <div className="card">
                <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)' }}>
                    <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)', width: '300px' }}>
                        <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', marginLeft: 'var(--space-3)', pointerEvents: 'none' }} />
                        <input
                            className="input"
                            type="text"
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: 'var(--space-8)', width: '100%' }}
                        />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>
                        Total Value: <span style={{ color: 'var(--color-primary-600)' }}>₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="card__body" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 'var(--space-6)' }}>Item Name</th>
                                    <th>SKU</th>
                                    <th className="col-amount">Quantity</th>
                                    <th className="col-amount" style={{ paddingRight: 'var(--space-6)' }}>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-tertiary)' }}>
                                            No items found matching your search.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map(item => (
                                        <tr
                                            key={item.item_id}
                                            onClick={() => handleItemClick(item.item_id)}
                                            style={{ cursor: 'pointer', transition: 'background var(--duration-fast)' }}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-800"
                                        >
                                            <td style={{ fontWeight: 500, color: 'var(--color-primary-600)', paddingLeft: 'var(--space-6)' }}>
                                                {item.name}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{item.sku || '—'}</td>
                                            <td className="col-amount">
                                                {item.closing_qty} <span style={{ fontSize: '0.85em', color: 'var(--text-tertiary)', marginLeft: '4px' }}>{item.unit_symbol}</span>
                                            </td>
                                            <td className="col-amount" style={{ fontWeight: 600, paddingRight: 'var(--space-6)' }}>
                                                {item.closing_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
