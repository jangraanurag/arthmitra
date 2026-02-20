
import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import {
    getUnits, createUnit, deleteUnit,
    getItems, createItem, deleteItem,
    type InventoryUnit, type InventoryItem
} from '../ipc';
import {
    Plus, Trash2, Search, Package, Box, Tag,
    RefreshCw, X, FileText, Factory, ScrollText
} from 'lucide-react';

export function InventoryPage() {
    const { activeCompany, addToast, setView } = useAppStore();
    const [activeTab, setActiveTab] = useState<'items' | 'units'>('items');

    // Data
    const [units, setUnits] = useState<InventoryUnit[]>([]);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [showUnitModal, setShowUnitModal] = useState(false);
    const [showItemModal, setShowItemModal] = useState(false);

    // Form State
    const [unitForm, setUnitForm] = useState({ name: '', symbol: '', decimal_places: 0 });
    const [itemForm, setItemForm] = useState({
        name: '', sku: '', hsn_code: '', unit_id: '',
        tax_rate: 0, description: '', opening_qty: 0, opening_value: 0
    });

    useEffect(() => {
        if (activeCompany) {
            loadData();
        }
    }, [activeCompany]);

    const loadData = async () => {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const [u, i] = await Promise.all([
                getUnits(activeCompany.uuid),
                getItems(activeCompany.uuid)
            ]);
            setUnits(u);
            setItems(i);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load inventory: ${err} ` });
        } finally {
            setLoading(false);
        }
    };

    // ── Handlers ─────────────────────────────────────────────────────────

    const handleCreateUnit = async () => {
        if (!activeCompany) return;
        if (!unitForm.name || !unitForm.symbol) {
            addToast({ type: 'error', message: 'Name and Symbol are required' });
            return;
        }

        try {
            await createUnit(activeCompany.uuid, unitForm);
            addToast({ type: 'success', message: 'Unit created successfully' });
            setShowUnitModal(false);
            setUnitForm({ name: '', symbol: '', decimal_places: 0 });
            loadData();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to create unit: ${err} ` });
        }
    };

    const handleDeleteUnit = async (id: string, symbol: string) => {
        if (!activeCompany || !confirm(`Delete unit '${symbol}' ? `)) return;
        try {
            await deleteUnit(activeCompany.uuid, id);
            addToast({ type: 'success', message: 'Unit deleted' });
            loadData();
        } catch (err: any) {
            addToast({ type: 'error', message: `Cannot delete: ${err} ` });
        }
    };

    const handleCreateItem = async () => {
        if (!activeCompany) return;
        if (!itemForm.name || !itemForm.unit_id) {
            addToast({ type: 'error', message: 'Name and Unit are required' });
            return;
        }

        try {
            await createItem(activeCompany.uuid, itemForm);
            addToast({ type: 'success', message: 'Item created successfully' });
            setShowItemModal(false);
            setItemForm({
                name: '', sku: '', hsn_code: '', unit_id: '',
                tax_rate: 0, description: '', opening_qty: 0, opening_value: 0
            });
            loadData();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to create item: ${err} ` });
        }
    };

    const handleDeleteItem = async (id: string, name: string) => {
        if (!activeCompany || !confirm(`Delete item '${name}' ? `)) return;
        try {
            await deleteItem(activeCompany.uuid, id);
            addToast({ type: 'success', message: 'Item deleted' });
            loadData();
        } catch (err: any) {
            addToast({ type: 'error', message: `Cannot delete: ${err} ` });
        }
    };

    // ── Render ───────────────────────────────────────────────────────────

    const filteredItems = items.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getUnitSymbol = (id: string) => units.find(u => u.unit_id === id)?.symbol || '-';

    return (
        <div className="page inventory-page">
            <header className="page-header">
                <div>
                    <h1 className="page-header__title">Inventory Management</h1>
                    <p className="page-header__subtitle">Manage Stock Items and Units of Measurement</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn--secondary btn--icon" onClick={loadData} disabled={loading} title="Refresh">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn btn--secondary" onClick={() => setView('stock_summary')} title="Stock Summary">
                        <FileText size={18} /> Summary
                    </button>
                    <button className="btn btn--secondary" onClick={() => setView('bom')} title="Bill of Materials">
                        <ScrollText size={18} /> BOM
                    </button>
                    <button className="btn btn--secondary" onClick={() => setView('production')} title="Production Orders">
                        <Factory size={18} /> Production
                    </button>
                    {activeTab === 'items' ? (
                        <button className="btn btn--primary" onClick={() => setShowItemModal(true)}>
                            <Plus size={18} /> New Item
                        </button>
                    ) : (
                        <button className="btn btn--primary" onClick={() => setShowUnitModal(true)}>
                            <Plus size={18} /> New Unit
                        </button>
                    )}
                </div>
            </header>

            <div className="stat-grid" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="stat-card">
                    <div className="stat-card__header" style={{ paddingBottom: 0, border: 'none' }}>
                        <div className="stat-card__icon stat-card__icon--blue"><Package size={20} /></div>
                        <div className="stat-card__label">Total Items</div>
                    </div>
                    <div className="stat-card__body" style={{ paddingTop: 'var(--space-2)' }}>
                        <div className="stat-card__value">{items.length}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header" style={{ paddingBottom: 0, border: 'none' }}>
                        <div className="stat-card__icon stat-card__icon--orange"><Tag size={20} /></div>
                        <div className="stat-card__label">Units Defined</div>
                    </div>
                    <div className="stat-card__body" style={{ paddingTop: 'var(--space-2)' }}>
                        <div className="stat-card__value">{units.length}</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card__header" style={{ padding: 0 }}>
                    <div className="tabs" style={{ display: 'flex', width: '100%' }}>
                        <button
                            className={`tab - btn ${activeTab === 'items' ? 'tab-btn--active' : ''} `}
                            onClick={() => setActiveTab('items')}
                            style={{
                                flex: 1,
                                padding: 'var(--space-4)',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'items' ? '2px solid var(--color-primary-500)' : '1px solid var(--border-subtle)',
                                color: activeTab === 'items' ? 'var(--color-primary-400)' : 'var(--text-secondary)',
                                fontWeight: 600,
                                fontSize: 'var(--text-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--space-2)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Package size={16} /> Stock Items
                        </button>
                        <button
                            className={`tab - btn ${activeTab === 'units' ? 'tab-btn--active' : ''} `}
                            onClick={() => setActiveTab('units')}
                            style={{
                                flex: 1,
                                padding: 'var(--space-4)',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'units' ? '2px solid var(--color-primary-500)' : '1px solid var(--border-subtle)',
                                color: activeTab === 'units' ? 'var(--color-primary-400)' : 'var(--text-secondary)',
                                fontWeight: 600,
                                fontSize: 'var(--text-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--space-2)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Box size={16} /> Units of Measure
                        </button>
                    </div>
                </div>

                <div className="card__body" style={{ padding: 0 }}>
                    {activeTab === 'items' && (
                        <>
                            <div className="toolbar" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border-default)', maxWidth: '400px' }}>
                                    <Search size={16} color="var(--text-tertiary)" />
                                    <input
                                        type="text"
                                        placeholder="Search items by name or SKU..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', marginLeft: 'var(--space-2)', width: '100%' }}
                                    />
                                </div>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>SKU</th>
                                        <th>HSN/SAC</th>
                                        <th>Unit</th>
                                        <th>Tax Rate</th>
                                        <th className="col-amount">Opening Balance</th>
                                        <th style={{ width: 80 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                                                No items found. Create one to get started.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredItems.map(item => (
                                            <tr key={item.item_id}>
                                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{item.sku || '-'}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{item.hsn_code || '-'}</td>
                                                <td><span className="badge badge--draft">{getUnitSymbol(item.unit_id)}</span></td>
                                                <td>{item.tax_rate}%</td>
                                                <td className="col-amount">
                                                    {item.opening_qty} {getUnitSymbol(item.unit_id)}
                                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                        @ {item.opening_qty > 0 ? (item.opening_value / item.opening_qty).toFixed(2) : 0}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className="btn btn--ghost btn--icon"
                                                        style={{ color: 'var(--color-danger-500)', padding: 'var(--space-1)' }}
                                                        onClick={() => handleDeleteItem(item.item_id, item.name)}
                                                        title="Delete Item"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </>
                    )}

                    {activeTab === 'units' && (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Formal Name</th>
                                    <th>Decimal Places</th>
                                    <th style={{ width: 80 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {units.map(unit => (
                                    <tr key={unit.unit_id}>
                                        <td style={{ fontWeight: 600 }}>{unit.symbol}</td>
                                        <td>{unit.name}</td>
                                        <td>{unit.decimal_places}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {!unit.is_system && (
                                                <button
                                                    className="btn btn--ghost btn--icon"
                                                    style={{ color: 'var(--color-danger-500)', padding: 'var(--space-1)' }}
                                                    onClick={() => handleDeleteUnit(unit.unit_id, unit.symbol)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create Unit Modal */}
            {showUnitModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '400px' }}>
                        <div className="modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                            <h3 className="modal__title" style={{ margin: 0 }}>Create Unit</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setShowUnitModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div className="input-group">
                                <label className="input-group__label">Symbol</label>
                                <input
                                    className="input"
                                    type="text"
                                    placeholder="e.g. kg, pcs"
                                    value={unitForm.symbol}
                                    onChange={e => setUnitForm({ ...unitForm, symbol: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-group__label">Formal Name</label>
                                <input
                                    className="input"
                                    type="text"
                                    placeholder="e.g. Kilogram"
                                    value={unitForm.name}
                                    onChange={e => setUnitForm({ ...unitForm, name: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-group__label">Decimal Places</label>
                                <select
                                    className="input"
                                    value={unitForm.decimal_places}
                                    onChange={e => setUnitForm({ ...unitForm, decimal_places: parseInt(e.target.value) })}
                                >
                                    <option value={0}>0</option>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                    <option value={4}>4</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal__actions">
                            <button className="btn btn--secondary" onClick={() => setShowUnitModal(false)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleCreateUnit}>Create Unit</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Item Modal */}
            {showItemModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '750px' }}>
                        <div className="modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                            <h3 className="modal__title" style={{ margin: 0 }}>Create Stock Item</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setShowItemModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="input-group">
                                    <label className="input-group__label">Item Name *</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="e.g. iPhone 15 Pro"
                                        value={itemForm.name}
                                        onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">SKU / Code</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="e.g. ITEM-001"
                                        value={itemForm.sku}
                                        onChange={e => setItemForm({ ...itemForm, sku: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="input-group">
                                    <label className="input-group__label">Unit *</label>
                                    <select
                                        className="input"
                                        value={itemForm.unit_id}
                                        onChange={e => setItemForm({ ...itemForm, unit_id: e.target.value })}
                                    >
                                        <option value="">Select Unit</option>
                                        {units.map(u => (
                                            <option key={u.unit_id} value={u.unit_id}>{u.symbol} - {u.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">HSN / SAC</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="e.g. 8517"
                                        value={itemForm.hsn_code}
                                        onChange={e => setItemForm({ ...itemForm, hsn_code: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">Tax Rate (%)</label>
                                    <select
                                        className="input"
                                        value={itemForm.tax_rate}
                                        onChange={e => setItemForm({ ...itemForm, tax_rate: parseFloat(e.target.value) })}
                                    >
                                        <option value={0}>0% (Tax Free)</option>
                                        <option value={5}>5%</option>
                                        <option value={12}>12%</option>
                                        <option value={18}>18%</option>
                                        <option value={28}>28%</option>
                                    </select>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-group__label">Description</label>
                                <textarea
                                    className="input"
                                    rows={2}
                                    placeholder="Add optional notes here..."
                                    value={itemForm.description}
                                    onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                                    style={{ resize: 'none' }}
                                />
                            </div>

                            <div style={{
                                padding: 'var(--space-4)',
                                background: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px dashed var(--border-default)'
                            }}>
                                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary-400)', marginBottom: 'var(--space-3)', textTransform: 'uppercase' }}>Opening Balance</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div className="input-group">
                                        <label className="input-group__label">Quantity</label>
                                        <input
                                            className="input"
                                            type="number"
                                            value={itemForm.opening_qty}
                                            onChange={e => setItemForm({ ...itemForm, opening_qty: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-group__label">Total Value (₹)</label>
                                        <input
                                            className="input"
                                            type="number"
                                            value={itemForm.opening_value}
                                            onChange={e => setItemForm({ ...itemForm, opening_value: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal__actions">
                            <button className="btn btn--secondary" onClick={() => setShowItemModal(false)}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleCreateItem}>Create Item</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
