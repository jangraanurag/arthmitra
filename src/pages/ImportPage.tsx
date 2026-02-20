import { useState } from 'react';
import { useAppStore, ImportResult, ImportPreview } from '../store';
import { readImportFile, importLedgers, importItems } from '../ipc';
import { open } from '@tauri-apps/plugin-dialog';
import { Upload, FileSpreadsheet, Check, AlertCircle, ArrowRight, Save, Loader2 } from 'lucide-react';

const LEDGER_FIELDS = [
    { key: 'name', label: 'Party / Ledger Name (Required)' },
    { key: 'account_type', label: 'Account Group / Type' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'state', label: 'State' },
    { key: 'address', label: 'Address' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'opening_balance', label: 'Opening Balance' },
];

const ITEM_FIELDS = [
    { key: 'name', label: 'Item Name (Required)' },
    { key: 'sku', label: 'SKU / Code' },
    { key: 'hsn_code', label: 'HSN Code' },
    { key: 'unit', label: 'Unit Symbol (e.g. pcs)' },
    { key: 'tax_rate', label: 'Tax Rate (%)' },
    { key: 'description', label: 'Description' },
    { key: 'opening_qty', label: 'Opening Quantity' },
    { key: 'opening_value', label: 'Opening Value' },
];

export function ImportPage() {
    const { activeCompany, addToast } = useAppStore();
    const [importType, setImportType] = useState<'ledgers' | 'items'>('ledgers');
    const [filePath, setFilePath] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);

    const systemFields = importType === 'ledgers' ? LEDGER_FIELDS : ITEM_FIELDS;

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Spreadsheet',
                    extensions: ['csv', 'xlsx', 'xls']
                }]
            });

            if (selected && typeof selected === 'string') {
                setFilePath(selected);
                setLoading(true);
                setResult(null);
                try {
                    const data = await readImportFile(selected);
                    setPreview(data);

                    // Auto-map logic
                    const newMapping: Record<string, string> = {};
                    data.headers.forEach(header => {
                        const lowerHeader = header.toLowerCase();
                        const match = systemFields.find(f =>
                            lowerHeader.includes(f.label.toLowerCase().split(' ')[0]) ||
                            lowerHeader === f.key
                        );
                        if (match) {
                            newMapping[header] = match.key;
                        }
                    });
                    setMapping(newMapping);
                } catch (e) {
                    addToast({ type: 'error', message: `Failed to read file: ${e}` });
                    setFilePath(null);
                } finally {
                    setLoading(false);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleImport = async () => {
        if (!activeCompany || !filePath) return;

        // Validation: Ensure 'name' is mapped
        const nameMapped = Object.values(mapping).includes('name');
        if (!nameMapped) {
            addToast({ type: 'error', message: 'Please map the "Name" field.' });
            return;
        }

        setLoading(true);
        try {
            let res: ImportResult;
            if (importType === 'ledgers') {
                res = await importLedgers(activeCompany.uuid, filePath, mapping);
            } else {
                res = await importItems(activeCompany.uuid, filePath, mapping);
            }
            setResult(res);
            if (res.error_count === 0) {
                addToast({ type: 'success', message: `Successfully imported ${res.success_count} records.` });
            } else {
                addToast({ type: 'warning', message: `Imported ${res.success_count} records with ${res.error_count} errors.` });
            }
        } catch (e) {
            addToast({ type: 'error', message: `Import failed: ${e}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="main-content">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Data Import</h1>
                    <p className="page-header__subtitle">Bulk import Ledgers and Items from Excel/CSV</p>
                </div>
            </div>

            <div className="card max-w-4xl mx-auto">
                <div className="card__header">
                    <div className="tabs flex gap-2">
                        <button
                            className={`btn ${importType === 'ledgers' ? 'btn--primary' : 'btn--ghost'}`}
                            onClick={() => { setImportType('ledgers'); setPreview(null); setFilePath(null); setResult(null); }}
                        >
                            Ledgers / Parties
                        </button>
                        <button
                            className={`btn ${importType === 'items' ? 'btn--primary' : 'btn--ghost'}`}
                            onClick={() => { setImportType('items'); setPreview(null); setFilePath(null); setResult(null); }}
                        >
                            Inventory Items
                        </button>
                    </div>
                </div>

                <div className="card__body">
                    {!preview && (
                        <div className="upload-area" onClick={handleSelectFile}>
                            <Upload size={48} className="text-secondary mb-4" />
                            <h3>Click to Select File</h3>
                            <p>Supports .CSV, .XLSX, .XLS</p>
                            {loading && <Loader2 className="spin mt-4" />}
                        </div>
                    )}

                    {preview && (
                        <div className="import-workspace">
                            <div className="flex-between mb-4 p-4 bg-elevated rounded-lg border border-subtle">
                                <div className="flex items-center gap-3">
                                    <FileSpreadsheet className="text-success" size={24} />
                                    <div>
                                        <div className="font-semibold">{filePath?.split('/').pop()?.split('\\').pop()}</div>
                                        <div className="text-sm text-secondary">{preview.rows.length} rows found</div>
                                    </div>
                                </div>
                                <button className="btn btn--secondary btn--sm" onClick={() => { setPreview(null); setFilePath(null); setResult(null); }}>
                                    Change File
                                </button>
                            </div>

                            {result ? (
                                <div className={`result-box ${result.error_count > 0 ? 'error' : 'success'}`}>
                                    <div className="flex items-center justify-center gap-3 mb-4">
                                        {result.error_count === 0 ? <Check className="text-success" size={32} /> : <AlertCircle className="text-danger" size={32} />}
                                        <h3 className="text-xl font-bold">{result.error_count === 0 ? 'Import Successful' : 'Import Completed with Errors'}</h3>
                                    </div>

                                    <div className="stat-grid max-w-sm mx-auto grid-cols-2">
                                        <div className="stat-card p-4 items-center text-center">
                                            <div className="text-success text-2xl font-extrabold">{result.success_count}</div>
                                            <div className="text-xs text-secondary uppercase tracking-wider">Success</div>
                                        </div>
                                        <div className="stat-card p-4 items-center text-center">
                                            <div className="text-danger text-2xl font-extrabold">{result.error_count}</div>
                                            <div className="text-xs text-secondary uppercase tracking-wider">Failed</div>
                                        </div>
                                    </div>

                                    {result.errors.length > 0 && (
                                        <div className="error-log">
                                            {result.errors.map((e, i) => (
                                                <div key={i} className="text-danger mb-1 flex gap-2">
                                                    <span>•</span>
                                                    <span>{e}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-6">
                                        <button className="btn btn--primary" onClick={() => { setPreview(null); setFilePath(null); setResult(null); }}>Import Another File</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="mapping-section">
                                        <div className="mb-4">
                                            <h3 className="text-lg font-semibold">Map Columns</h3>
                                            <p className="text-secondary text-sm">
                                                Match the columns from your file (left) to the system fields (right).
                                            </p>
                                        </div>

                                        <div className="mapping-grid">
                                            {preview.headers.map(header => (
                                                <div key={header} className="mapping-row">
                                                    <div className="file-header" title={header}>
                                                        {header}
                                                    </div>
                                                    <ArrowRight size={16} className="text-tertiary" />
                                                    <select
                                                        className="input w-full"
                                                        value={mapping[header] || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setMapping(prev => {
                                                                const next = { ...prev };
                                                                if (val) next[header] = val;
                                                                else delete next[header];
                                                                return next;
                                                            });
                                                        }}
                                                    >
                                                        <option value="">-- Ignore --</option>
                                                        {systemFields.map(f => (
                                                            <option key={f.key} value={f.key}>
                                                                {f.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="preview-table-container">
                                        <div className="p-3 px-4 bg-elevated border-b border-subtle font-semibold text-xs uppercase tracking-wider text-tertiary">
                                            Data Preview (First 5 Rows)
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        {preview.headers.map(h => (
                                                            <th key={h} className="whitespace-nowrap">
                                                                {h}
                                                                {mapping[h] && <div className="badge badge--available mt-1">{systemFields.find(f => f.key === mapping[h])?.label || mapping[h]}</div>}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {preview.rows.map((row, i) => (
                                                        <tr key={i}>
                                                            {row.map((cell, j) => (
                                                                <td key={j} className="whitespace-nowrap max-w-xs truncate overflow-hidden">{cell}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="form-actions mt-6 flex justify-end pt-4 border-t border-subtle">
                                        <button
                                            className="btn btn--primary btn--lg"
                                            onClick={handleImport}
                                            disabled={loading || Object.keys(mapping).length === 0}
                                        >
                                            {loading ? <Loader2 className="spin" /> : <Save size={20} />}
                                            {loading ? 'Importing...' : `Import ${importType === 'ledgers' ? 'Ledgers' : 'Items'}`}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
