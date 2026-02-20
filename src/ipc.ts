import { invoke } from '@tauri-apps/api/core';
import type { CompanyInfo, JournalEntry, LedgerResponse, BalanceSnapshot, TrialBalanceReport, ProfitLossReport, BalanceSheetReport, SearchResponse, GSTR1Report, GSTR3BReport, InventoryEntry, StockSummaryItem, ItemLedgerEntry, EcommerceOperator } from './store';

export interface OrganizationDetails {
    address: string;
    city: string;
    state: string;
    pincode: string;
    email: string;
    phone: string;
    pan: string;
    website: string;
}

export interface CompanyProfile {
    info: CompanyInfo;
    details: OrganizationDetails;
}

export interface UpdateCompanyRequest {
    uuid: string;
    company_name: string;
    gstin: string | null;
    details: OrganizationDetails;
}

export interface State {
    code: string;
    name: string;
    is_system: boolean;
}

/** ── Company Commands ─────────────────────────────────────────────── */

export async function discoverCompanies(): Promise<CompanyInfo[]> {
    return invoke<CompanyInfo[]>('discover_companies');
}

export async function mountCompany(uuid: string): Promise<CompanyInfo> {
    return invoke<CompanyInfo>('mount_company', { uuid });
}

export async function unmountCompany(uuid: string): Promise<void> {
    return invoke<void>('unmount_company', { uuid });
}

export async function createCompany(req: {
    company_name: string;
    path: string;
    gstin: string | null;
    financial_year_start: string;
}): Promise<CompanyInfo> {
    return invoke<CompanyInfo>('create_company', { req });
}

export async function validateCompany(uuid: string): Promise<[boolean, string[]]> {
    return invoke<[boolean, string[]]>('validate_company', { uuid });
}

export async function getCompanyProfile(uuid: string): Promise<CompanyProfile> {
    return invoke<CompanyProfile>('get_company_profile', { uuid });
}

export async function updateCompany(payload: UpdateCompanyRequest): Promise<CompanyProfile> {
    return invoke<CompanyProfile>('update_company', { payload });
}

export async function getStates(uuid: string): Promise<State[]> {
    return invoke<State[]>('get_states', { uuid });
}

export async function createState(uuid: string, code: string, name: string): Promise<State> {
    return invoke<State>('create_state', { uuid, code, name });
}

/** ── Financial Years & Backup ─────────────────────────────────────── */

export interface FinancialYear {
    fy_id: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    is_closed: boolean;
}

export interface BackupInfo {
    filename: string;
    path: string;
    size: number;
    created_at: string;
}

export async function getFinancialYears(uuid: string): Promise<FinancialYear[]> {
    return invoke<FinancialYear[]>('get_financial_years', { uuid });
}

export async function createFinancialYear(uuid: string, startDate: string): Promise<FinancialYear> {
    return invoke<FinancialYear>('create_financial_year', { uuid, startDate: startDate });
}

export async function createBackup(uuid: string): Promise<string> {
    return invoke<string>('create_backup', { uuid });
}

export async function getBackups(uuid: string): Promise<BackupInfo[]> {
    return invoke<BackupInfo[]>('get_backups', { uuid });
}

export async function restoreBackup(uuid: string, backupPath: string): Promise<void> {
    return invoke<void>('restore_backup', { uuid, backupPath });
}



/** ── Ledger Commands ──────────────────────────────────────────────── */

export async function createEntry(uuid: string, req: {
    date: string;
    voucher_number?: string;
    narration: string;
    voucher_type: string;
    source: string;
    actor_type: string;
    lines: { account_id: string; debit: string; credit: string }[];
    inventory?: InventoryEntry[];
    is_rcm?: boolean;
    ecommerce_operator?: string;
}): Promise<JournalEntry> {
    return invoke<JournalEntry>('create_entry', { uuid, req });
}

export async function updateEntry(uuid: string, req: {
    entry_id: string;
    date: string;
    voucher_number?: string;
    narration: string;
    voucher_type: string;
    lines: { account_id: string; debit: string; credit: string }[];
    inventory?: InventoryEntry[];
    is_rcm?: boolean;
    ecommerce_operator?: string;
}): Promise<JournalEntry> {
    return invoke<JournalEntry>('update_entry', { uuid, req });
}

export async function getEntry(uuid: string, entryId: string): Promise<JournalEntry> {
    return invoke<JournalEntry>('get_entry', { uuid, entryId });
}

export async function getLedger(uuid: string, query: {
    entry_id?: string | null;
    account_id?: string | null;
    from_date?: string | null;
    to_date?: string | null;
    voucher_type?: string | null;
    search_term?: string | null;
    min_amount?: string | null;
    max_amount?: string | null;
    limit?: number | null;
    offset?: number | null;
}): Promise<LedgerResponse> {
    return invoke<LedgerResponse>('get_ledger', { uuid, query });
}

export async function getBalance(uuid: string, accountId: string): Promise<BalanceSnapshot> {
    return invoke<BalanceSnapshot>('get_balance', { uuid, accountId });
}

export async function getAccounts(uuid: string, accountType?: string | null): Promise<Account[]> {
    return invoke<Account[]>('get_accounts', { uuid, accountType });
}

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

export async function createAccount(uuid: string, req: {
    name: string;
    account_type: string;
    parent_account: string | null;
    group_code: string | null;
    gstin?: string | null;
    state?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
}): Promise<Account> {
    return invoke<Account>('create_account', { uuid, req });
}

export async function updateAccount(uuid: string, req: {
    account_id: string;
    name: string;
    account_type: string;
    parent_account: string | null;
    group_code: string | null;
    gstin?: string | null;
    state?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
}): Promise<Account> {
    return invoke<Account>('update_account', { uuid, req });
}

export async function deleteAccount(uuid: string, accountId: string): Promise<void> {
    return invoke<void>('delete_account', { uuid, accountId });
}

export async function approveEntry(uuid: string, entryId: string): Promise<JournalEntry> {
    return invoke<JournalEntry>('approve_entry', { uuid, entryId });
}

export async function deleteEntry(uuid: string, entryId: string): Promise<void> {
    return invoke<void>('delete_entry', { uuid, entryId });
}

export async function getNextVoucherNumber(uuid: string, voucherType: string): Promise<string> {
    return invoke<string>('get_next_voucher_number', { uuid, voucherType });
}

/** ── Report Commands ──────────────────────────────────────────────── */

export async function getTrialBalance(uuid: string, query: {
    as_of_date?: string | null;
    from_date?: string | null;
    to_date?: string | null;
}): Promise<TrialBalanceReport> {
    return invoke<TrialBalanceReport>('get_trial_balance', { uuid, query });
}

export async function getProfitLoss(uuid: string, query: {
    from_date?: string | null;
    to_date?: string | null;
    as_of_date?: string | null;
}): Promise<ProfitLossReport> {
    return invoke<ProfitLossReport>('get_profit_loss', { uuid, query });
}

export async function getBalanceSheet(uuid: string, query: {
    as_of_date?: string | null;
    from_date?: string | null;
    to_date?: string | null;
}): Promise<BalanceSheetReport> {
    return invoke<BalanceSheetReport>('get_balance_sheet', { uuid, query });
}

/** ── Search Commands ──────────────────────────────────────────────── */

export async function globalSearch(uuid: string, query: string, limit?: number): Promise<SearchResponse> {
    return invoke<SearchResponse>('global_search', { uuid, query, limit: limit ?? null });
}

export async function getGSTR1(uuid: string, query: { from_date: string; to_date: string }): Promise<GSTR1Report> {
    return await invoke('get_gstr1', { uuid, query });
}

export async function getGSTR3B(uuid: string, query: { from_date: string; to_date: string }): Promise<GSTR3BReport> {
    return await invoke('get_gstr3b', { uuid, query });
}




/** ── Dashboard Commands ───────────────────────────────────────────── */

export interface DashboardStats {
    cash_balance: string;
    bank_balance: string;
    monthly_income: string;
    monthly_expense: string;
    pending_approvals: number;
}

export async function getDashboardStats(uuid: string): Promise<DashboardStats> {
    return invoke<DashboardStats>('get_dashboard_stats', { uuid });
}

/** ── Inventory Commands (Phase 7) ────────────────────────────────── */

export interface InventoryUnit {
    unit_id: string;
    name: string;
    symbol: string;
    decimal_places: number;
    is_system: boolean;
}

export interface InventoryItem {
    item_id: string;
    name: string;
    sku: string | null;
    hsn_code: string | null;
    unit_id: string;
    unit_symbol?: string;
    tax_rate: number;
    description: string | null;
    opening_qty: number;
    opening_value: number;
    created_at: string;
    tax_inclusive?: boolean;
}

export async function getUnits(uuid: string): Promise<InventoryUnit[]> {
    return invoke<InventoryUnit[]>('get_units', { uuid });
}

export async function createUnit(uuid: string, req: {
    name: string;
    symbol: string;
    decimal_places: number;
}): Promise<InventoryUnit> {
    return invoke<InventoryUnit>('create_unit', { uuid, req });
}

export async function deleteUnit(uuid: string, unitId: string): Promise<void> {
    return invoke<void>('delete_unit', { uuid, unitId: unitId });
}

export async function getItems(uuid: string): Promise<InventoryItem[]> {
    return invoke<InventoryItem[]>('get_items', { uuid });
}

export async function createItem(uuid: string, req: {
    name: string;
    sku: string | null;
    hsn_code: string | null;
    unit_id: string;
    tax_rate: number;
    description: string | null;
    opening_qty: number;
    opening_value: number;
}): Promise<InventoryItem> {
    return invoke<InventoryItem>('create_item', { uuid, req });
}

export async function updateItem(uuid: string, req: {
    item_id: string;
    name: string;
    sku: string | null;
    hsn_code: string | null;
    unit_id: string;
    tax_rate: number;
    description: string | null;
}): Promise<InventoryItem> {
    return invoke<InventoryItem>('update_item', { uuid, req });
}

export async function deleteItem(uuid: string, itemId: string): Promise<void> {
    return invoke<void>('delete_item', { uuid, itemId: itemId });
}

export async function getStockSummary(uuid: string): Promise<StockSummaryItem[]> {
    return invoke<StockSummaryItem[]>('get_stock_summary', { uuid });
}

// Removed duplicate getItemLedger
export async function getItemLedger(uuid: string, itemId: string): Promise<ItemLedgerEntry[]> {
    return invoke<ItemLedgerEntry[]>('get_item_ledger', { uuid, itemId });
}

/** ── Production Commands (Phase 11) ──────────────────────────────── */

export interface BOMHeader {
    bom_id: string;
    item_id: string;
    name: string;
    output_quantity: number;
    created_at: string;
    finished_good_name?: string;
}

export interface BOMComponent {
    component_id: string;
    bom_id: string;
    item_id: string;
    quantity: number;
    item_name?: string;
    unit_symbol?: string;
}

export interface ProductionOrder {
    order_id: string;
    date: string;
    bom_id: string;
    quantity: number;
    status: string;
    entry_id: string | null;
    created_at: string;
    bom_name?: string;
    voucher_number?: string;
}

export async function createBOM(uuid: string, req: {
    item_id: string;
    name: string;
    output_quantity: number;
    components: { item_id: string; quantity: number }[];
}): Promise<BOMHeader> {
    return invoke<BOMHeader>('create_bom', { uuid, request: req });
}

export async function getBOMs(uuid: string): Promise<BOMHeader[]> {
    return invoke<BOMHeader[]>('get_boms', { uuid });
}

export async function getBOMDetails(uuid: string, bomId: string): Promise<[BOMHeader, BOMComponent[]]> {
    return invoke<[BOMHeader, BOMComponent[]]>('get_bom_details', { uuid, bomId: bomId });
}

export async function deleteBOM(uuid: string, bomId: string): Promise<void> {
    return invoke<void>('delete_bom', { uuid, bomId: bomId });
}

export async function createProductionOrder(uuid: string, req: {
    date: string;
    bom_id: string;
    quantity: number;
}): Promise<string> {
    return invoke<string>('create_production_order', { uuid, request: req });
}

export async function getProductionOrders(uuid: string): Promise<ProductionOrder[]> {
    return invoke<ProductionOrder[]>('get_production_orders', { uuid });
}

// ── Auth (Phase 13) ─────────────────────────────────────────────────────

import type { UserSession, UserInfo } from './store';

export async function login(username: string, password: string): Promise<UserSession> {
    return invoke<UserSession>('login', { username, password });
}

export async function logout(): Promise<void> {
    return invoke<void>('logout');
}

export async function getCurrentUser(): Promise<UserSession | null> {
    return invoke<UserSession | null>('get_current_user');
}

export async function getUsers(): Promise<UserInfo[]> {
    return invoke<UserInfo[]>('get_users');
}

export async function createUser(
    username: string,
    password: string,
    displayName: string,
    role: string,
): Promise<UserInfo> {
    return invoke<UserInfo>('create_user', { username, password, displayName, role });
}

export async function updateUser(
    userId: string,
    displayName?: string,
    role?: string,
    isActive?: boolean,
): Promise<UserInfo> {
    return invoke<UserInfo>('update_user', { userId, displayName, role, isActive });
}

export async function changePassword(
    userId: string,
    newPassword: string,
    oldPassword?: string,
): Promise<void> {
    return invoke<void>('change_password', { userId, oldPassword, newPassword });
}

export async function deleteUser(userId: string): Promise<void> {
    return invoke<void>('delete_user', { userId });
}

// ── Settings (Phase 14) ──────────────────────────────────────────────────

export async function getCompanySettings(uuid: string): Promise<Record<string, string>> {
    return invoke<Record<string, string>>('get_company_settings', { uuid });
}

export async function updateCompanySettings(uuid: string, settings: Record<string, string>): Promise<void> {
    await invoke('update_company_settings', { uuid, settings });
}
// E-commerce Operators
export async function createEcommerceOperator(uuid: string, req: { name: string; gstin: string }): Promise<EcommerceOperator> {
    return invoke<EcommerceOperator>('create_ecommerce_operator', { uuid, req });
}

export async function getEcommerceOperators(uuid: string): Promise<EcommerceOperator[]> {
    return invoke<EcommerceOperator[]>('get_ecommerce_operators', { uuid });
}

export async function deleteEcommerceOperator(uuid: String, operator_id: string): Promise<void> {
    return invoke<void>('delete_ecommerce_operator', { uuid, operator_id });
}

export async function updateEcommerceOperator(uuid: string, req: { operator_id: string; name: string; gstin: string }): Promise<EcommerceOperator> {
    return invoke<EcommerceOperator>('update_ecommerce_operator', { uuid, req });
}
export async function uploadImage(uuid: string, key: string, base64Data: string): Promise<void> {
    await invoke('upload_image', { uuid, key, base64Data });
}
import type { ImportResult, ImportPreview } from './store';

export async function readImportFile(filePath: string): Promise<ImportPreview> {
    return invoke<ImportPreview>('read_import_file', { filePath });
}

export async function importLedgers(uuid: string, filePath: string, mapping: Record<string, string>): Promise<ImportResult> {
    return invoke<ImportResult>('import_ledgers', { uuid, filePath, mapping });
}

export async function importItems(uuid: string, filePath: string, mapping: Record<string, string>): Promise<ImportResult> {
    return invoke<ImportResult>('import_items', { uuid, filePath, mapping });
}
