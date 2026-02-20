
export function numberToWords(amount: number): string {
    const num = Math.round(amount * 100) / 100; // Round to 2 decimals
    const [whole, fraction] = num.toString().split('.').map(Number);

    let words = convertWholeNumber(whole);

    if (fraction > 0) {
        words += ` and ${convertWholeNumber(fraction)} Paise`;
    }

    return `Rupees ${words} Only`;
}

function convertWholeNumber(n: number): string {
    if (n === 0) return '';

    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (n < 20) return units[n];

    if (n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
    }

    if (n < 1000) {
        return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertWholeNumber(n % 100) : '');
    }

    if (n < 100000) {
        return convertWholeNumber(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convertWholeNumber(n % 1000) : '');
    }

    if (n < 10000000) {
        return convertWholeNumber(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convertWholeNumber(n % 100000) : '');
    }

    return convertWholeNumber(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convertWholeNumber(n % 10000000) : '');
}
