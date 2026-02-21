use serde::{Deserialize, Serialize};

// ── Account Types (Indian COA Standard) ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccountType {
    Asset,
    Liability,
    Equity,
    Income,
    Expense,
}

impl AccountType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "asset" => Some(Self::Asset),
            "liability" => Some(Self::Liability),
            "equity" => Some(Self::Equity),
            "income" => Some(Self::Income),
            "expense" => Some(Self::Expense),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Asset => "asset",
            Self::Liability => "liability",
            Self::Equity => "equity",
            Self::Income => "income",
            Self::Expense => "expense",
        }
    }
}

// ── Voucher Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VoucherType {
    Journal,
    Receipt,
    Payment,
    Contra,
    Sales,
    Purchase,
    DebitNote,
    CreditNote,
}

impl VoucherType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "journal" => Some(Self::Journal),
            "receipt" => Some(Self::Receipt),
            "payment" => Some(Self::Payment),
            "contra" => Some(Self::Contra),
            "sales" => Some(Self::Sales),
            "purchase" => Some(Self::Purchase),
            "debit_note" => Some(Self::DebitNote),
            "credit_note" => Some(Self::CreditNote),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Journal => "journal",
            Self::Receipt => "receipt",
            Self::Payment => "payment",
            Self::Contra => "contra",
            Self::Sales => "sales",
            Self::Purchase => "purchase",
            Self::DebitNote => "debit_note",
            Self::CreditNote => "credit_note",
        }
    }
}

// ── Approval Status ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ApprovalStatus {
    Draft,
    PendingApproval,
    Approved,
    Rejected,
}

impl ApprovalStatus {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "draft" => Some(Self::Draft),
            "pending_approval" => Some(Self::PendingApproval),
            "approved" => Some(Self::Approved),
            "rejected" => Some(Self::Rejected),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Draft => "draft",
            Self::PendingApproval => "pending_approval",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
}

// ── Actor Type (who made the entry) ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ActorType {
    Human,
    AI,
    Agent,
    System,
}

impl ActorType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "human" => Some(Self::Human),
            "ai" => Some(Self::AI),
            "agent" => Some(Self::Agent),
            "system" => Some(Self::System),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Human => "human",
            Self::AI => "ai",
            Self::Agent => "agent",
            Self::System => "system",
        }
    }
}

// ── Entry Source ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EntrySource {
    Manual,
    Invoice,
    BankStatement,
    GST,
    AI,
}

impl EntrySource {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "manual" => Some(Self::Manual),
            "invoice" => Some(Self::Invoice),
            "bank_statement" => Some(Self::BankStatement),
            "gst" => Some(Self::GST),
            "ai" => Some(Self::AI),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::Manual => "manual",
            Self::Invoice => "invoice",
            Self::BankStatement => "bank_statement",
            Self::GST => "gst",
            Self::AI => "ai",
        }
    }
}

// ── Data Structures ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub account_id: String,
    pub name: String,
    pub account_type: String,
    pub parent_account: Option<String>,
    pub group_code: Option<String>,
    pub is_system: bool,
    pub created_at: String,
    pub gstin: Option<String>,
    pub state: Option<String>,
    pub address: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialYear {
    pub fy_id: String,
    pub start_date: String,
    pub end_date: String,
    pub is_active: bool,
    pub is_closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    pub entry_id: String,
    pub date: String,
    pub voucher_number: String,
    pub narration: String,
    pub source: String,
    pub voucher_type: String,
    pub created_by: String,
    pub actor_type: String,
    pub approval_status: String,
    pub checksum: String,
    pub created_at: String,
    pub is_rcm: bool,
    pub ecommerce_operator: Option<String>,
    pub inventory: Option<Vec<InventoryEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerLine {
    pub line_id: String,
    pub entry_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub debit: String,
    pub credit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceSnapshot {
    pub account_id: String,
    pub account_name: Option<String>,
    pub fy_id: String,
    pub balance: String,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: i64,
    pub prev_hash: String,
    pub data_hash: String,
    pub action: String,
    pub actor: String,
    pub actor_type: String,
    pub timestamp: String,
    pub actor_signature: Option<String>,
    pub details: Option<String>,
    pub entity_id: Option<String>,
    pub entity_type: Option<String>,
}

// ── TDS / Tax Deducted at Source ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TdsSection {
    pub section_code: String,
    pub description: String,
    pub threshold_single: f64,
    pub threshold_annual: f64,
    pub rate_individual: f64,
    pub rate_company: f64,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TdsDeduction {
    pub deduction_id: String,
    pub entry_id: Option<String>,
    pub section_code: String,
    pub party_account_id: String,
    pub party_name: String,
    pub payment_amount: f64,
    pub tds_rate: f64,
    pub tds_amount: f64,
    pub pan: Option<String>,
    pub deposit_status: String,
    pub challan_no: Option<String>,
    pub deposit_date: Option<String>,
    pub period_month: i32,
    pub period_year: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTdsDeductionRequest {
    pub entry_id: Option<String>,
    pub section_code: String,
    pub party_account_id: String,
    pub party_name: String,
    pub payment_amount: f64,
    pub tds_rate: f64,
    pub tds_amount: f64,
    pub pan: Option<String>,
    pub period_month: i32,
    pub period_year: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TdsLiabilitySummary {
    pub section_code: String,
    pub description: String,
    pub total_payment: f64,
    pub total_tds: f64,
    pub total_deposited: f64,
    pub total_pending: f64,
    pub deductions_count: i64,
}

// ── Payroll ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Employee {
    pub employee_id: String,
    pub name: String,
    pub designation: String,
    pub department: String,
    pub doj: String,
    pub pan: Option<String>,
    pub pf_number: Option<String>,
    pub esi_number: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    pub bank_ifsc: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEmployeeRequest {
    pub name: String,
    pub designation: String,
    pub department: String,
    pub doj: String,
    pub pan: Option<String>,
    pub pf_number: Option<String>,
    pub esi_number: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    pub bank_ifsc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalaryStructure {
    pub structure_id: String,
    pub employee_id: String,
    pub effective_from: String,
    pub basic: f64,
    pub hra: f64,
    pub conveyance: f64,
    pub special: f64,
    pub traveling_allowance: f64,
    pub food_allowance: f64,
    pub other_earnings: f64,
    pub pf_applicable: bool,
    pub esi_applicable: bool,
    pub pt_applicable: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveSalaryStructureRequest {
    pub employee_id: String,
    pub effective_from: String,
    pub basic: f64,
    pub hra: f64,
    pub conveyance: f64,
    pub special: f64,
    pub traveling_allowance: f64,
    pub food_allowance: f64,
    pub other_earnings: f64,
    pub pf_applicable: bool,
    pub esi_applicable: bool,
    pub pt_applicable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayrollRun {
    pub run_id: String,
    pub period_month: i32,
    pub period_year: i32,
    pub status: String,
    pub processed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayrollEntry {
    pub entry_id: String,
    pub run_id: String,
    pub employee_id: String,
    pub employee_name: String, // joined field
    pub basic: f64,
    pub hra: f64,
    pub conveyance: f64,
    pub special: f64,
    pub traveling_allowance: f64,
    pub food_allowance: f64,
    pub other_earnings: f64,
    pub gross: f64,
    pub pf_employee: f64,
    pub pf_employer: f64,
    pub esi_employee: f64,
    pub esi_employer: f64,
    pub pt: f64,
    pub tds: f64,
    pub other_deductions: f64,
    pub leave_deductions: f64,
    pub late_coming_deductions: f64,
    pub overtime_amount: f64,
    pub advance_payout: f64,
    pub advance_deduction: f64,
    pub total_deductions: f64,
    pub net_pay: f64,
    pub journal_entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePayrollEntryRequest {
    pub traveling_allowance: f64,
    pub food_allowance: f64,
    pub leave_deductions: f64,
    pub late_coming_deductions: f64,
    pub overtime_amount: f64,
    pub advance_payout: f64,
    pub advance_deduction: f64,
    pub other_deductions: f64,
    pub other_earnings: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub path: String,
    pub size: u64,
    pub created_at: String,
}

// ── IPC Request/Response Models ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAccountRequest {
    pub name: String,
    pub account_type: String,
    pub parent_account: Option<String>,
    pub group_code: Option<String>,
    pub gstin: Option<String>,
    pub state: Option<String>,
    pub address: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAccountRequest {
    pub account_id: String,
    pub name: String,
    pub account_type: String,
    pub parent_account: Option<String>,
    pub group_code: Option<String>,
    pub gstin: Option<String>,
    pub state: Option<String>,
    pub address: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerLineInput {
    pub account_id: String,
    pub debit: String,
    pub credit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntryRequest {
    pub date: String,
    pub voucher_number: Option<String>,
    pub narration: String,
    pub voucher_type: String,
    pub source: String,
    pub actor_type: String,
    pub is_rcm: Option<bool>,
    pub ecommerce_operator: Option<String>,
    pub lines: Vec<LedgerLineInput>,
    pub inventory: Option<Vec<InventoryEntryRequest>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryEntryRequest {
    pub item_id: String,
    pub txn_type: String, // "in" or "out"
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_inclusive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryEntry {
    pub entry_id: String,
    pub item_id: String,
    pub item_name: Option<String>,
    pub unit_symbol: Option<String>,
    pub txn_type: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_inclusive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEntryRequest {
    pub entry_id: String,
    pub date: String,
    pub voucher_number: Option<String>,
    pub narration: String,
    pub voucher_type: String,
    pub is_rcm: Option<bool>,
    pub ecommerce_operator: Option<String>,
    pub lines: Vec<LedgerLineInput>,
    pub inventory: Option<Vec<InventoryEntryRequest>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerQuery {
    pub entry_id: Option<String>,
    pub account_id: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub voucher_type: Option<String>,
    pub search_term: Option<String>,
    pub min_amount: Option<String>,
    pub max_amount: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerResponse {
    pub entries: Vec<JournalEntry>,
    pub lines: Vec<LedgerLine>,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyMeta {
    pub uuid: String,
    pub company_name: String,
    pub gstin: Option<String>,
    pub db_version: String,
    pub encryption_flag: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyInfo {
    pub uuid: String,
    pub company_name: String,
    pub gstin: Option<String>,
    pub path: String,
    pub drive_type: String,
    pub last_opened: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCompanyRequest {
    pub company_name: String,
    pub gstin: Option<String>,
    pub path: String,
    pub financial_year_start: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationDetails {
    pub address: String,
    pub city: String,
    pub state: String,
    pub pincode: String,
    pub email: String,
    pub phone: String,
    pub pan: String,
    pub website: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub code: String,
    pub name: String,
    pub is_system: bool,
}

// Combine everything for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyProfile {
    pub info: CompanyInfo,
    pub details: OrganizationDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCompanyRequest {
    pub uuid: String,
    pub company_name: String,
    pub gstin: Option<String>,
    pub details: OrganizationDetails,
}

// ── Report Models ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportQuery {
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub as_of_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportLine {
    pub account_id: String,
    pub account_name: String,
    pub account_type: String,
    pub group_code: Option<String>,
    pub debit: String,
    pub credit: String,
    pub balance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrialBalanceReport {
    pub as_of_date: String,
    pub lines: Vec<ReportLine>,
    pub total_debit: String,
    pub total_credit: String,
    pub is_balanced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitLossReport {
    pub from_date: String,
    pub to_date: String,
    pub income_lines: Vec<ReportLine>,
    pub expense_lines: Vec<ReportLine>,
    pub total_income: String,
    pub total_expense: String,
    pub net_profit: String,
    pub is_profit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceSheetReport {
    pub as_of_date: String,
    pub asset_lines: Vec<ReportLine>,
    pub liability_lines: Vec<ReportLine>,
    pub equity_lines: Vec<ReportLine>,
    pub total_assets: String,
    pub total_liabilities: String,
    pub total_equity: String,
    pub net_pl_surplus: String,
    pub liabilities_plus_equity: String,
    pub is_balanced: bool,
}

// ── Search Models ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub result_type: String,
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
}

// ── GST Report Models ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GSTRow {
    pub section: String,
    pub taxable_value: String,
    pub igst: String,
    pub cgst: String,
    pub sgst: String,
    pub cess: String,
    pub total_tax: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HSNRow {
    pub hsn_code: String,
    pub description: String,
    pub uqc: String,
    pub total_quantity: String,
    pub total_value: String,
    pub taxable_value: String,
    pub igst: String,
    pub cgst: String,
    pub sgst: String,
    pub cess: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentDoc {
    pub doc_type: String, // Invoices for Outward Supply, Credit Note, etc.
    pub from_serial: String,
    pub to_serial: String,
    pub total_count: i64,
    pub cancelled_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GSTR1Report {
    pub return_period: String,
    pub b2b_invoices: Vec<GSTRow>,
    pub b2b_rcm: Vec<GSTRow>,
    pub b2c_large: Vec<GSTRow>,
    pub b2c_small: Vec<GSTRow>,
    pub hsn_summary: Vec<HSNRow>,
    pub documents_issued: Vec<DocumentDoc>,
    pub total_liability: GSTRow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GSTR3BReport {
    pub return_period: String,
    pub outward_supplies: GSTRow,     // 3.1(a)
    pub inter_state_supplies: GSTRow, // 3.2
    pub eligible_itc: GSTRow,         // 4.A
    pub payment_tax: GSTRow,          // Net liability
}

// ── Dashboard Models ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub cash_balance: String,
    pub bank_balance: String,
    pub monthly_income: String,
    pub monthly_expense: String,
    pub pending_approvals: i64,
}

// ── Inventory Models (Phase 7) ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryUnit {
    pub unit_id: String,
    pub name: String,
    pub symbol: String,
    pub decimal_places: i32,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub item_id: String,
    pub name: String,
    pub sku: Option<String>,
    pub hsn_code: Option<String>,
    pub unit_id: String,
    pub unit_symbol: Option<String>,
    pub tax_rate: f64,
    pub description: Option<String>,
    pub opening_qty: f64,
    pub opening_value: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUnitRequest {
    pub name: String,
    pub symbol: String,
    pub decimal_places: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateItemRequest {
    pub name: String,
    pub sku: Option<String>,
    pub hsn_code: Option<String>,
    pub unit_id: String,
    pub tax_rate: f64,
    pub description: Option<String>,
    pub opening_qty: f64,
    pub opening_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateItemRequest {
    pub item_id: String,
    pub name: String,
    pub sku: Option<String>,
    pub hsn_code: Option<String>,
    pub unit_id: String,
    pub tax_rate: f64,
    pub description: Option<String>,
}

// ── Inventory Reporting Models (Phase 9) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockSummaryItem {
    pub item_id: String,
    pub name: String,
    pub sku: Option<String>,
    pub unit_symbol: String,
    pub closing_qty: f64,
    pub closing_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemLedgerEntry {
    pub entry_id: String,
    pub date: String,
    pub voucher_number: Option<String>,
    pub voucher_type: String,
    pub txn_type: String, // "in" or "out"
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub running_qty: f64,
}

// ── Production Models (Phase 11) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BOMHeader {
    pub bom_id: String,
    pub item_id: String,
    pub name: String,
    pub output_quantity: f64,
    pub created_at: String,
    pub finished_good_name: Option<String>, // For UI convenience
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BOMComponent {
    pub component_id: String,
    pub bom_id: String,
    pub item_id: String,
    pub quantity: f64,
    pub item_name: Option<String>,   // For UI convenience
    pub unit_symbol: Option<String>, // For UI convenience
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBOMRequest {
    pub item_id: String,
    pub name: String,
    pub output_quantity: f64,
    pub components: Vec<BOMComponentInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BOMComponentInput {
    pub item_id: String,
    pub quantity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionOrder {
    pub order_id: String,
    pub date: String,
    pub bom_id: String,
    pub quantity: f64,
    pub status: String,
    pub entry_id: Option<String>,
    pub created_at: String,
    pub bom_name: Option<String>,
    pub voucher_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProductionOrderRequest {
    pub date: String,
    pub bom_id: String,
    pub quantity: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcommerceOperator {
    pub operator_id: String,
    pub name: String,
    pub gstin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOperatorRequest {
    pub name: String,
    pub gstin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOperatorRequest {
    pub operator_id: String,
    pub name: String,
    pub gstin: String,
}
