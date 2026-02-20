
import { CompanyInfo, JournalEntry, LedgerLine, InventoryEntry, Account, EcommerceOperator } from '../store';
import { numberToWords } from '../utils/numberToWords';
import { InventoryItem } from '../ipc';
import '../styles/invoice-print.css';

interface InvoicePrintViewProps {
    company: CompanyInfo;
    settings: Record<string, string>; // key-value map
    entry: JournalEntry;
    accounts: Account[];
    items: InventoryItem[];
    ledgerLines: LedgerLine[];
    inventoryLines: InventoryEntry[];
    operators?: EcommerceOperator[];
}

export function InvoicePrintView({
    company,
    settings,
    entry,
    accounts,
    items,
    ledgerLines,
    inventoryLines,
    operators = []
}: InvoicePrintViewProps) {

    // Helper to get account details
    const getAccount = (id: string) => accounts.find(a => a.account_id === id);
    const getItem = (id: string) => items.find(i => i.item_id === id);

    // Resolve Operator Name
    const operatorName = entry.ecommerce_operator
        ? (operators.find(o => o.operator_id === entry.ecommerce_operator)?.name || entry.ecommerce_operator)
        : null;

    // Identify the "Party" (Buyer/Supplier)
    // For Sales: The account being debited (dr) is typically the buyer
    // For Purchase: The account being credited (cr) is the supplier
    // This is a heuristic; real logic might be more complex
    const isSales = entry.voucher_type === 'sales';
    const partyLine = ledgerLines.find(l => isSales ? parseFloat(l.debit) > 0 : parseFloat(l.credit) > 0);
    const partyAccount = partyLine ? getAccount(partyLine.account_id) : null;

    // Calculate totals & Identify Tax/Charge Lines
    const totalAmount = inventoryLines.reduce((sum, line) => sum + line.amount, 0);

    // Filter Ledger Lines to find Taxes & Charges
    // Logic: Exclude Party Line AND Exclude Primary Sales/Purchase Head (which usually matches inventory total)
    // The rest are taxes, discounts, rounding off, etc.
    const chargeLines = ledgerLines.filter(l => {
        if (partyLine && l.account_id === partyLine.account_id) return false;

        // Check if line amount matches inventory total (Primary Head)
        const amount = parseFloat(l.debit) || parseFloat(l.credit);
        // Using a small epsilon for float comparison, though exact match is expected
        if (Math.abs(amount - totalAmount) < 0.1) return false;

        return true;
    });

    // Final Amount (Grand Total) comes from Party Line if available, else sum
    const finalAmount = partyLine
        ? (parseFloat(partyLine.debit) || parseFloat(partyLine.credit))
        : (totalAmount + chargeLines.reduce((sum, l) => sum + (parseFloat(l.debit) || parseFloat(l.credit)), 0));


    // Amount in Words
    const amountInWords = numberToWords(Math.round(finalAmount));

    return (
        <div className="invoice-print-view">
            {/* Header: Company & Invoice Info */}
            <div className="invoice-header">
                <div className="company-details" style={{ flex: 1 }}>
                    {settings.logo_base64 && (
                        <img
                            src={settings.logo_base64}
                            alt="Company Logo"
                            style={{ maxHeight: '80px', marginBottom: '10px' }}
                        />
                    )}
                    <h1>{company.company_name}</h1>
                    <div className="company-meta">
                        {settings.address && <div className="meta-field">{settings.address}</div>}
                        {company.gstin && <div className="meta-field"><strong>GSTIN:</strong> {company.gstin}</div>}
                        {(settings.phone || settings.email) && (
                            <div className="meta-field">
                                {settings.phone} {settings.phone && settings.email && '•'} {settings.email}
                            </div>
                        )}
                    </div>
                </div>

                <div className="invoice-meta" style={{ flex: 0.6 }}>
                    <div className="meta-title">TAX INVOICE</div>
                    <div className="meta-field"><strong>Invoice No:</strong> {entry.voucher_number || 'Pending'}</div>
                    <div className="meta-field"><strong>Date:</strong> {entry.date}</div>
                    <div className="meta-field"><strong>Place of Supply:</strong> {partyAccount?.state || company.company_name}</div>
                    {entry.is_rcm && <div className="meta-field"><strong>Rev. Charge:</strong> YES</div>}
                    {operatorName && <div className="meta-field"><strong>Sold via:</strong> {operatorName}</div>}
                </div>
            </div>

            {/* Buyer Details */}
            {partyAccount && (
                <div style={{ marginBottom: '20px', border: '1px solid #e5e7eb', padding: '10px', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Billed To</div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{partyAccount.name}</div>
                    <div className="buyer-meta">
                        {partyAccount.address && <div>{partyAccount.address}</div>}
                        {partyAccount.gstin && <div><strong>GSTIN:</strong> {partyAccount.gstin}</div>}
                        {partyAccount.state && <div><strong>State:</strong> {partyAccount.state}</div>}
                    </div>
                </div>
            )}

            {/* Inventory Table */}
            {inventoryLines.length > 0 ? (
                <table className="invoice-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Item Description</th>
                            <th style={{ width: '80px' }}>HSN/SAC</th>
                            <th style={{ width: '60px', textAlign: 'right' }}>Qty</th>
                            <th style={{ width: '80px', textAlign: 'right' }}>Rate</th>
                            <th style={{ width: '40px' }}>Unit</th>
                            <th className="amount-col" style={{ width: '100px' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inventoryLines.map((line, idx) => {
                            const item = getItem(line.item_id);
                            return (
                                <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item?.name || 'Unknown Item'}</div>
                                    </td>
                                    <td>{item?.hsn_code || '-'}</td>
                                    <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                                    <td style={{ textAlign: 'right' }}>{line.rate.toFixed(2)}</td>
                                    <td>{item?.unit_symbol || 'Nos'}</td>
                                    <td className="amount-col">{line.amount.toFixed(2)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : (
                /* Ledger Lines Table (for non-inventory vouchers) */
                <table className="invoice-table">
                    <thead>
                        <tr>
                            <th>Particulars</th>
                            <th className="amount-col" style={{ width: '120px' }}>Debit</th>
                            <th className="amount-col" style={{ width: '120px' }}>Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ledgerLines.map((line, idx) => {
                            const acc = getAccount(line.account_id);
                            return (
                                <tr key={idx}>
                                    <td>{acc?.name || 'Unknown Account'}</td>
                                    <td className="amount-col">{line.debit !== '0' ? parseFloat(line.debit).toFixed(2) : ''}</td>
                                    <td className="amount-col">{line.credit !== '0' ? parseFloat(line.credit).toFixed(2) : ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            {/* Totals Section */}
            <div className="invoice-totals">
                <div className="totals-box">
                    <div className="total-row">
                        <span>Taxable Amount</span>
                        <span>{totalAmount.toFixed(2)}</span>
                    </div>
                    {chargeLines.map((line, idx) => {
                        const acc = getAccount(line.account_id);
                        const amount = parseFloat(line.debit) || parseFloat(line.credit);
                        return (
                            <div className="total-row" key={idx}>
                                <span>{acc?.name || 'Charge'}</span>
                                <span>{amount.toFixed(2)}</span>
                            </div>
                        );
                    })}
                    <div className="total-row final">
                        <span>Total Amount</span>
                        <span>{finalAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ marginTop: '5px', fontSize: '11px', color: '#666', fontStyle: 'italic', textAlign: 'right' }}>
                        (E. & O.E.)
                    </div>
                </div>
            </div>

            {/* Amount in Words */}
            <div style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '10px 0', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Amount in Words:</span><br />
                <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>{amountInWords}</strong>
            </div>

            {/* Footer: Bank & Terms & Signature */}
            <div className="invoice-footer">
                <div className="terms-section">
                    {(settings.bank_name || settings.bank_account) && (
                        <div className="bank-details">
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Bank Details</div>
                            <div>Bank: {settings.bank_name}</div>
                            <div>A/c No: {settings.bank_account}</div>
                            <div>IFSC: {settings.bank_ifsc}</div>
                        </div>
                    )}

                    {settings.terms && (
                        <div style={{ marginTop: '15px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Terms & Conditions</div>
                            <div style={{ whiteSpace: 'pre-line', fontSize: '11px' }}>{settings.terms}</div>
                        </div>
                    )}
                </div>

                <div className="signature-section">
                    <div className="signature-box">
                        {settings.signature_base64 ? (
                            <img src={settings.signature_base64} alt="Signature" style={{ maxHeight: '60px' }} />
                        ) : (
                            <div style={{ height: '40px' }}></div>
                        )}
                    </div>
                    <div style={{ borderTop: '1px solid #000', paddingTop: '5px', fontWeight: 600 }}>
                        For, {company.company_name}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>Authorized Signatory</div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '10px', color: '#9ca3af' }}>
                This is a Computer Generated Invoice.
            </div>
        </div>
    );
}
