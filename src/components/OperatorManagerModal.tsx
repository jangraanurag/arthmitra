import { useState } from 'react';
import { X, Edit2, Trash2, Plus } from 'lucide-react';
import { OperatorModal } from './OperatorModal';
import { EcommerceOperator } from '../store';
import { deleteEcommerceOperator, createEcommerceOperator, updateEcommerceOperator } from '../ipc';
import { useAppStore } from '../store';

interface OperatorManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    operators: EcommerceOperator[];
    onRefresh: () => void;
}

export function OperatorManagerModal({ isOpen, onClose, operators, onRefresh }: OperatorManagerModalProps) {
    const { activeCompany, addToast } = useAppStore();
    const [editingOp, setEditingOp] = useState<EcommerceOperator | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);

    if (!isOpen) return null;

    const handleDelete = async (id: string) => {
        if (!activeCompany) return;
        if (!confirm('Are you sure you want to delete this operator?')) return;
        try {
            await deleteEcommerceOperator(activeCompany.uuid, id);
            addToast({ type: 'success', message: 'Operator deleted' });
            onRefresh();
        } catch (err) {
            console.error(err);
            addToast({ type: 'error', message: 'Failed to delete' });
        }
    };

    const handleSave = async (data: { name: string; gstin: string }) => {
        if (!activeCompany) return;
        try {
            if (editingOp) {
                await updateEcommerceOperator(activeCompany.uuid, {
                    operator_id: editingOp.operator_id,
                    ...data
                });
                addToast({ type: 'success', message: 'Operator updated' });
            } else {
                await createEcommerceOperator(activeCompany.uuid, data);
                addToast({ type: 'success', message: 'Operator created' });
            }
            onRefresh();
            setEditingOp(null);
            setIsFormOpen(false);
        } catch (err) {
            console.error(err);
            addToast({ type: 'error', message: 'Failed to save' });
        }
    };

    return (
        <>
            <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: '600px', width: '100%' }}>
                    <div className="modal__header">
                        <h3>Manage E-commerce Operators</h3>
                        <button onClick={onClose} className="modal__close-btn">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="modal__body">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <button className="btn btn--primary btn--sm" onClick={() => { setEditingOp(null); setIsFormOpen(true); }}>
                                <Plus size={16} /> Add New
                            </button>
                        </div>

                        {operators.length === 0 ? (
                            <div className="text-secondary text-center py-4">No operators found.</div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>GSTIN</th>
                                        <th style={{ width: '100px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {operators.map(op => (
                                        <tr key={op.operator_id}>
                                            <td>{op.name}</td>
                                            <td>{op.gstin}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => { setEditingOp(op); setIsFormOpen(true); }}
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn-icon danger"
                                                        onClick={() => handleDelete(op.operator_id)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            <OperatorModal
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); setEditingOp(null); }}
                onSubmit={handleSave}
                initialData={editingOp}
            />
        </>
    );
}
