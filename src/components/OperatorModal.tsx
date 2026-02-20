import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface OperatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; gstin: string }) => Promise<void>;
    initialData?: { name: string; gstin: string } | null;
}

export function OperatorModal({ isOpen, onClose, onSubmit, initialData }: OperatorModalProps) {
    const [name, setName] = useState('');
    const [gstin, setGstin] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setName(initialData.name);
            setGstin(initialData.gstin);
        } else if (isOpen) {
            setName('');
            setGstin('');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit({ name, gstin });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal__header">
                    <h3>{initialData ? 'Edit E-commerce Operator' : 'Add E-commerce Operator'}</h3>
                    <button onClick={onClose} className="modal__close-btn">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal__body">
                        <div className="input-group mb-4">
                            <label className="input-group__label">Operator Name</label>
                            <input
                                type="text"
                                className="input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Amazon, Flipkart"
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-group__label">GSTIN</label>
                            <input
                                type="text"
                                className="input"
                                value={gstin}
                                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                                placeholder="e.g. 27AAAAA0000A1Z5"
                                required
                                maxLength={15}
                            />
                        </div>
                    </div>
                    <div className="modal__footer">
                        <button type="button" onClick={onClose} className="btn btn--secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn--primary" disabled={loading}>
                            {loading ? 'Saving...' : (initialData ? 'Update Operator' : 'Save Operator')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
