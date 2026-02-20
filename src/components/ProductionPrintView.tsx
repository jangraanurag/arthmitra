
import { CompanyInfo, JournalEntry } from '../store';
import { ProductionOrder } from '../ipc';
import '../styles/invoice-print.css'; // Reuse basic print styles

interface ProductionPrintViewProps {
    company: CompanyInfo;
    settings: Record<string, string>;
    entry: JournalEntry;
    order: ProductionOrder;
}

export function ProductionPrintView({
    company,
    settings,
    entry,
    order
}: ProductionPrintViewProps) {

    // Separate Inventory into Produced (IN) and Consumed (OUT)
    const producedItems = entry.inventory?.filter(i => i.txn_type === 'in') || [];
    const consumedItems = entry.inventory?.filter(i => i.txn_type === 'out') || [];

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

    return (
        <div className="invoice-print-view">
            {/* Header */}
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
                    </div>
                </div>

                <div className="invoice-meta" style={{ flex: 0.6 }}>
                    <div className="meta-title">PRODUCTION ORDER</div>
                    <div className="meta-field"><strong>Voucher No:</strong> {entry.voucher_number || order.voucher_number || '-'}</div>
                    <div className="meta-field"><strong>Date:</strong> {formatDate(entry.date)}</div>
                    <div className="meta-field"><strong>BOM Name:</strong> {order.bom_name}</div>
                    <div className="meta-field"><strong>Status:</strong> {order.status}</div>
                </div>
            </div>

            {/* Finished Goods Section */}
            <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                    Finished Goods (Output)
                </h3>
                <table className="invoice-table">
                    <thead>
                        <tr>
                            <th style={{ width: '50px' }}>#</th>
                            <th>Item Description</th>
                            <th style={{ width: '100px', textAlign: 'right' }}>Quantity</th>
                            <th style={{ width: '80px' }}>Unit</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Cost/Rate</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {producedItems.map((item, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td>{item.item_name}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                                <td>{item.unit_symbol}</td>
                                <td style={{ textAlign: 'right' }}>{item.rate.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{item.amount.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Raw Materials Section */}
            <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                    Raw Materials Consumed (Input)
                </h3>
                <table className="invoice-table">
                    <thead>
                        <tr>
                            <th style={{ width: '50px' }}>#</th>
                            <th>Item Description</th>
                            <th style={{ width: '100px', textAlign: 'right' }}>Quantity</th>
                            <th style={{ width: '80px' }}>Unit</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Rate</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consumedItems.map((item, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td>{item.item_name}</td>
                                <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                                <td>{item.unit_symbol}</td>
                                <td style={{ textAlign: 'right' }}>{item.rate.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{item.amount.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Narration */}
            <div style={{ marginTop: '20px', fontSize: '12px', border: '1px solid #eee', padding: '8px' }}>
                <strong>Narration:</strong> {entry.narration}
            </div>

            {/* Footer Signatures */}
            <div className="invoice-footer">
                <div style={{ flex: 1 }}></div> {/* Spacer */}
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

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '10px', color: '#9ca3af' }}>
                This is a Computer Generated Document.
            </div>
        </div>
    );
}
