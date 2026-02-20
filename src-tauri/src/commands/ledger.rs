use crate::core::engine;
use crate::core::models::*;
use crate::core::reports;
use crate::loader::mount;

use crate::commands::auth::AuthState;

/// Create a journal entry with ledger lines (double-entry enforced)
#[tauri::command]
pub async fn create_entry(
    uuid: String,
    req: CreateEntryRequest,
    state: tauri::State<'_, AuthState>,
) -> Result<JournalEntry, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Get user role
    let role = {
        let s = state.session.lock().unwrap();
        s.as_ref().map(|u| u.role.clone())
    };
    
    engine::create_entry(&conn, &req, role.as_deref()).map_err(|e| e.to_string())
}

/// Update a journal entry
#[tauri::command]
pub async fn update_entry(uuid: String, req: UpdateEntryRequest) -> Result<JournalEntry, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::update_entry(&conn, &req).map_err(|e| e.to_string())
}

/// Get paginated ledger entries with optional filters
#[tauri::command]
pub async fn get_ledger(uuid: String, query: LedgerQuery) -> Result<LedgerResponse, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_ledger(&conn, &query).map_err(|e| e.to_string())
}

/// Get a single entry by ID
#[tauri::command]
pub async fn get_entry(uuid: String, entry_id: String) -> Result<JournalEntry, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_entry(&conn, &entry_id).map_err(|e| e.to_string())
}

/// Get balance for a specific account
#[tauri::command]
pub async fn get_balance(uuid: String, account_id: String) -> Result<BalanceSnapshot, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_balance(&conn, &account_id).map_err(|e| e.to_string())
}

/// Get all accounts (chart of accounts), optionally filtered by type
#[tauri::command]
pub async fn get_accounts(
    uuid: String,
    account_type: Option<String>,
) -> Result<Vec<Account>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_accounts(&conn, account_type.as_deref()).map_err(|e| e.to_string())
}

/// Create a new account in the chart of accounts
#[tauri::command]
pub async fn create_account(uuid: String, req: CreateAccountRequest) -> Result<Account, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::create_account(&conn, &req).map_err(|e| e.to_string())
}

/// Update an existing account
#[tauri::command]
pub async fn update_account(uuid: String, req: UpdateAccountRequest) -> Result<Account, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::update_account(&conn, &req).map_err(|e| e.to_string())
}

/// Delete an account
#[tauri::command]
pub async fn delete_account(uuid: String, account_id: String) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::delete_account(&conn, &account_id).map_err(|e| e.to_string())
}

/// Approve a pending journal entry (CA/human action)
#[tauri::command]
pub async fn approve_entry(uuid: String, entry_id: String) -> Result<JournalEntry, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::approve_entry(&conn, &entry_id).map_err(|e| e.to_string())
}

/// Void a journal entry
#[tauri::command]
pub async fn delete_entry(uuid: String, entry_id: String) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::delete_entry(&conn, &entry_id).map_err(|e| e.to_string())
}

/// Get next voucher number (peek)
#[tauri::command]
pub async fn get_next_voucher_number(uuid: String, voucher_type: String) -> Result<String, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::peek_next_voucher_number(&conn, &voucher_type).map_err(|e| e.to_string())
}

/// Generate Trial Balance report
#[tauri::command]
pub async fn get_trial_balance(
    uuid: String,
    query: ReportQuery,
) -> Result<TrialBalanceReport, String> {
    let conn = mount::get_company_conn(&uuid)?;
    reports::generate_trial_balance(&conn, &query).map_err(|e| e.to_string())
}

/// Generate Profit & Loss statement
#[tauri::command]
pub async fn get_profit_loss(uuid: String, query: ReportQuery) -> Result<ProfitLossReport, String> {
    let conn = mount::get_company_conn(&uuid)?;
    reports::generate_profit_loss(&conn, &query).map_err(|e| e.to_string())
}

/// Generate Balance Sheet
#[tauri::command]
pub async fn get_balance_sheet(
    uuid: String,
    query: ReportQuery,
) -> Result<BalanceSheetReport, String> {
    let conn = mount::get_company_conn(&uuid)?;
    reports::generate_balance_sheet(&conn, &query).map_err(|e| e.to_string())
}

/// Global search across accounts and journal entries
#[tauri::command]
pub async fn global_search(
    uuid: String,
    query: String,
    limit: Option<usize>,
) -> Result<SearchResponse, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let max = limit.unwrap_or(20);
    let pattern = format!("%{}%", query);
    let mut results = Vec::new();

    // Search accounts
    {
        let mut stmt = conn.prepare(
            "SELECT account_id, name, account_type, group_code FROM accounts WHERE name LIKE ?1 ORDER BY name LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![&pattern, max as i64], |row| {
                let acc_type: String = row.get(2)?;
                let group: Option<String> = row.get(3)?;
                Ok(SearchResult {
                    result_type: "account".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: format!(
                        "{} account",
                        acc_type
                            .chars()
                            .next()
                            .unwrap_or('?')
                            .to_uppercase()
                            .to_string()
                            + &acc_type[1..]
                    ),
                    meta: group,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // Search journal entries by narration
    {
        let mut stmt = conn.prepare(
            "SELECT entry_id, narration, date, voucher_type FROM journal_entries WHERE narration LIKE ?1 ORDER BY date DESC LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![&pattern, max as i64], |row| {
                let date: String = row.get(2)?;
                let vtype: String = row.get(3)?;
                Ok(SearchResult {
                    result_type: "entry".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: format!("{} • {}", vtype, date),
                    meta: Some(date),
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    let total = results.len();
    Ok(SearchResponse { results, total })
}

/// Generate GSTR-1 Summary
#[tauri::command]
pub async fn get_gstr1(uuid: String, query: ReportQuery) -> Result<GSTR1Report, String> {
    let conn = mount::get_company_conn(&uuid)?;
    reports::generate_gstr1(&conn, &query).map_err(|e| e.to_string())
}

/// Generate GSTR-3B Summary
#[tauri::command]
pub async fn get_gstr3b(uuid: String, query: ReportQuery) -> Result<GSTR3BReport, String> {
    let conn = mount::get_company_conn(&uuid)?;
    reports::generate_gstr3b(&conn, &query).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn create_ecommerce_operator(uuid: String, req: CreateOperatorRequest) -> Result<EcommerceOperator, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::create_ecommerce_operator(&conn, &req).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_ecommerce_operators(uuid: String) -> Result<Vec<EcommerceOperator>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_ecommerce_operators(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_ecommerce_operator(uuid: String, operator_id: String) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::delete_ecommerce_operator(&conn, &operator_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_ecommerce_operator(uuid: String, req: UpdateOperatorRequest) -> Result<EcommerceOperator, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::update_ecommerce_operator(&conn, &req).map_err(|e| e.to_string())
}
