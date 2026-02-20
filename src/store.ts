import { create } from 'zustand';

/** Represents a company in the registry */
export interface CompanyInfo {
    uuid: string;
    company_name: string;
    gstin: string | null;
    path: string;
    drive_type: string;
    last_opened: string | null;
    status: string;
}

export interface InventoryEntry {
    entry_id?: string;
    item_id: string;
    item_name?: string;
    unit_symbol?: string;
    txn_type: string;
    quantity: number;
    rate: number;
    amount: number;
    tax_inclusive?: boolean;
}

/** Represents a journal entry */
export interface JournalEntry {
    entry_id: string;
    date: string;
    narration: string;
    source: string;
    voucher_type: string;
    voucher_number: string;
    created_by: string;
    actor_type: string;
    approval_status: string;
    checksum: string;
    created_at: string;
    inventory?: InventoryEntry[];
    is_rcm?: boolean;
    ecommerce_operator?: string;
}

/** Represents a ledger line */
export interface LedgerLine {
    line_id: string;
    entry_id: string;
    account_id: string;
    account_name: string;
    debit: string;
    credit: string;
}

/** Represents an account */
export interface Account {
    account_id: string;
    name: string;
    account_type: string;
    parent_account: string | null;
    group_code: string | null;
    is_system: boolean;
    created_at: string;
    gstin?: string | null;
    state?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
}

export interface EcommerceOperator {
    operator_id: string;
    name: string;
    gstin: string;
}

/** Represents a balance snapshot */
export interface BalanceSnapshot {
    account_id: string;
    account_name: string | null;
    fy_id: string;
    balance: string;
    last_updated: string;
}

/** Ledger query response */
export interface LedgerResponse {
    entries: JournalEntry[];
    lines: LedgerLine[];
    total_count: number;
}

/** A single line in a financial report */
export interface ReportLine {
    account_id: string;
    account_name: string;
    account_type: string;
    group_code: string | null;
    debit: string;
    credit: string;
    balance: string;
}

/** Trial Balance report */
export interface TrialBalanceReport {
    as_of_date: string;
    lines: ReportLine[];
    total_debit: string;
    total_credit: string;
    is_balanced: boolean;
}

/** Profit & Loss statement */
export interface ProfitLossReport {
    from_date: string;
    to_date: string;
    income_lines: ReportLine[];
    expense_lines: ReportLine[];
    total_income: string;
    total_expense: string;
    net_profit: string;
    is_profit: boolean;
}

/** Balance Sheet report */
export interface BalanceSheetReport {
    as_of_date: string;
    asset_lines: ReportLine[];
    liability_lines: ReportLine[];
    equity_lines: ReportLine[];
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
    net_pl_surplus: string;
    liabilities_plus_equity: string;
    is_balanced: boolean;
}

/** A single search result (account or entry) */
export interface SearchResult {
    result_type: string;
    id: string;
    title: string;
    subtitle: string;
    meta: string | null;
}

/** Global search response */
export interface SearchResponse {
    results: SearchResult[];
    total: number;
}

// ── GST Reports ─────────────────────────────────────────────────────────────

export interface GSTRow {
    section: string;
    taxable_value: string;
    igst: string;
    cgst: string;
    sgst: string;
    cess: string;
    total_tax: string;
}

export interface HSNRow {
    hsn_code: string;
    description: string;
    uqc: string;
    total_quantity: string;
    total_value: string;
    taxable_value: string;
    igst: string;
    cgst: string;
    sgst: string;
    cess: string;
}

export interface DocumentDoc {
    doc_type: string;
    from_serial: string;
    to_serial: string;
    total_count: number;
    cancelled_count: number;
}

export interface GSTR1Report {
    return_period: string;
    b2b_invoices: GSTRow[];
    b2b_rcm: GSTRow[];
    b2c_large: GSTRow[];
    b2c_small: GSTRow[];
    hsn_summary: HSNRow[];
    documents_issued: DocumentDoc[];
    total_liability: GSTRow;
}

export interface GSTR3BReport {
    return_period: string;
    outward_supplies: GSTRow;
    inter_state_supplies: GSTRow;
    eligible_itc: GSTRow;
    payment_tax: GSTRow;
}

// ── Auth (Phase 13) ─────────────────────────────────────────────────────

export interface UserSession {
    user_id: string;
    username: string;
    display_name: string;
    role: 'admin' | 'operator';
    must_change_password: boolean;
}

export interface UserInfo {
    user_id: string;
    username: string;
    display_name: string;
    role: string;
    is_active: boolean;
    must_change_password: boolean;
    created_at: string;
    last_login: string | null;
}

/** Application view state */
export type AppView = 'launcher' | 'dashboard' | 'ledger' | 'voucher' | 'accounts' | 'inventory' | 'approvals' | 'reports' | 'search' | 'settings' | 'stock_summary' | 'item_ledger' | 'bom' | 'production' | 'users' | 'import' | 'audit_logs' | 'tds' | 'payroll';

export interface ImportResult {
    success_count: number;
    error_count: number;
    errors: string[];
}

export interface ImportPreview {
    headers: string[];
    rows: string[][];
}

/** Main application store */
interface AppState {
    // ── Navigation ──
    currentView: AppView;
    setView: (view: AppView) => void;

    // ── Company State ──
    companies: CompanyInfo[];
    activeCompany: CompanyInfo | null;
    editingEntryId: string | null;
    selectedItemId: string | null; // For Item Ledger
    setCompanies: (companies: CompanyInfo[]) => void;
    setActiveCompany: (company: CompanyInfo | null) => void;
    setEditingEntryId: (id: string | null) => void;
    setSelectedItemId: (id: string | null) => void;
    updateActiveCompany: (updates: Partial<CompanyInfo>) => void;

    // ── Sidebar ──
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;

    // ── Notifications ──
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;

    // ── Ledger Filter ──
    ledgerFilter: {
        accountId?: string | null;
        dateFrom?: string | null;
        dateTo?: string | null;
    };
    setLedgerFilter: (filter: { accountId?: string | null; dateFrom?: string | null; dateTo?: string | null }) => void;

    // ── Loading States ──
    isLoading: boolean;
    setLoading: (loading: boolean) => void;

    // ── Auth (Phase 13) ──
    currentUser: UserSession | null;
    setCurrentUser: (user: UserSession | null) => void;
}

export interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

export const useAppStore = create<AppState>((set) => ({
    // Navigation
    currentView: 'launcher',
    setView: (view) => set({ currentView: view }),

    // Company
    companies: [],
    activeCompany: null,
    editingEntryId: null,
    selectedItemId: null,
    setCompanies: (companies) => set({ companies }),
    setActiveCompany: (company) => set({
        activeCompany: company,
        currentView: company ? 'dashboard' : 'launcher',
    }),
    setEditingEntryId: (id) => set({ editingEntryId: id }),
    setSelectedItemId: (id) => set({ selectedItemId: id }),
    updateActiveCompany: (updates) => set((state) => ({
        activeCompany: state.activeCompany ? { ...state.activeCompany, ...updates } : null
    })),

    // Sidebar
    sidebarCollapsed: false,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

    // Toasts
    toasts: [],
    addToast: (toast) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
        setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 5000);
    },
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    // Ledger Filter
    ledgerFilter: {},
    setLedgerFilter: (filter) => set({ ledgerFilter: filter }),

    // Loading
    isLoading: false,
    setLoading: (loading) => set({ isLoading: loading }),

    // Auth
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),
}));

// ── Inventory Reporting (Phase 9) ───────────────────────────────────

export interface StockSummaryItem {
    item_id: string;
    name: string;
    sku: string | null;
    unit_symbol: string;
    closing_qty: number;
    closing_value: number;
}

export interface ItemLedgerEntry {
    entry_id: string;
    date: string;
    voucher_number: string | null;
    voucher_type: string;
    txn_type: string; // "in" or "out"
    quantity: number;
    rate: number;
    amount: number;
    running_qty: number;
}



export interface CompanySettings {
    company_name: string;
    gstin: string;
    email: string;
    phone: string;
    address: string;
    terms_and_conditions: string;
    bank_details: string;
    upi_id: string;
    logo_base64: string | null;
    signature_base64: string | null;
    primary_color: string;
    secondary_color: string;
}
