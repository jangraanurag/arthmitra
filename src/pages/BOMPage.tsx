import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { getItems, createBOM, getBOMs, deleteBOM, InventoryItem, BOMHeader } from '../ipc';
import { Plus, Trash2, Save, ArrowLeft, Loader2, ScrollText } from 'lucide-react';

export function BOMPage() {
    const { activeCompany, setView } = useAppStore();
    const [boms, setBoms] = useState<BOMHeader[]>([]);
    const [loading, setLoading] = useState(false);

    // Create Mode
    const [isCreating, setIsCreating] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);

    // Form State
    const [bomName, setBomName] = useState('');
    const [finishedGoodId, setFinishedGoodId] = useState('');
    const [outputQty, setOutputQty] = useState('1');
    const [components, setComponents] = useState<{ itemId: string; quantity: string }[]>([
        { itemId: '', quantity: '1' }
    ]);

    useEffect(() => {
        loadData();
    }, [activeCompany]);

    async function loadData() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const [bomsData, itemsData] = await Promise.all([
                getBOMs(activeCompany.uuid),
                getItems(activeCompany.uuid)
            ]);
            setBoms(bomsData);
            setItems(itemsData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!activeCompany || !finishedGoodId || !bomName) return;

        try {
            await createBOM(activeCompany.uuid, {
                item_id: finishedGoodId,
                name: bomName,
                output_quantity: parseFloat(outputQty) || 1,
                components: components
                    .filter(c => c.itemId && parseFloat(c.quantity) > 0)
                    .map(c => ({
                        item_id: c.itemId,
                        quantity: parseFloat(c.quantity)
                    }))
            });
            setIsCreating(false);
            resetForm();
            loadData();
        } catch (error) {
            console.error("Failed to create BOM", error);
            alert("Failed to create BOM: " + error);
        }
    }

    function resetForm() {
        setBomName('');
        setFinishedGoodId('');
        setOutputQty('1');
        setComponents([{ itemId: '', quantity: '1' }]);
    }

    // Handlers
    const addComponentLine = () => setComponents([...components, { itemId: '', quantity: '1' }]);
    const removeComponentLine = (idx: number) => setComponents(components.filter((_, i) => i !== idx));
    const updateComponent = (idx: number, field: 'itemId' | 'quantity', val: string) => {
        const newComps = [...components];
        if (field === 'itemId') newComps[idx].itemId = val;
        if (field === 'quantity') newComps[idx].quantity = val;
        setComponents(newComps);
    };

    async function handleDelete(bomId: string) {
        if (!activeCompany || !confirm('Are you sure you want to delete this BOM?')) return;
        try {
            await deleteBOM(activeCompany.uuid, bomId);
            loadData();
        } catch (error) {
            console.error(error);
        }
    }

    if (!activeCompany) return null;

    return (
        <div className="page bom-page">
            <header className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <button className="btn btn--secondary btn--icon" onClick={() => setView('inventory')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-header__title">Bill of Materials</h1>
                        <p className="page-header__subtitle">Manage specific recipes for production</p>
                    </div>
                </div>
                {!isCreating && (
                    <button className="btn btn--primary" onClick={() => setIsCreating(true)}>
                        <Plus size={18} /> New BOM
                    </button>
                )}
            </header>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)', color: 'var(--text-tertiary)' }}>
                    <Loader2 className="animate-spin" size={24} /> <span style={{ marginLeft: 'var(--space-2)' }}>Loading BOMs...</span>
                </div>
            ) : isCreating ? (
                <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <form onSubmit={handleSave}>
                        <div className="card__header">
                            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Create New BOM</h3>
                        </div>
                        <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="input-group">
                                    <label className="input-group__label">BOM Name</label>
                                    <input
                                        className="input"
                                        type="text"
                                        value={bomName}
                                        onChange={e => setBomName(e.target.value)}
                                        placeholder="e.g. Standard Recipe"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">Output Qty</label>
                                    <input
                                        className="input"
                                        type="number"
                                        value={outputQty}
                                        onChange={e => setOutputQty(e.target.value)}
                                        min="0.01" step="any"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-group__label">Finished Good (Item to Produce)</label>
                                <select
                                    className="input"
                                    value={finishedGoodId}
                                    onChange={e => setFinishedGoodId(e.target.value)}
                                    required
                                >
                                    <option value="">Select Item...</option>
                                    {items.map(i => (
                                        <option key={i.item_id} value={i.item_id}>{i.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
                                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', textTransform: 'uppercase' }}>
                                    Raw Materials (Components)
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {components.map((row, idx) => (
                                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: 'var(--space-3)', alignItems: 'center' }}>
                                            <div className="input-group">
                                                <select
                                                    className="input"
                                                    value={row.itemId}
                                                    onChange={e => updateComponent(idx, 'itemId', e.target.value)}
                                                    required
                                                >
                                                    <option value="">Select Raw Material...</option>
                                                    {items.map(i => (
                                                        <option key={i.item_id} value={i.item_id}>{i.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <input
                                                    className="input"
                                                    type="number"
                                                    value={row.quantity}
                                                    onChange={e => updateComponent(idx, 'quantity', e.target.value)}
                                                    min="0.001" step="any"
                                                    placeholder="Qty"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                {components.length > 1 && (
                                                    <button type="button" className="btn btn--ghost btn--icon" style={{ color: 'var(--color-danger-500)' }} onClick={() => removeComponentLine(idx)}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" className="btn btn--secondary btn--sm" onClick={addComponentLine} style={{ marginTop: 'var(--space-3)' }}>
                                    <Plus size={14} /> Add Component
                                </button>
                            </div>
                        </div>
                        <div className="card__header" style={{ borderTop: '1px solid var(--border-subtle)', justifyContent: 'flex-end', gap: 'var(--space-3)', background: 'var(--bg-subtle)' }}>
                            <button type="button" className="btn btn--secondary" onClick={() => setIsCreating(false)}>Cancel</button>
                            <button type="submit" className="btn btn--primary"><Save size={18} /> Save BOM</button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="card">
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>BOM Name</th>
                                    <th>Finished Good</th>
                                    <th className="col-amount">Output Qty</th>
                                    <th style={{ width: 80 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {boms.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                                            No BOMs found. Create a new recipe to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    boms.map(bom => (
                                        <tr key={bom.bom_id}>
                                            <td style={{ fontWeight: 500 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                    <ScrollText size={16} color="var(--color-primary-400)" />
                                                    {bom.name}
                                                </div>
                                            </td>
                                            <td>{bom.finished_good_name || 'Unknown Item'}</td>
                                            <td className="col-amount">{bom.output_quantity}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn--ghost btn--icon"
                                                    style={{ color: 'var(--color-danger-500)', padding: 'var(--space-1)' }}
                                                    onClick={() => handleDelete(bom.bom_id)}
                                                    title="Delete BOM"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
