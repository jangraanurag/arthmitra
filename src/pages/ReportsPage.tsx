import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import type { TrialBalanceReport, ProfitLossReport, BalanceSheetReport, ReportLine, GSTR1Report, GSTR3BReport, GSTRow } from '../store';
import { getTrialBalance, getProfitLoss, getBalanceSheet, getGSTR1, getGSTR3B } from '../ipc';
import { exportTrialBalanceCSV, exportProfitLossCSV, exportBalanceSheetCSV, exportGSTR1CSV, exportGSTR3BCSV, exportGSTR1JSON } from '../utils/csvExport';

// ... (other code)

import {
    FileSpreadsheet, TrendingUp, Scale,
    RefreshCw, Download, CheckCircle2, AlertTriangle, Printer,
    ChevronRight, IndianRupee, PieChart, FileText
} from 'lucide-react';

type ReportTab = 'trial_balance' | 'profit_loss' | 'balance_sheet' | 'gstr1' | 'gstr3b';

const TAB_CONFIG: { id: ReportTab; label: string; icon: typeof FileSpreadsheet; desc: string }[] = [
    { id: 'trial_balance', label: 'Trial Balance', icon: Scale, desc: 'Verify debit/credit equality' },
    { id: 'profit_loss', label: 'Profit & Loss', icon: TrendingUp, desc: 'Income vs Expenses' },
    { id: 'balance_sheet', label: 'Balance Sheet', icon: FileSpreadsheet, desc: 'Assets, Liabilities & Equity' },
    { id: 'gstr1', label: 'GSTR-1', icon: FileText, desc: 'Sales & Output Tax' },
    { id: 'gstr3b', label: 'GSTR-3B', icon: PieChart, desc: 'Summary Return & ITC' },
];

function formatCurrency(val: string): string {
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) return '—';
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

function getMonthStart(): string {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
}

function getLastMonthStart(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().split('T')[0];
}

function getLastMonthEnd(): string {
    const d = new Date();
    d.setDate(0); // 0th day of current month is last day of prev month
    return d.toISOString().split('T')[0];
}

function getFYStart(): string {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
}

function getLastFYStart(): string {
    const now = new Date();
    const curFyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${curFyStartYear - 1}-04-01`;
}

function getLastFYEnd(): string {
    const now = new Date();
    const curFyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${curFyStartYear}-03-31`;
}

// ── Report Line Table ───────────────────────────────────────────────────

function ReportTable({ lines, showDebitCredit = false, onRowClick }: {
    lines: ReportLine[];
    showDebitCredit?: boolean;
    onRowClick?: (line: ReportLine) => void;
}) {
    if (lines.length === 0) {
        return (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No entries found for this period.
            </div>
        );
    }
    return (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: '40%' }}>Account</th>
                    <th style={{ width: '15%' }}>Group</th>
                    {showDebitCredit ? (
                        <>
                            <th className="col-amount" style={{ width: '22%' }}>Debit (₹)</th>
                            <th className="col-amount" style={{ width: '22%' }}>Credit (₹)</th>
                        </>
                    ) : (
                        <th className="col-amount" style={{ width: '45%' }}>Amount (₹)</th>
                    )}
                </tr>
            </thead>
            <tbody>
                {lines.map((line, i) => {
                    const bal = parseFloat(line.balance);
                    return (
                        <motion.tr
                            key={line.account_id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            onClick={() => onRowClick && onRowClick(line)}
                            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                            whileHover={onRowClick ? { backgroundColor: 'var(--bg-subtle)' } : {}}
                        >
                            <td>
                                <span style={{ fontWeight: 500 }}>{line.account_name}</span>
                                <span style={{
                                    marginLeft: 'var(--space-2)',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'capitalize'
                                }}>
                                    {line.account_type}
                                </span>
                            </td>
                            <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                {line.group_code || '—'}
                            </td>
                            {showDebitCredit ? (
                                <>
                                    <td className="col-amount col-debit">{formatCurrency(line.debit)}</td>
                                    <td className="col-amount col-credit">{formatCurrency(line.credit)}</td>
                                </>
                            ) : (
                                <td className={`col-amount ${bal >= 0 ? '' : 'col-debit'}`}
                                    style={{ fontWeight: 600 }}>
                                    {formatCurrency(line.balance)}
                                </td>
                            )}
                        </motion.tr>
                    );
                })}
            </tbody>
        </table>
    );
}

// ── Summary Stat Card ───────────────────────────────────────────────────

function SummaryCard({ label, value, color, subtitle }: {
    label: string;
    value: string;
    color: string;
    subtitle?: string;
}) {
    return (
        <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ borderLeft: `3px solid ${color}` }}
        >
            <div className="stat-card__label">{label}</div>
            <div className="stat-card__value" style={{ color, fontSize: 'var(--text-2xl)' }}>
                {formatCurrency(value)}
            </div>
            {subtitle && (
                <div className="stat-card__change" style={{ color: 'var(--text-tertiary)' }}>
                    {subtitle}
                </div>
            )}
        </motion.div>
    );
}

// ── Balance Status Indicator ────────────────────────────────────────────

function BalanceStatus({ isBalanced }: { isBalanced: boolean }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-full)',
            background: isBalanced
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
            color: isBalanced ? 'var(--color-success-500)' : 'var(--color-danger-500)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
        }}>
            {isBalanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isBalanced ? 'Balanced ✓' : 'Not Balanced ✗'}
        </div>
    );
}

// ── Trial Balance View ──────────────────────────────────────────────────

function TrialBalanceView({ report, onRowClick }: { report: TrialBalanceReport; onRowClick: (line: ReportLine) => void }) {
    return (
        <>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
                <SummaryCard label="Total Debit" value={report.total_debit} color="var(--color-danger-500)" />
                <SummaryCard label="Total Credit" value={report.total_credit} color="var(--color-success-500)" />
                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <BalanceStatus isBalanced={report.is_balanced} />
                </motion.div>
            </div>
            <div className="card">
                <div className="card__header">
                    <div>
                        <div style={{ fontWeight: 600 }}>Trial Balance</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                            As of {report.as_of_date} • {report.lines.length} accounts
                        </div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <ReportTable lines={report.lines} showDebitCredit onRowClick={onRowClick} />
                </div>
            </div>
        </>
    );
}

// ── Profit & Loss View ──────────────────────────────────────────────────

function ProfitLossView({ report, onRowClick }: { report: ProfitLossReport; onRowClick: (line: ReportLine) => void }) {
    return (
        <>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
                <SummaryCard label="Total Income" value={report.total_income} color="var(--color-success-500)" />
                <SummaryCard label="Total Expenses" value={report.total_expense} color="var(--color-danger-500)" />
                <SummaryCard
                    label={report.is_profit ? 'Net Profit' : 'Net Loss'}
                    value={report.net_profit.replace('-', '')}
                    color={report.is_profit ? 'var(--color-success-500)' : 'var(--color-danger-500)'}
                    subtitle={`${report.from_date} to ${report.to_date}`}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                {/* Income */}
                <div className="card">
                    <div className="card__header">
                        <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-success-500)' }}>
                                <IndianRupee size={14} style={{ marginRight: 4 }} />
                                Income
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                {report.income_lines.length} accounts
                            </div>
                        </div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-success-500)' }}>
                            {formatCurrency(report.total_income)}
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <ReportTable lines={report.income_lines} onRowClick={onRowClick} />
                    </div>
                </div>

                {/* Expenses */}
                <div className="card">
                    <div className="card__header">
                        <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-danger-500)' }}>
                                <IndianRupee size={14} style={{ marginRight: 4 }} />
                                Expenses
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                {report.expense_lines.length} accounts
                            </div>
                        </div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-danger-500)' }}>
                            {formatCurrency(report.total_expense)}
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <ReportTable lines={report.expense_lines} onRowClick={onRowClick} />
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Balance Sheet View ──────────────────────────────────────────────────

function BalanceSheetSection({ title, lines, total, color, icon, onRowClick }: {
    title: string;
    lines: ReportLine[];
    total: string;
    color: string;
    icon: React.ReactNode;
    onRowClick: (line: ReportLine) => void;
}) {
    return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {icon}
                    <div>
                        <div style={{ fontWeight: 600, color }}>{title}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                            {lines.length} accounts
                        </div>
                    </div>
                </div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color, fontSize: 'var(--text-lg)' }}>
                    {formatCurrency(total)}
                </div>
            </div>
            {lines.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <ReportTable lines={lines} onRowClick={onRowClick} />
                </div>
            )}
        </div>
    );
}

function BalanceSheetView({ report, onRowClick }: { report: BalanceSheetReport; onRowClick: (line: ReportLine) => void }) {
    return (
        <>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-6)' }}>
                <SummaryCard label="Total Assets" value={report.total_assets} color="var(--color-primary-400)" />
                <SummaryCard label="Total Liabilities" value={report.total_liabilities} color="var(--color-accent-400)" />
                <SummaryCard label="Equity + P&L" value={report.liabilities_plus_equity}
                    color="var(--color-success-500)"
                    subtitle={`Equity: ${formatCurrency(report.total_equity)} + P&L: ${formatCurrency(report.net_pl_surplus)}`}
                />
                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <BalanceStatus isBalanced={report.is_balanced} />
                </motion.div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                {/* Left: Assets */}
                <div>
                    <BalanceSheetSection
                        title="Assets"
                        lines={report.asset_lines}
                        total={report.total_assets}
                        color="var(--color-primary-400)"
                        icon={<ChevronRight size={18} style={{ color: 'var(--color-primary-400)' }} />}
                        onRowClick={onRowClick}
                    />
                </div>

                {/* Right: Liabilities + Equity */}
                <div>
                    <BalanceSheetSection
                        title="Liabilities"
                        lines={report.liability_lines}
                        total={report.total_liabilities}
                        color="var(--color-accent-400)"
                        icon={<ChevronRight size={18} style={{ color: 'var(--color-accent-400)' }} />}
                        onRowClick={onRowClick}
                    />
                    <BalanceSheetSection
                        title="Equity"
                        lines={report.equity_lines}
                        total={report.total_equity}
                        color="var(--color-success-500)"
                        icon={<ChevronRight size={18} style={{ color: 'var(--color-success-500)' }} />}
                        onRowClick={onRowClick}
                    />
                    {parseFloat(report.net_pl_surplus) !== 0 && (
                        <div className="card">
                            <div className="card__header">
                                <div style={{ fontWeight: 600, color: parseFloat(report.net_pl_surplus) >= 0 ? 'var(--color-success-500)' : 'var(--color-danger-500)' }}>
                                    P&L Surplus / (Deficit)
                                </div>
                                <div style={{
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    color: parseFloat(report.net_pl_surplus) >= 0 ? 'var(--color-success-500)' : 'var(--color-danger-500)',
                                    fontSize: 'var(--text-lg)',
                                }}>
                                    {formatCurrency(report.net_pl_surplus)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// ── GST Views ──────────────────────────────────────────────────────────

function GSTTable({ rows }: { rows: GSTRow[] }) {
    if (!rows.length) return <div className="text-secondary p-4 text-center">No data</div>;
    return (
        <table className="data-table">
            <thead>
                <tr>
                    <th style={{ width: '30%' }}>Section</th>
                    <th className="col-amount">Taxable Value</th>
                    <th className="col-amount">IGST</th>
                    <th className="col-amount">CGST</th>
                    <th className="col-amount">SGST</th>
                    <th className="col-amount">Total Tax</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{row.section}</td>
                        <td className="col-amount">{formatCurrency(row.taxable_value)}</td>
                        <td className="col-amount">{formatCurrency(row.igst)}</td>
                        <td className="col-amount">{formatCurrency(row.cgst)}</td>
                        <td className="col-amount">{formatCurrency(row.sgst)}</td>
                        <td className="col-amount" style={{ fontWeight: 600 }}>{formatCurrency(row.total_tax)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}





function GSTR1View({ report }: { report: GSTR1Report }) {
    return (
        <div className="space-y-6">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => exportGSTR1JSON(report)}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                    <Download size={16} />
                    Export JSON (Portal)
                </button>
            </div>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)', marginBottom: 'var(--space-6)' }}>
                <SummaryCard label="Total Tax Liability" value={report.total_liability.total_tax} color="var(--color-primary-500)" subtitle={`Period: ${report.return_period}`} />
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="card__header">
                    <div>
                        <div style={{ fontWeight: 600 }}>B2B Invoices</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Registered Dealers & RCM</div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <h3>4A, 4B, 4C, 6B, 6C - B2B Invoices</h3>
                    <GSTTable rows={report.b2b_invoices || []} />

                    {report.b2b_rcm && report.b2b_rcm.length > 0 && (
                        <>
                            <h3>4B - Supplies Attracting Reverse Charge</h3>
                            <GSTTable rows={report.b2b_rcm} />
                        </>
                    )}

                    <h3>5A, 5B - B2C (Large) Invoices</h3>
                    <GSTTable rows={report.b2c_large || []} />
                </div>
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="card__header">
                    <div>
                        <div style={{ fontWeight: 600 }}>B2C (Small) Details</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Local sales & unregistered dealers</div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <GSTTable rows={report.b2c_small} />
                </div>
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="card__header">
                    <div>
                        <div style={{ fontWeight: 600 }}>HSN Summary</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Section 12</div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    {report.hsn_summary && report.hsn_summary.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>HSN</th>
                                    <th>Description</th>
                                    <th>UQC</th>
                                    <th>Total Qty</th>
                                    <th>Total Value</th>
                                    <th>Taxable Value</th>
                                    <th>IGST</th>
                                    <th>CGST</th>
                                    <th>SGST</th>
                                    <th>Cess</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.hsn_summary.map((row, i) => (
                                    <tr key={i}>
                                        <td>{row.hsn_code}</td>
                                        <td>{row.description}</td>
                                        <td>{row.uqc}</td>
                                        <td>{row.total_quantity}</td>
                                        <td>{row.total_value}</td>
                                        <td>{row.taxable_value}</td>
                                        <td>{row.igst}</td>
                                        <td>{row.cgst}</td>
                                        <td>{row.sgst}</td>
                                        <td>{row.cess}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-secondary p-4 text-center">No HSN data available</div>
                    )}
                </div>
            </div>

            <div className="card">
                <div className="card__header">
                    <div>
                        <div style={{ fontWeight: 600 }}>Documents Issued</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Section 13</div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    {report.documents_issued && report.documents_issued.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nature of Document</th>
                                    <th>From Serial</th>
                                    <th>To Serial</th>
                                    <th>Total Issued</th>
                                    <th>Cancelled</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.documents_issued.map((row, i) => (
                                    <tr key={i}>
                                        <td>{row.doc_type}</td>
                                        <td>{row.from_serial}</td>
                                        <td>{row.to_serial}</td>
                                        <td>{row.total_count}</td>
                                        <td>{row.cancelled_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-secondary p-4 text-center">No document data available</div>
                    )}
                </div>
            </div>
        </div>
    );
}



function GSTR3BView({ report }: { report: GSTR3BReport }) {
    return (
        <div className="space-y-6">
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 'var(--space-6)', gap: 'var(--space-4)' }}>
                <SummaryCard label="Net Tax Payable" value={report.payment_tax.total_tax} color="var(--color-danger-500)" />
                <SummaryCard label="Eligible ITC" value={report.eligible_itc.total_tax} color="var(--color-success-500)" />
            </div>

            <div className="card">
                <div className="card__header">
                    <div style={{ fontWeight: 600 }}>GSTR-3B Summary</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <GSTTable rows={[
                        report.outward_supplies,
                        report.inter_state_supplies,
                        report.eligible_itc,
                        report.payment_tax
                    ]} />
                </div>
            </div>
        </div>
    );
}


// ── Main Reports Page ───────────────────────────────────────────────────

export function ReportsPage() {
    const { activeCompany, addToast, setLedgerFilter, setView } = useAppStore();
    const [activeTab, setActiveTab] = useState<ReportTab>('trial_balance');
    const [exporting, setExporting] = useState(false);

    const [loading, setLoading] = useState(false);
    const [asOfDate, setAsOfDate] = useState(getToday());
    const [fromDate, setFromDate] = useState(getFYStart());
    const [toDate, setToDate] = useState(getToday());

    // Report data
    const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);
    const [profitLoss, setProfitLoss] = useState<ProfitLossReport | null>(null);
    const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);
    const [gstr1, setGSTR1] = useState<GSTR1Report | null>(null);
    const [gstr3b, setGSTR3B] = useState<GSTR3BReport | null>(null);

    const handleDrillDown = useCallback((line: ReportLine) => {
        // Set filters and navigate to ledger
        const filter: any = { accountId: line.account_id };

        if (activeTab === 'profit_loss') {
            filter.dateFrom = fromDate;
            filter.dateTo = toDate;
        } else {
            // Balance Sheet and Trial Balance are 'as of', so essentially 'up to'
            filter.dateTo = asOfDate;
        }

        setLedgerFilter(filter);
        setView('ledger');
    }, [activeTab, fromDate, toDate, asOfDate, setLedgerFilter, setView]);

    const fetchReport = useCallback(async () => {
        if (!activeCompany) return;
        setLoading(true);
        try {
            switch (activeTab) {
                case 'trial_balance': {
                    const tb = await getTrialBalance(activeCompany.uuid, { as_of_date: asOfDate });
                    setTrialBalance(tb);
                    break;
                }
                case 'profit_loss': {
                    const pl = await getProfitLoss(activeCompany.uuid, { from_date: fromDate, to_date: toDate });
                    setProfitLoss(pl);
                    break;
                }
                case 'balance_sheet': {
                    const bs = await getBalanceSheet(activeCompany.uuid, { as_of_date: asOfDate });
                    setBalanceSheet(bs);
                    break;
                }
                case 'gstr1': {
                    const r1 = await getGSTR1(activeCompany.uuid, { from_date: fromDate, to_date: toDate });
                    setGSTR1(r1);
                    break;
                }
                case 'gstr3b': {
                    const r3b = await getGSTR3B(activeCompany.uuid, { from_date: fromDate, to_date: toDate });
                    setGSTR3B(r3b);
                    break;
                }
            }
        } catch (err: any) {
            addToast({ type: 'error', message: `Report failed: ${err}` });
        } finally {
            setLoading(false);
        }
    }, [activeCompany, activeTab, asOfDate, fromDate, toDate, addToast]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    return (
        <div>
            {/* Print Header (Visible only when printing) */}
            <div className="print-header">
                <h2>{activeCompany?.company_name}</h2>
                <h3>
                    {activeTab === 'trial_balance' && 'Trial Balance'}
                    {activeTab === 'profit_loss' && 'Profit & Loss Statement'}
                    {activeTab === 'balance_sheet' && 'Balance Sheet'}
                    {activeTab === 'gstr1' && 'GSTR-1 Report'}
                    {activeTab === 'gstr3b' && 'GSTR-3B Report'}
                </h3>
                <p>
                    Generated on: {new Date().toLocaleDateString('en-IN')}
                </p>
                <div style={{ borderBottom: '1px solid #000', margin: '10px auto', width: '50%' }}></div>
            </div>

            {/* Page Header (Hidden when printing via CSS) */}
            <div className="page-header no-print">
                <div>
                    <h1 className="page-header__title">Reports</h1>
                    <p className="page-header__subtitle">
                        Financial statements • {activeCompany?.company_name}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn--secondary" onClick={fetchReport} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                    <button
                        className="btn btn--secondary"
                        onClick={() => window.print()}
                        title="Print or Save as PDF"
                    >
                        <Printer size={16} /> Print / PDF
                    </button>
                    <button
                        className="btn btn--ghost"
                        title="Export as CSV"
                        disabled={exporting}
                        onClick={async () => {
                            setExporting(true);
                            try {
                                let path: string | null = null;
                                if (activeTab === 'trial_balance' && trialBalance) path = await exportTrialBalanceCSV(trialBalance);
                                else if (activeTab === 'profit_loss' && profitLoss) path = await exportProfitLossCSV(profitLoss);
                                else if (activeTab === 'balance_sheet' && balanceSheet) path = await exportBalanceSheetCSV(balanceSheet);
                                else if (activeTab === 'gstr1' && gstr1) path = await exportGSTR1CSV(gstr1);
                                else if (activeTab === 'gstr3b' && gstr3b) path = await exportGSTR3BCSV(gstr3b);
                                else {
                                    addToast({ type: 'warning', message: `Generate a report first.` });
                                    setExporting(false);
                                    return;
                                }

                                if (path) {
                                    addToast({ type: 'success', message: `Export completed: ${path}` });
                                }
                            } catch (error: any) {
                                console.error("Export failed:", error);
                                addToast({ type: 'error', message: `Export failed: ${error.message || error}` });
                            } finally {
                                setExporting(false);
                            }
                        }}
                    >
                        {exporting ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                        {exporting ? 'Saving...' : 'Export CSV'}
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-6)',
                background: 'var(--bg-surface)',
                padding: 'var(--space-1)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
            }}>
                {TAB_CONFIG.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--space-2)',
                                padding: 'var(--space-3) var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 'var(--text-sm)',
                                transition: 'all 150ms ease',
                                background: isActive
                                    ? 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-600))'
                                    : 'transparent',
                                color: isActive ? 'white' : 'var(--text-secondary)',
                                boxShadow: isActive ? 'var(--shadow-md)' : 'none',
                            }}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Date Controls */}
            <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                    {activeTab === 'profit_loss' || activeTab.startsWith('gstr') ? (
                        <>
                            <div className="input-group" style={{ flex: 'none' }}>
                                <label className="input-group__label">From</label>
                                <input
                                    className="input"
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                />
                            </div>
                            <div className="input-group" style={{ flex: 'none' }}>
                                <label className="input-group__label">To</label>
                                <input
                                    className="input"
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'var(--space-2)' }}>
                                <button className="btn btn--ghost btn--sm" onClick={() => { setFromDate(getMonthStart()); setToDate(getToday()); }}>
                                    This Month
                                </button>
                                <button className="btn btn--ghost btn--sm" onClick={() => { setFromDate(getLastMonthStart()); setToDate(getLastMonthEnd()); }}>
                                    Last Month
                                </button>
                                <button className="btn btn--ghost btn--sm" onClick={() => { setFromDate(getFYStart()); setToDate(getToday()); }}>
                                    This FY
                                </button>
                                <button className="btn btn--ghost btn--sm" onClick={() => { setFromDate(getLastFYStart()); setToDate(getLastFYEnd()); }}>
                                    Last FY
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="input-group" style={{ flex: 'none' }}>
                            <label className="input-group__label">As of Date</label>
                            <input
                                className="input"
                                type="date"
                                value={asOfDate}
                                onChange={(e) => setAsOfDate(e.target.value)}
                            />
                        </div>
                    )}
                    <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                        {loading ? 'Generating report…' : 'Report ready'}
                    </div>
                </div>
            </div>

            {/* Report Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                >
                    {loading ? (
                        <div className="card" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
                            <RefreshCw size={32} className="spin" style={{ color: 'var(--text-tertiary)', margin: '0 auto var(--space-4)' }} />
                            <div style={{ color: 'var(--text-secondary)' }}>Generating report…</div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'trial_balance' && trialBalance && (
                                <TrialBalanceView report={trialBalance} onRowClick={handleDrillDown} />
                            )}
                            {activeTab === 'profit_loss' && profitLoss && (
                                <ProfitLossView report={profitLoss} onRowClick={handleDrillDown} />
                            )}
                            {activeTab === 'balance_sheet' && balanceSheet && (
                                <BalanceSheetView report={balanceSheet} onRowClick={handleDrillDown} />
                            )}
                            {activeTab === 'gstr1' && gstr1 && (
                                <GSTR1View report={gstr1} />
                            )}
                            {activeTab === 'gstr3b' && gstr3b && (
                                <GSTR3BView report={gstr3b} />
                            )}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
