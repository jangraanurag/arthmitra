
export interface TaxResult {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    totalTax: number;
    totalAmount: number;
}

export interface TaxLine {
    rate: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
}

/**
 * Calculates GST based on inventory lines and state.
 * @param lines Inventory lines with quantity, rate, amount, and item details (tax_rate)
 * @param isInterState True if transaction is between different states (IGST applies)
 */
export function calculateGST(
    lines: { amount: number; taxRate: number }[],
    isInterState: boolean
): { total: TaxResult; breakdown: TaxLine[] } {
    const breakdown: TaxLine[] = [];
    let totalTaxable = 0;
    let totalIGST = 0;
    let totalCGST = 0;
    let totalSGST = 0;

    // Group by tax rate
    const rateGroups = new Map<number, number>(); // Rate -> Taxable Amount

    lines.forEach(line => {
        const rate = line.taxRate || 0;
        const amount = line.amount || 0;
        rateGroups.set(rate, (rateGroups.get(rate) || 0) + amount);
        totalTaxable += amount;
    });

    // Calculate tax for each group
    rateGroups.forEach((taxable, rate) => {
        let igst = 0, cgst = 0, sgst = 0;

        if (isInterState) {
            igst = taxable * (rate / 100);
        } else {
            cgst = taxable * ((rate / 2) / 100);
            sgst = taxable * ((rate / 2) / 100);
        }

        breakdown.push({
            rate,
            taxable,
            igst,
            cgst,
            sgst
        });

        totalIGST += igst;
        totalCGST += cgst;
        totalSGST += sgst;
    });

    return {
        total: {
            taxableValue: totalTaxable,
            igst: totalIGST,
            cgst: totalCGST,
            sgst: totalSGST,
            totalTax: totalIGST + totalCGST + totalSGST,
            totalAmount: totalTaxable + totalIGST + totalCGST + totalSGST
        },
        breakdown
    };
}
