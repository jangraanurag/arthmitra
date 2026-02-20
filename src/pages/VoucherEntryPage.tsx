import { useState, useEffect, useMemo } from 'react';
import {
    createEntry, updateEntry, getLedger, getAccounts, getItems, InventoryItem,
    getCompanySettings, getEcommerceOperators
} from '../ipc';
import { Plus, Trash2, Save, ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { calculateGST } from '../utils/tax';
import { useAppStore, JournalEntry, Account, EcommerceOperator } from '../store';
import { InvoicePrintView } from '../components/InvoicePrintView';

import { OperatorManagerModal } from '../components/OperatorManagerModal';


interface LineItem {
    id: string;
    accountId: string;
    debit: string;
    credit: string;
}

interface InventoryLine {
    id: string;
    itemId: string;
    quantity: string;
    rate: string;
    amount: string;
    taxInclusive: boolean;
}

const VOUCHER_TYPES = [
    { id: 'journal', label: 'Journal' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'payment', label: 'Payment' },
    { id: 'contra', label: 'Contra' },
    { id: 'sales', label: 'Sales' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'debit_note', label: 'Debit Note' },
    { id: 'credit_note', label: 'Credit Note' },
];

export function VoucherEntryPage() {
    const { activeCompany, addToast, setView, editingEntryId, setEditingEntryId } = useAppStore();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [items, setItems] = useState<InventoryItem[]>([]);

    const [settings, setSettings] = useState<Record<string, string>>({});

    useEffect(() => {
        if (activeCompany) {
            getCompanySettings(activeCompany.uuid).then(setSettings).catch(console.error);
        }
    }, [activeCompany]);

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [voucherType, setVoucherType] = useState('journal');
    /* New State for Voucher Number */
    const [voucherNumber, setVoucherNumber] = useState('');
    const [autoVoucherNumber, setAutoVoucherNumber] = useState('');

    const [narration, setNarration] = useState('');
    const [isRCM, setIsRCM] = useState(false);
    const [ecommerceOperator, setEcommerceOperator] = useState(''); // Stores ID now
    const [operators, setOperators] = useState<EcommerceOperator[]>([]);
    const [showManagerModal, setShowManagerModal] = useState(false);

    // Ledger Lines
    const [lines, setLines] = useState<LineItem[]>([
        { id: '1', accountId: '', debit: '', credit: '' },
        { id: '2', accountId: '', debit: '', credit: '' },
    ]);

    // Inventory Lines
    const [invLines, setInvLines] = useState<InventoryLine[]>([]);
    const [showInventory, setShowInventory] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [lastSavedEntry, setLastSavedEntry] = useState<JournalEntry | null>(null);
    const [loadingEntry, setLoadingEntry] = useState(false);

    useEffect(() => {
        if (activeCompany) {
            loadAccounts();
            loadItems();
            loadSettings();
            loadOperators();
        }
    }, [activeCompany]);

    useEffect(() => {
        // Auto-show inventory for Sales/Purchase
        if (voucherType === 'sales' || voucherType === 'purchase') {
            setShowInventory(true);
            if (invLines.length === 0) {
                addInvLine();
            }
        }
    }, [voucherType]);

    // Fetch next voucher number when type changes (only if not editing)
    useEffect(() => {
        if (activeCompany && !editingEntryId) {
            import('../ipc').then(mod => {
                mod.getNextVoucherNumber(activeCompany.uuid, voucherType)
                    .then(num => {
                        setVoucherNumber(num);
                        setAutoVoucherNumber(num);
                    })
                    .catch(console.error);
            });
        }
    }, [activeCompany, voucherType, editingEntryId]);

    useEffect(() => {
        if (activeCompany && editingEntryId) {
            loadEntry(editingEntryId);
        } else {
            // Reset form if not editing (e.g. switched from Edit to New)
            if (!editingEntryId) resetForm();
        }
    }, [activeCompany, editingEntryId]);



    async function loadSettings() {
        if (!activeCompany) return;
        try {
            await getCompanySettings(activeCompany.uuid);
            // setSettings(s); // If we had local state
        } catch (err) {
            console.error(err);
        }
    }

    async function loadOperators() {
        if (!activeCompany) return;
        try {
            const list = await getEcommerceOperators(activeCompany.uuid);
            setOperators(list);
        } catch (err) {
            console.error(err);
        }
    }

    async function loadEntry(entryId: string) {
        if (!activeCompany) return;
        setLoadingEntry(true);
        try {
            const result = await getLedger(activeCompany.uuid, { entry_id: entryId });
            if (result.entries.length > 0) {
                const entry = result.entries[0];
                setDate(entry.date);
                setVoucherType(entry.voucher_type);
                setNarration(entry.narration);
                // Set voucher number
                setVoucherNumber(entry.voucher_number);
                setAutoVoucherNumber(entry.voucher_number);

                setIsRCM(entry.is_rcm || false);
                setEcommerceOperator(entry.ecommerce_operator || '');

                // Map lines
                const newLines = result.lines.map(l => ({
                    id: crypto.randomUUID(),
                    accountId: l.account_id,
                    debit: l.debit !== '0' ? l.debit : '',
                    credit: l.credit !== '0' ? l.credit : ''
                }));
                while (newLines.length < 2) {
                    newLines.push({ id: crypto.randomUUID(), accountId: '', debit: '', credit: '' });
                }
                setLines(newLines);

                // Map Inventory
                if (entry.inventory && entry.inventory.length > 0) {
                    setShowInventory(true);
                    setInvLines(entry.inventory.map(inv => ({
                        id: crypto.randomUUID(),
                        itemId: inv.item_id,
                        quantity: inv.quantity.toString(),
                        rate: inv.rate.toString(),
                        amount: inv.amount.toString(),
                        taxInclusive: inv.tax_inclusive || false
                    })));
                } else {
                    setInvLines([]);
                    setShowInventory(false);
                }
            }
        } catch (err) {
            console.error("Failed to load entry", err);
            addToast({ type: 'error', message: 'Failed to load entry details' });
        } finally {
            setLoadingEntry(false);
        }
    }

    async function loadAccounts() {
        if (!activeCompany) return;
        try {
            const data = await getAccounts(activeCompany.uuid);
            setAccounts(data);
        } catch (err) {
            console.error('Failed to load accounts', err);
            addToast({ type: 'error', message: 'Failed to load accounts' });
        }
    }

    async function loadItems() {
        if (!activeCompany) return;
        try {
            const data = await getItems(activeCompany.uuid);
            setItems(data);
        } catch (err) {
            console.error('Failed to load items', err);
        }
    }

    const { totalDebit, totalCredit, isBalanced } = useMemo(() => {
        // ... (Memo content unchanged)
        let d = 0, c = 0;
        lines.forEach(line => {
            d += parseFloat(line.debit || '0');
            c += parseFloat(line.credit || '0');
        });
        return {
            totalDebit: d,
            totalCredit: c,
            isBalanced: Math.abs(d - c) < 0.01 && d > 0 // Balanced and not zero
        };
    }, [lines]);

    const totalInventoryValue = useMemo(() => {
        return invLines.reduce((acc, line) => acc + parseFloat(line.amount || '0'), 0);
    }, [invLines]);

    function addLine() {
        setLines([...lines, { id: crypto.randomUUID(), accountId: '', debit: '', credit: '' }]);
    }

    function removeLine(id: string) {
        if (lines.length <= 2) return; // Maintain minimum 2 lines
        setLines(lines.filter(l => l.id !== id));
    }

    function updateLine(id: string, field: keyof LineItem, value: string) {
        setLines(lines.map(l => {
            if (l.id !== id) return l;

            // Auto-clear opposite field if debit/credit entered
            const updates: any = { [field]: value };
            if (field === 'debit' && value) updates.credit = '';
            if (field === 'credit' && value) updates.debit = '';

            return { ...l, ...updates };
        }));
    }

    // Inventory Handlers
    function addInvLine() {
        setInvLines([...invLines, { id: crypto.randomUUID(), itemId: '', quantity: '', rate: '', amount: '', taxInclusive: false }]);
    }

    function removeInvLine(id: string) {
        setInvLines(invLines.filter(l => l.id !== id));
    }

    function updateInvLine(id: string, field: keyof InventoryLine, value: any) {
        setInvLines(invLines.map(l => {
            if (l.id !== id) return l;

            const updates: any = { [field]: value };

            // Auto-calculate amount
            if (field === 'quantity' || field === 'rate') {
                const qty = field === 'quantity' ? parseFloat(value || '0') : parseFloat(l.quantity || '0');
                const rate = field === 'rate' ? parseFloat(value || '0') : parseFloat(l.rate || '0');
                if (qty && rate) {
                    updates.amount = (qty * rate).toFixed(2);
                }
            }

            return { ...l, ...updates };
        }));
    }

    // ── GST Calculation ────────────────────────────────────────────────

    // ... (GST Effect unchanged)
    useEffect(() => {
        if (!showInventory || invLines.length === 0 || lines.length === 0 || !activeCompany) return;

        // 1. Determine Inter-State or Intra-State
        // Note: For now, assuming Company State is part of CompanyInfo or fetched separately. 
        // Ideally we need specific state code. 
        // Let's rely on the user selecting a party which has a state.

        const partyId = lines[0].accountId;
        const party = accounts.find(a => a.account_id === partyId);

        // Skip if no party selected
        if (!party) return;

        // Skip if standard manually modified lines (heuristic: if user manually editing tax lines, stop auto-calc)
        // For this phase, we'll force auto-calc for simplicity when inventory changes.

        const partyState = party.state || '';
        const myState = activeCompany.gstin ? activeCompany.gstin.substring(0, 2) : '';
        // Fallback: If no GSTIN, maybe use address. For now, simple logic:
        // If Party State Code != My State Code => Inter-State.
        // If either is missing, assume Intra-State (or ask user).

        // We need 'My State' reliably. 
        // Assumption: activeCompany has partial data. We might need `getCompanyProfile` if `state` isn't on `activeCompany`. 
        // `CompanyInfo` in store has `gstin`.

        let isInterState = false;
        if (partyState && myState) {
            // Extract first 2 chars if they are numeric state codes (e.g. "27" for MH)
            // Or just compare strings if they are full names.
            // Let's assume standard GST state codes are used or full names match.
            isInterState = partyState.toLowerCase() !== myState.toLowerCase();
            // If GSTINs exist, compare first 2 chars
            if (party.gstin && activeCompany.gstin) {
                isInterState = party.gstin.substring(0, 2) !== activeCompany.gstin.substring(0, 2);
            }
        }

        // 2. Prepare Items for Calculation
        const calcItems = invLines.map(line => {
            const item = items.find(i => i.item_id === line.itemId);
            let amount = parseFloat(line.amount || '0');
            const taxRate = item?.tax_rate || 0;

            // If Inclusive, back-calculate Taxable Value
            if (line.taxInclusive && taxRate > 0) {
                // Formula: Taxable = Amount / (1 + Rate/100)
                amount = amount / (1 + (taxRate / 100));
            }

            return {
                amount: amount,
                taxRate: taxRate
            };
        });

        // 3. Calculate GST
        const { total } = calculateGST(calcItems, isInterState);

        // 4. Update Ledger Lines automatically
        // Rules:
        // Line 0: Party (Debtor/Creditor) -> Total Amount (Taxable + Tax)
        // Line 1: Sales / Purchase Account -> Total Taxable
        // Line 2+: Tax Duties

        // Only auto-update if we are in Sales or Purchase mode
        if (voucherType !== 'sales' && voucherType !== 'purchase') return;

        // Construct new lines
        const newLines = [...lines];

        // Ensure Line 0 (Party) exists
        if (newLines.length < 1) return;

        // Line 0: Party
        // If Sales: Debit Party. If Purchase: Credit Party.
        const isSales = voucherType === 'sales';
        if (isSales) {
            newLines[0].debit = total.totalAmount.toFixed(2);
            newLines[0].credit = '';
        } else {
            newLines[0].credit = total.totalAmount.toFixed(2);
            newLines[0].debit = '';
        }

        // Line 1: Sales/Purchase Account
        // We need to find or create a slot.
        if (newLines.length < 2) newLines.push({ id: crypto.randomUUID(), accountId: '', debit: '', credit: '' });

        // We typically need to know WHICH Sales/Purchase account to use.
        // For now, we keep the accountId if the user selected one, else blank.
        // We just update the amount.
        if (isSales) {
            newLines[1].credit = total.taxableValue.toFixed(2);
            newLines[1].debit = '';
        } else {
            newLines[1].debit = total.taxableValue.toFixed(2);
            newLines[1].credit = '';
        }

        // Tax Lines (Output/Input IGST/CGST/SGST)
        // We need to find these accounts in the Chart of Accounts automatically?
        // OR we just append lines and let the user select the Duty Ledger, but we pre-fill amounts.
        // BETTER: Look for existing lines with Duty accounts, if not, add them.
        // Since looking up by name "Output CGST" is flaky, let's just append/update lines 2, 3, 4... based on needed taxes.

        // Strategy:
        // Keep Line 0 and 1 fixed (Party and Sales/Purc). 
        // Replace subsequent lines with Tax lines.

        // Find system accounts for taxes? 
        // For this phase, we will just CREATE calculated lines. User must pick the Account (e.g., "Output CGST @ 9%").
        // We can hint the amount.

        // Actually, to fully automate, we need to map Tax Rates to Accounts. 
        // E.g. 18% -> "Output IGST 18%".
        // Without mapping, we can't select the accountId.
        // So we will just update the Amounts of lines 2, 3, etc. if they match the count, 
        // or Add lines with empty accounts but correct amounts.

        // Let's try to match existing selected accounts if they look like tax accounts.
        // But simplest MVP: Clear lines 2+ and re-add them with empty Account IDs but filled Amounts.
        // User selects the specific tax ledger.

        // However, this clears user work if they already selected accounts.

        // compromise: 
        // If isInterState: We need 1 Tax Line (IGST).
        // If Intra: We need 2 Tax Lines (CGST, SGST).

        let lineIndex = 2; // Start after Party and Sales

        // Function to update or create line
        // Function to update or create line with auto-select tax ledger
        const setLineAmount = (index: number, amt: number, type: 'dr' | 'cr', taxType?: 'CGST' | 'SGST' | 'IGST') => {
            if (index >= newLines.length) {
                newLines.push({ id: crypto.randomUUID(), accountId: '', debit: '', credit: '' });
            }
            if (type === 'dr') {
                newLines[index].debit = amt.toFixed(2);
                newLines[index].credit = '';
            } else {
                newLines[index].credit = amt.toFixed(2);
                newLines[index].debit = '';
            }

            // Auto-select tax account if empty and taxType provided
            if (taxType && !newLines[index].accountId) {
                const prefix = isSales ? 'Output' : 'Input';
                const typeLower = taxType.toLowerCase();
                const prefixLower = prefix.toLowerCase();

                // 1. Try "Output CGST" / "Input CGST"
                let acc = accounts.find(a => a.name.toLowerCase().includes(`${prefixLower} ${typeLower} `));
                // 2. Try "CGST Output" / "CGST Input"
                if (!acc) acc = accounts.find(a => a.name.toLowerCase().includes(`${typeLower} ${prefixLower} `));
                // 3. Try just "CGST" / "SGST" (ensure it matches the right group partially based on sales/purchase if possible, but name is key)
                if (!acc) acc = accounts.find(a => a.name.toLowerCase().includes(typeLower));

                if (acc) newLines[index].accountId = acc.account_id;
            }
        };

        if (isInterState) {
            if (total.igst > 0) {
                setLineAmount(lineIndex, total.igst, isSales ? 'cr' : 'dr', 'IGST');
                lineIndex++;
            }
        } else {
            if (total.cgst > 0) {
                setLineAmount(lineIndex, total.cgst, isSales ? 'cr' : 'dr', 'CGST');
                lineIndex++;
            }
            if (total.sgst > 0) {
                setLineAmount(lineIndex, total.sgst, isSales ? 'cr' : 'dr', 'SGST');
                lineIndex++;
            }
        }

        // Remove extra lines if we shrank
        if (newLines.length > lineIndex) {
            // Check if trailing lines are empty/tax lines? 
            // Aggressive pruning might be annoying.
            // Let's just update the state.
            // setLines(newLines.slice(0, lineIndex));
            // Only slice if we are strictly in automation mode.
            setLines(newLines.slice(0, lineIndex));
        } else {
            setLines([...newLines]);
        }

    }, [invLines, voucherType, lines[0]?.accountId]); // Dep on Party choice

    async function handleSubmit(e: React.FormEvent, shouldPrint = false) {
        e.preventDefault();
        if (!activeCompany) return;
        if (!isBalanced) {
            addToast({ type: 'error', message: 'Voucher is not balanced!' });
            return;
        }
        if (lines.some(l => !l.accountId)) {
            addToast({ type: 'error', message: 'Please select accounts for all lines' });
            return;
        }
        if (showInventory && invLines.some(l => !l.itemId)) {
            addToast({ type: 'error', message: 'Please select items for all inventory lines' });
            return;
        }

        setSubmitting(true);
        try {
            let entry: JournalEntry;

            const txnType = (voucherType === 'sales' || voucherType === 'debit_note') ? 'out' : 'in';

            /* Logic to determine if we send voucher_number (Manual) or undefined (Auto) */
            let finalVoucherNumber: string | undefined = undefined;

            if (editingEntryId) {
                // If editing, always send the number (don't want auto-regen logic to run)
                finalVoucherNumber = voucherNumber;
            } else {
                // Creating new
                if (voucherNumber !== autoVoucherNumber) {
                    finalVoucherNumber = voucherNumber;
                }
                // Else leave undefined, backend will auto-gen
            }

            const payload = {
                date,
                voucher_number: finalVoucherNumber,
                voucher_type: voucherType,
                narration,
                source: 'manual',
                actor_type: 'human',
                is_rcm: isRCM,
                ecommerce_operator: ecommerceOperator || undefined,
                lines: lines.map(l => ({
                    account_id: l.accountId,
                    debit: l.debit || '0',
                    credit: l.credit || '0'
                })),
                inventory: showInventory ? invLines.map(l => ({
                    item_id: l.itemId,
                    txn_type: txnType,
                    quantity: parseFloat(l.quantity || '0'),
                    rate: parseFloat(l.rate || '0'),
                    amount: parseFloat(l.amount || '0'),
                    tax_inclusive: l.taxInclusive
                })) : undefined
            };

            if (editingEntryId) {
                entry = await updateEntry(activeCompany.uuid, {
                    entry_id: editingEntryId,
                    ...payload,
                });
            } else {
                entry = await createEntry(activeCompany.uuid, payload);
            }

            setLastSavedEntry(entry);
            addToast({ type: 'success', message: editingEntryId ? 'Voucher updated' : 'Voucher saved successfully' });

            if (shouldPrint) {
                setTimeout(() => {
                    window.print();
                    if (editingEntryId) {
                        setEditingEntryId(null);
                        setView('ledger');
                    } else {
                        // Refresh next number
                        resetForm();
                    }
                }, 100);
            } else {
                if (editingEntryId) {
                    setEditingEntryId(null);
                    setView('ledger');
                } else {
                    resetForm();
                }
            }
        } catch (err: any) {
            addToast({ type: 'error', message: `Save failed: ${err} ` });
        } finally {
            setSubmitting(false);
        }
    }

    function resetForm() {
        setLines([
            { id: crypto.randomUUID(), accountId: '', debit: '', credit: '' },
            { id: crypto.randomUUID(), accountId: '', debit: '', credit: '' },
        ]);
        setInvLines([]);
        setShowInventory(false);
        setNarration('');
        // Refresh next number
        if (activeCompany) {
            import('../ipc').then(mod => {
                mod.getNextVoucherNumber(activeCompany.uuid, voucherType)
                    .then(num => {
                        setVoucherNumber(num);
                        setAutoVoucherNumber(num);
                    })
                    .catch(console.error);
            });
        }
    }

    return (
        <div className="page voucher-page">
            <header className="page__header">
                <div>
                    <h1 className="page__title">{editingEntryId ? 'Edit Voucher' : 'Voucher Entry'}</h1>
                    <p className="page__subtitle">{editingEntryId ? 'Update transaction details' : 'Record financial transactions'}</p>
                </div>
                <div className="page__actions">
                    <button onClick={() => { setEditingEntryId(null); setView('ledger'); }} className="btn btn--secondary">
                        <ArrowLeft size={16} />
                        Back to Ledger
                    </button>
                    {editingEntryId && (
                        <button onClick={() => { setEditingEntryId(null); resetForm(); }} className="btn btn--ghost text-danger">
                            Cancel Edit
                        </button>
                    )}
                </div>
            </header>

            {loadingEntry ? (
                <div className="card" style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={32} className="spin text-tertiary" />
                    <p style={{ marginTop: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading entry details...</p>
                </div>
            ) : (
                <form className="voucher-form" onSubmit={handleSubmit}>
                    <div className="voucher-header card">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Voucher Type</label>
                                <select
                                    className="input"
                                    value={voucherType}
                                    onChange={e => setVoucherType(e.target.value)}
                                >
                                    {VOUCHER_TYPES.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Voucher No.</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Auto"
                                    value={voucherNumber}
                                    onChange={e => setVoucherNumber(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 2 }}>
                                <label>Narration</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Enter transaction details..."
                                    value={narration}
                                    onChange={e => setNarration(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label>Reverse Charge (RCM)</label>
                                <select
                                    className="input"
                                    value={isRCM ? 'yes' : 'no'}
                                    onChange={e => setIsRCM(e.target.value === 'yes')}
                                >
                                    <option value="no">Not Applicable</option>
                                    <option value="yes">Applicable (General)</option>
                                    {/* Future expansion: <option value="9_3">U/S 9(3) Compulsory</option> */}
                                    {/* Future expansion: <option value="9_4">U/S 9(4) Unregistered</option> */}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 2 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ marginBottom: 0 }}>E-commerce Operator</label>
                                    <button
                                        type="button"
                                        className="btn-link"
                                        style={{ fontSize: '12px' }}
                                        onClick={() => setShowManagerModal(true)}
                                    >
                                        Manage
                                    </button>
                                </div>
                                <select
                                    className="input"
                                    value={ecommerceOperator}
                                    onChange={e => setEcommerceOperator(e.target.value)}
                                >
                                    <option value="">-- None --</option>
                                    {operators.map(op => (
                                        <option key={op.operator_id} value={op.operator_id}>
                                            {op.name} ({op.gstin})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>



                    {/* Inventory Section */}
                    <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showInventory ? 'var(--space-4)' : 0 }}>
                            <label className="checkbox-label" style={{ fontWeight: 600 }}>
                                <input
                                    type="checkbox"
                                    checked={showInventory}
                                    onChange={e => {
                                        setShowInventory(e.target.checked);
                                        if (e.target.checked && invLines.length === 0) addInvLine();
                                    }}
                                />
                                Include Inventory Details
                            </label>
                            {showInventory && (
                                <div className="text-sm text-secondary">
                                    Total Value: <strong>{totalInventoryValue.toFixed(2)}</strong>
                                </div>
                            )}
                        </div>

                        {showInventory && (
                            <div className="inventory-grid">
                                <div className="grid-header" style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 60px 40px' }}>
                                    <div>Item</div>
                                    <div className="text-right">Quantity</div>
                                    <div className="text-right">Rate</div>
                                    <div className="text-right">Amount</div>
                                    <div className="text-center" style={{ fontSize: '12px' }}>Tax Incl.</div>
                                    <div></div>
                                </div>
                                {invLines.map((line) => (
                                    <div key={line.id} className="grid-row" style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 60px 40px' }}>
                                        <div>
                                            <select
                                                className="input"
                                                value={line.itemId}
                                                onChange={e => updateInvLine(line.id, 'itemId', e.target.value)}
                                            >
                                                <option value="">Select Item...</option>
                                                {items.map(item => (
                                                    <option key={item.item_id} value={item.item_id}>{item.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <input
                                                type="number"
                                                className="input text-right"
                                                placeholder="Qty"
                                                value={line.quantity}
                                                onChange={e => updateInvLine(line.id, 'quantity', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <input
                                                type="number"
                                                className="input text-right"
                                                placeholder="Rate"
                                                value={line.rate}
                                                onChange={e => updateInvLine(line.id, 'rate', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <input
                                                type="number"
                                                className="input text-right"
                                                placeholder="Amount"
                                                value={line.amount}
                                                onChange={e => updateInvLine(line.id, 'amount', e.target.value)}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={line.taxInclusive}
                                                onChange={e => updateInvLine(line.id, 'taxInclusive', e.target.checked)}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </div>
                                        <div className="col-action">
                                            <button type="button" className="btn-icon danger" onClick={() => removeInvLine(line.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div className="grid-footer">
                                    <button type="button" className="btn btn--secondary btn--sm" onClick={addInvLine}>
                                        <Plus size={16} /> Add Item
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="voucher-grid card">
                        <div className="grid-header">
                            <div className="col-account">Account</div>
                            <div className="col-amount">Debit</div>
                            <div className="col-amount">Credit</div>
                            <div className="col-action"></div>
                        </div>

                        {lines.map((line) => (
                            <div key={line.id} className="grid-row">
                                <div className="col-account">
                                    <select
                                        className="input"
                                        value={line.accountId}
                                        onChange={e => updateLine(line.id, 'accountId', e.target.value)}
                                    >
                                        <option value="">Select Account...</option>
                                        {accounts.map(acc => (
                                            <option key={acc.account_id} value={acc.account_id}>
                                                {acc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-amount">
                                    <input
                                        type="number"
                                        className="input text-right"
                                        placeholder="0.00"
                                        value={line.debit}
                                        onChange={e => updateLine(line.id, 'debit', e.target.value)}
                                        disabled={!!line.credit}
                                    />
                                </div>
                                <div className="col-amount">
                                    <input
                                        type="number"
                                        className="input text-right"
                                        placeholder="0.00"
                                        value={line.credit}
                                        onChange={e => updateLine(line.id, 'credit', e.target.value)}
                                        disabled={!!line.debit}
                                    />
                                </div>
                                <div className="col-action">
                                    <button
                                        type="button"
                                        className="btn-icon danger"
                                        onClick={() => removeLine(line.id)}
                                        tabIndex={-1}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div className="grid-footer">
                            <button type="button" className="btn btn--secondary btn--sm" onClick={addLine}>
                                <Plus size={16} /> Add Line
                            </button>
                        </div>

                        <div className="grid-totals">
                            <div className="total-label">Total</div>
                            <div className="total-amount">{totalDebit.toFixed(2)}</div>
                            <div className="total-amount">{totalCredit.toFixed(2)}</div>
                            <div className="total-status">
                                {isBalanced ? (
                                    <span className="badge success">Balanced</span>
                                ) : (
                                    <span className="badge danger">Unbalanced ({Math.abs(totalDebit - totalCredit).toFixed(2)})</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || !isBalanced}>
                            <Save size={18} />
                            {submitting ? (editingEntryId ? 'Updating...' : 'Saving...') : (editingEntryId ? 'Update Voucher' : 'Save Voucher')}
                        </button>
                        <button
                            type="button"
                            className="btn btn--secondary btn--lg"
                            disabled={submitting || !isBalanced}
                            onClick={(e) => handleSubmit(e as any, true)}
                        >
                            <Printer size={18} />
                            {editingEntryId ? 'Update & Print' : 'Save & Print'}
                        </button>
                    </div>
                </form>
            )}

            <OperatorManagerModal
                isOpen={showManagerModal}
                onClose={() => setShowManagerModal(false)}
                operators={operators}
                onRefresh={loadOperators}
            />



            {/* Print Template (Hidden on screen, visible on print via CSS) */}
            {
                activeCompany && (
                    <InvoicePrintView
                        company={activeCompany}
                        settings={settings}
                        entry={{
                            entry_id: lastSavedEntry?.entry_id || '',
                            voucher_number: lastSavedEntry?.voucher_number || '',
                            date: date,
                            voucher_type: voucherType,
                            narration: narration,
                            is_rcm: isRCM,
                            ecommerce_operator: ecommerceOperator,
                            source: 'manual',
                            created_by: 'user',
                            actor_type: 'human',
                            approval_status: 'approved',
                            checksum: '',
                            created_at: new Date().toISOString(),
                            inventory: [], // This is unused in InvoicePrintView since we pass inventoryLines prop
                        }}
                        accounts={accounts}
                        items={items}
                        ledgerLines={lines.map(l => ({
                            line_id: l.id,
                            entry_id: '',
                            account_id: l.accountId,
                            account_name: '', // Resolved inside component
                            debit: l.debit || '0',
                            credit: l.credit || '0'
                        }))}
                        inventoryLines={invLines.map(l => ({
                            item_id: l.itemId,
                            txn_type: 'out',
                            quantity: parseFloat(l.quantity || '0'),
                            rate: parseFloat(l.rate || '0'),
                            amount: parseFloat(l.amount || '0')
                        }))}
                        operators={operators}
                    />
                )
            }

            {/* Keeping styles inline for simplicity as requested, but cleaned up */}
            <style>{`
                .voucher-page {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .voucher-header {
                    padding: var(--space-4);
                    margin-bottom: var(--space-4);
                }
                .form-row {
                    display: flex;
                    gap: var(--space-4);
                }
                .form-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-2);
                }
                .voucher-grid, .inventory-grid {
                    padding: var(--space-4);
                }
                .grid-header {
                    display: grid;
                    grid-template-columns: 3fr 1fr 1fr 40px;
                    gap: var(--space-2);
                    padding-bottom: var(--space-2);
                    border-bottom: 1px solid var(--color-border);
                    font-weight: 500;
                    color: var(--color-text-secondary);
                }
                .grid-row {
                    display: grid;
                    grid-template-columns: 3fr 1fr 1fr 40px;
                    gap: var(--space-2);
                    padding: var(--space-2) 0;
                    align-items: center;
                }
                .col-amount input {
                    font-family: monospace;
                }
                .text-right { text-align: right; }
                .grid-totals {
                    display: grid;
                    grid-template-columns: 3fr 1fr 1fr 1fr 60px 40px;
                    gap: var(--space-2);
                    padding-top: var(--space-4);
                    border-top: 2px solid var(--color-border);
                    font-weight: 700;
                }
                .total-amount { text-align: right; }
                .grid-footer { margin-top: var(--space-2); }
                .form-actions {
                    margin-top: var(--space-6);
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-2);
                }
                .grid-header-title {
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    font-size: 14px;
                }
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                    cursor: pointer;
                    user-select: none;
                }
            `}</style>
        </div >
    );
}
