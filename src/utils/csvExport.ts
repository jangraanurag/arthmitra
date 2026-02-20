import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

/**
 * CSV Export utilities for ArthMitra reports and ledger data.
 * Uses Tauri Dialog and FS APIs for "Save As" functionality.
 */

function escapeCSV(value: string | null | undefined): string {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

async function saveCSV(filename: string, csvContent: string): Promise<string | null> {
    try {
        const path = await save({
            defaultPath: filename,
            filters: [{ name: 'CSV', extensions: ['csv'] }]
        });
        if (!path) return null; // User cancelled
        await writeTextFile(path, '\uFEFF' + csvContent); // BOM for Excel compatibility
        return path;
    } catch (e) {
        console.error("Save failed:", e);
        throw e;
    }
}

/** Export Trial Balance to CSV */
export async function exportTrialBalanceCSV(report: {
    as_of_date: string;
    lines: { account_id: string; account_name: string; account_type: string; group_code: string | null; debit: string; credit: string; balance: string }[];
    total_debit: string;
    total_credit: string;
    is_balanced: boolean;
}): Promise<string | null> {
    const headers = ['Account ID', 'Account Name', 'Account Type', 'Group', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'];
    const rows = report.lines.map(l => [
        escapeCSV(l.account_id),
        escapeCSV(l.account_name),
        escapeCSV(l.account_type),
        escapeCSV(l.group_code),
        l.debit,
        l.credit,
        l.balance,
    ].join(','));

    rows.push(''); // blank line
    rows.push(['', '', '', 'TOTAL', report.total_debit, report.total_credit, ''].join(','));
    rows.push(['', '', '', `Balanced: ${report.is_balanced ? 'Yes' : 'No'}`, '', '', ''].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    return await saveCSV(`trial_balance_${report.as_of_date}.csv`, csv);
}

/** Export Profit & Loss to CSV */
export async function exportProfitLossCSV(report: {
    from_date: string;
    to_date: string;
    income_lines: { account_id: string; account_name: string; account_type: string; group_code: string | null; balance: string }[];
    expense_lines: { account_id: string; account_name: string; account_type: string; group_code: string | null; balance: string }[];
    total_income: string;
    total_expense: string;
    net_profit: string;
    is_profit: boolean;
}): Promise<string | null> {
    const headers = ['Section', 'Account ID', 'Account Name', 'Group', 'Amount (₹)'];
    const rows: string[] = [];

    // Income section
    for (const l of report.income_lines) {
        rows.push(['Income', escapeCSV(l.account_id), escapeCSV(l.account_name), escapeCSV(l.group_code), l.balance].join(','));
    }
    rows.push(['TOTAL INCOME', '', '', '', report.total_income].join(','));
    rows.push('');

    // Expense section
    for (const l of report.expense_lines) {
        rows.push(['Expense', escapeCSV(l.account_id), escapeCSV(l.account_name), escapeCSV(l.group_code), l.balance].join(','));
    }
    rows.push(['TOTAL EXPENSES', '', '', '', report.total_expense].join(','));
    rows.push('');

    // Net P&L
    rows.push([report.is_profit ? 'NET PROFIT' : 'NET LOSS', '', '', '', report.net_profit].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    return await saveCSV(`profit_loss_${report.from_date}_to_${report.to_date}.csv`, csv);
}

/** Export Balance Sheet to CSV */
export async function exportBalanceSheetCSV(report: {
    as_of_date: string;
    asset_lines: { account_id: string; account_name: string; group_code: string | null; balance: string }[];
    liability_lines: { account_id: string; account_name: string; group_code: string | null; balance: string }[];
    equity_lines: { account_id: string; account_name: string; group_code: string | null; balance: string }[];
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
    net_pl_surplus: string;
    liabilities_plus_equity: string;
    is_balanced: boolean;
}): Promise<string | null> {
    const headers = ['Section', 'Account ID', 'Account Name', 'Group', 'Amount (₹)'];
    const rows: string[] = [];

    for (const l of report.asset_lines) {
        rows.push(['Assets', escapeCSV(l.account_id), escapeCSV(l.account_name), escapeCSV(l.group_code), l.balance].join(','));
    }
    rows.push(['TOTAL ASSETS', '', '', '', report.total_assets].join(','));
    rows.push('');

    for (const l of report.liability_lines) {
        rows.push(['Liabilities', escapeCSV(l.account_id), escapeCSV(l.account_name), escapeCSV(l.group_code), l.balance].join(','));
    }
    rows.push(['TOTAL LIABILITIES', '', '', '', report.total_liabilities].join(','));
    rows.push('');

    for (const l of report.equity_lines) {
        rows.push(['Equity', escapeCSV(l.account_id), escapeCSV(l.account_name), escapeCSV(l.group_code), l.balance].join(','));
    }
    rows.push(['TOTAL EQUITY', '', '', '', report.total_equity].join(','));
    rows.push('');

    rows.push(['P&L SURPLUS', '', '', '', report.net_pl_surplus].join(','));
    rows.push(['LIABILITIES + EQUITY', '', '', '', report.liabilities_plus_equity].join(','));
    rows.push(['BALANCED', '', '', '', report.is_balanced ? 'Yes' : 'No'].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    return await saveCSV(`balance_sheet_${report.as_of_date}.csv`, csv);
}

/** Export Ledger entries to CSV */
export async function exportLedgerCSV(
    entries: { entry_id: string; date: string; narration: string; voucher_type: string; approval_status: string }[],
    lines: { entry_id: string; account_name: string; debit: string; credit: string }[],
): Promise<string | null> {
    const headers = ['Date', 'Narration', 'Voucher Type', 'Account', 'Debit (₹)', 'Credit (₹)', 'Status'];
    const rows: string[] = [];

    for (const entry of entries) {
        const entryLines = lines.filter(l => l.entry_id === entry.entry_id);
        for (const line of entryLines) {
            rows.push([
                entry.date,
                escapeCSV(entry.narration),
                entry.voucher_type,
                escapeCSV(line.account_name),
                line.debit,
                line.credit,
                entry.approval_status,
            ].join(','));
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    const csv = [headers.join(','), ...rows].join('\n');
    return await saveCSV(`ledger_export_${today}.csv`, csv);
}

/** Export GSTR-1 to CSV */
export async function exportGSTR1CSV(report: {
    return_period: string;
    b2b_invoices: { section: string; taxable_value: string; igst: string; cgst: string; sgst: string; total_tax: string }[];
    b2c_small: { section: string; taxable_value: string; igst: string; cgst: string; sgst: string; total_tax: string }[];
    total_liability: { total_tax: string };
}): Promise<string | null> {
    const headers = ['Section', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax'];
    const rows: string[] = [];

    // B2B Invoices
    if (report.b2b_invoices && report.b2b_invoices.length > 0) {
        rows.push('B2B Invoices,,,,,');
        for (const r of report.b2b_invoices) {
            rows.push([
                escapeCSV(r.section),
                r.taxable_value,
                r.igst,
                r.cgst,
                r.sgst,
                r.total_tax
            ].join(','));
        }
        rows.push(',,,,,'); // Spacer
    }

    // B2C Small
    if (report.b2c_small && report.b2c_small.length > 0) {
        rows.push('B2C Small,,,,,');
        for (const r of report.b2c_small) {
            rows.push([
                escapeCSV(r.section),
                r.taxable_value,
                r.igst,
                r.cgst,
                r.sgst,
                r.total_tax
            ].join(','));
        }
        rows.push(',,,,,'); // Spacer
    }

    // Total row
    rows.push(['TOTAL LIABILITY', '', '', '', '', report.total_liability.total_tax].join(','));
    rows.push(['Period', escapeCSV(report.return_period), '', '', '', ''].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `gstr1_${report.return_period.replace(/\s+/g, '_')}.csv`;
    return await saveCSV(filename, csv);
}

/** Export GSTR-3B to CSV */
export async function exportGSTR3BCSV(report: {
    return_period: string;
    outward_supplies: { section: string; taxable_value: string; igst: string; cgst: string; sgst: string; total_tax: string };
    eligible_itc: { section: string; taxable_value: string; igst: string; cgst: string; sgst: string; total_tax: string };
    payment_tax: { section: string; taxable_value: string; igst: string; cgst: string; sgst: string; total_tax: string };
}): Promise<string | null> {
    const headers = ['Section', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax'];
    const sections = [report.outward_supplies, report.eligible_itc, report.payment_tax].filter(Boolean);

    const rows = sections.map(r => [
        escapeCSV(r.section),
        r.taxable_value,
        r.igst,
        r.cgst,
        r.sgst,
        r.total_tax
    ].join(','));

    rows.push(['Period', escapeCSV(report.return_period), '', '', '', ''].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `gstr3b_${report.return_period.replace(/\s+/g, '_')}.csv`;
    return await saveCSV(filename, csv);
}


async function saveJSON(filename: string, jsonContent: string): Promise<string | null> {
    try {
        const path = await save({
            defaultPath: filename,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (!path) return null; // User cancelled
        await writeTextFile(path, jsonContent);
        return path;
    } catch (e) {
        console.error("Save failed:", e);
        throw e;
    }
}

/** Export GSTR-1 to JSON (Portal Format) */
export async function exportGSTR1JSON(report: any): Promise<string | null> {
    // Map to GST Portal JSON Schema (Approximate)
    const data = {
        gstin: "", // TODO: Fetch from company settings if available
        fp: report.return_period.replace('-', ''), // financial period
        b2b: (report.b2b_invoices || []).map((inv: any) => ({
            ctin: "GSTIN", // extract from section string if possible, or leave placeholder
            inv: [{
                inum: "INV-1", // Placeholder, need actual invoice number from data if available
                idt: "01-01-2025",
                val: parseFloat(inv.total_tax) + parseFloat(inv.taxable_value),
                pos: "00",
                rchrg: "N",
                inv_typ: "R",
                itms: [{
                    num: 1,
                    itm_det: {
                        txval: parseFloat(inv.taxable_value),
                        rt: 18, // meaningful guess or fetch
                        iamt: parseFloat(inv.igst),
                        camt: parseFloat(inv.cgst),
                        samt: parseFloat(inv.sgst),
                        csamt: parseFloat(inv.cess)
                    }
                }]
            }]
        })),
        b2cl: (report.b2c_large || []).map((row: any) => ({
            pos: "00", // Extract state code
            inv: [{
                inum: "INV-001",
                idt: "01-01-2025",
                val: parseFloat(row.total_tax) + parseFloat(row.taxable_value),
                itms: [{
                    num: 1,
                    itm_det: {
                        txval: parseFloat(row.taxable_value),
                        rt: 18,
                        iamt: parseFloat(row.igst),
                        csamt: parseFloat(row.cess)
                    }
                }]
            }]
        })),
        b2cs: (report.b2c_small || []).map((row: any) => ({
            sply_ty: "INTRA",
            txval: parseFloat(row.taxable_value),
            typ: "OE",
            pos: "00",
            rt: 18,
            iamt: parseFloat(row.igst),
            camt: parseFloat(row.cgst),
            samt: parseFloat(row.sgst),
            csamt: parseFloat(row.cess)
        })),
        hsn: {
            data: (report.hsn_summary || []).map((row: any) => ({
                num: 1,
                hsn_sc: row.hsn_code,
                desc: row.description,
                uqc: row.uqc,
                qty: parseFloat(row.total_quantity),
                val: parseFloat(row.total_value),
                txval: parseFloat(row.taxable_value),
                iamt: parseFloat(row.igst),
                camt: parseFloat(row.cgst),
                samt: parseFloat(row.sgst),
                csamt: parseFloat(row.cess)
            }))
        },
        doc_issue: {
            doc_det: (report.documents_issued || []).map((doc: any) => ({
                doc_num: 1,
                docs: [{
                    num: 1,
                    from: doc.from_serial,
                    to: doc.to_serial,
                    totnum: doc.total_count,
                    cancel: doc.cancelled_count,
                    net_issue: doc.total_count - doc.cancelled_count
                }]
            }))
        }
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const filename = `gstr1_export_${new Date().toISOString().split('T')[0]}.json`;
    return await saveJSON(filename, jsonContent);
}
