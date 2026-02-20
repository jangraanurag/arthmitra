
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, JournalEntry } from '../store';
import { getBOMs, createProductionOrder, getProductionOrders, BOMHeader, ProductionOrder, getEntry, getCompanySettings } from '../ipc';
import { Plus, ArrowLeft, Loader2, Factory, Printer, X } from 'lucide-react';
import { ProductionPrintView } from '../components/ProductionPrintView';
import { useReactToPrint } from 'react-to-print';

export function ProductionPage() {
    const { activeCompany, setView } = useAppStore();
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [boms, setBoms] = useState<BOMHeader[]>([]);
    const [loading, setLoading] = useState(false);

    // Print State
    const [printingOrder, setPrintingOrder] = useState<ProductionOrder | null>(null);
    const [printEntry, setPrintEntry] = useState<JournalEntry | null>(null);
    const [printSettings, setPrintSettings] = useState<Record<string, string> | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrintRequest = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Production_Order_${printingOrder?.voucher_number || printingOrder?.date}`,
        onAfterPrint: () => {
            setPrintingOrder(null);
            setPrintEntry(null);
        }
    });

    // Create Mode
    const [isCreating, setIsCreating] = useState(false);
    const [selectedBomId, setSelectedBomId] = useState('');
    const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0]);
    const [quantity, setQuantity] = useState('1');

    useEffect(() => {
        loadData();
    }, [activeCompany]);

    // Trigger print when data is ready
    useEffect(() => {
        if (printingOrder && printEntry && printSettings && printRef.current) {
            handlePrintRequest();
        }
    }, [printingOrder, printEntry, printSettings]);


    async function loadData() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const [ordersData, bomsData] = await Promise.all([
                getProductionOrders(activeCompany.uuid),
                getBOMs(activeCompany.uuid)
            ]);
            setOrders(ordersData);
            setBoms(bomsData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handlePrint(order: ProductionOrder) {
        if (!activeCompany || !order.entry_id) return;

        try {
            // 1. Fetch Entry
            const entry = await getEntry(activeCompany.uuid, order.entry_id);
            // 2. Fetch Settings (if needed)
            let settings = printSettings;
            if (!settings) {
                settings = await getCompanySettings(activeCompany.uuid);
                setPrintSettings(settings);
            }

            setPrintEntry(entry);
            setPrintingOrder(order);
        } catch (err) {
            console.error("Failed to prepare print", err);
            alert("Failed to load print data");
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!activeCompany || !selectedBomId) return;

        try {
            await createProductionOrder(activeCompany.uuid, {
                date: prodDate,
                bom_id: selectedBomId,
                quantity: parseFloat(quantity)
            });
            setIsCreating(false);
            resetForm();
            loadData();
            // TODO: Better toast notification
            alert("Production Order recorded successfully!");
        } catch (error) {
            console.error("Failed to create production order", error);
            alert("Failed to create production order: " + error);
        }
    }

    function resetForm() {
        setProdDate(new Date().toISOString().split('T')[0]);
        setQuantity('1');
        setSelectedBomId('');
    }

    if (loading && orders.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="page production-page">
            {/* Hidden Print Component */}
            <div style={{ display: 'none' }}>
                <div ref={printRef}>
                    {activeCompany && printingOrder && printEntry && printSettings && (
                        <ProductionPrintView
                            company={activeCompany}
                            settings={printSettings}
                            entry={printEntry}
                            order={printingOrder}
                        />
                    )}
                </div>
            </div>

            <header className="page__header">
                <div>
                    <div className="flex items-center gap-2 text-sm text-tertiary mb-1">
                        <span className="cursor-pointer hover:text-primary" onClick={() => setView('inventory')}>Inventory</span>
                        <span>/</span>
                        <span>production</span>
                    </div>
                    <h1 className="page__title">Production Orders</h1>
                    <p className="page__subtitle">Record manufacturing and stock journals</p>
                </div>
                <div className="page__actions">
                    <button onClick={() => setView('inventory')} className="btn btn--secondary">
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <button onClick={() => setIsCreating(true)} className="btn btn--primary">
                        <Plus size={16} />
                        Record Production
                    </button>
                </div>
            </header>

            <div className="page__content">
                <div className="card">
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Voucher No</th>
                                    <th>BOM Name</th>
                                    <th className="col-amount">Quantity Produced</th>
                                    <th>Status</th>
                                    <th style={{ width: '80px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
                                            No production orders found. Record one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map(order => (
                                        <tr key={order.order_id}>
                                            <td>{new Date(order.date).toLocaleDateString()}</td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9em' }}>
                                                {order.voucher_number || '-'}
                                            </td>
                                            <td style={{ fontWeight: 500 }}>{order.bom_name}</td>
                                            <td className="col-amount">{order.quantity}</td>
                                            <td>
                                                <span className={`badge badge--${order.status === 'completed' ? 'success' : 'neutral'}`}>
                                                    {order.status}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="btn-icon"
                                                    title="Print Order"
                                                    onClick={() => handlePrint(order)}
                                                >
                                                    <Printer size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <div className="modal__header">
                            <h2 className="modal__title">New Production Entry</h2>
                            <button onClick={() => setIsCreating(false)} className="modal__close">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="modal__content">
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={prodDate}
                                    onChange={e => setProdDate(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Select BOM (Recipe)</label>
                                <select
                                    className="input"
                                    value={selectedBomId}
                                    onChange={e => setSelectedBomId(e.target.value)}
                                    required
                                >
                                    <option value="">-- Select BOM --</option>
                                    {boms.map(bom => (
                                        <option key={bom.bom_id} value={bom.bom_id}>
                                            {bom.name} (Produces: {bom.finished_good_name || 'Unknown'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Production Quantity</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    min="0.001"
                                    step="any"
                                    required
                                />
                                <small className="text-tertiary">
                                    Ingredients will be consumed automatically based on the selected BOM ratios.
                                </small>
                            </div>

                            <div className="modal__actions">
                                <button type="button" onClick={() => setIsCreating(false)} className="btn btn--secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn--primary">
                                    <Factory size={16} />
                                    Record Production
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
