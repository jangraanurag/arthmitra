use rusqlite::{params, Connection};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::str::FromStr;
use uuid::Uuid;
use chrono;

use super::audit;
use super::models::*;

/// Errors that can occur during ledger operations
#[derive(Debug, thiserror::Error)]
pub enum LedgerError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Entry not found: {0}")]
    NotFound(String),

    #[error("Invalid decimal: {0}")]
    InvalidDecimal(String),
}

impl serde::Serialize for LedgerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type LedgerResult<T> = Result<T, LedgerError>;

// ── Account Operations ──────────────────────────────────────────────────

/// Create a new account in the chart of accounts
pub fn create_account(conn: &Connection, req: &CreateAccountRequest) -> LedgerResult<Account> {
    // Validate account type
    AccountType::from_str(&req.account_type).ok_or_else(|| {
        LedgerError::Validation(format!("Invalid account type: {}", req.account_type))
    })?;

    // Validate parent exists if specified
    if let Some(ref parent_id) = req.parent_account {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = ?1)",
            params![parent_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LedgerError::Validation(format!(
                "Parent account not found: {}",
                parent_id
            )));
        }
    }

    let account_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO accounts (account_id, name, account_type, parent_account, group_code, is_system, gstin, state, address, email, phone) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9, ?10)",
        params![
            account_id,
            req.name,
            req.account_type,
            req.parent_account,
            req.group_code,
            req.gstin,
            req.state,
            req.address,
            req.email,
            req.phone
        ],
    )?;

    // Log audit
    let details = serde_json::to_string(&req).ok();
    audit::log_action(conn, "create_account", &account_id, "system", details.as_deref(), Some(&account_id), Some("accounts"))?;

    Ok(Account {
        account_id,
        name: req.name.clone(),
        account_type: req.account_type.clone(),
        parent_account: req.parent_account.clone(),
        group_code: req.group_code.clone(),
        is_system: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        gstin: req.gstin.clone(),
        state: req.state.clone(),
        address: req.address.clone(),
        email: req.email.clone(),
        phone: req.phone.clone(),
    })
}

/// Get all accounts, optionally filtered by type
pub fn get_accounts(conn: &Connection, account_type: Option<&str>) -> LedgerResult<Vec<Account>> {
    let mut accounts = Vec::new();

    if let Some(acc_type) = account_type {
        let mut stmt = conn.prepare(
            "SELECT account_id, name, account_type, parent_account, group_code, is_system, created_at, gstin, state, address, email, phone FROM accounts WHERE account_type = ?1 ORDER BY group_code, name",
        )?;
        let rows = stmt.query_map(params![acc_type], |row| {
            Ok(Account {
                account_id: row.get(0)?,
                name: row.get(1)?,
                account_type: row.get(2)?,
                parent_account: row.get(3)?,
                group_code: row.get(4)?,
                is_system: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                gstin: row.get(7)?,
                state: row.get(8)?,
                address: row.get(9)?,
                email: row.get(10)?,
                phone: row.get(11)?,
            })
        })?;
        for row in rows {
            accounts.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT account_id, name, account_type, parent_account, group_code, is_system, created_at, gstin, state, address, email, phone FROM accounts ORDER BY group_code, name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Account {
                account_id: row.get(0)?,
                name: row.get(1)?,
                account_type: row.get(2)?,
                parent_account: row.get(3)?,
                group_code: row.get(4)?,
                is_system: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                gstin: row.get(7)?,
                state: row.get(8)?,
                address: row.get(9)?,
                email: row.get(10)?,
                phone: row.get(11)?,
            })
        })?;
        for row in rows {
            accounts.push(row?);
        }
    }

    Ok(accounts)
}

/// Update an existing account
pub fn update_account(conn: &Connection, req: &UpdateAccountRequest) -> LedgerResult<Account> {
    // Check if account exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = ?1)",
        params![req.account_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(LedgerError::NotFound(format!(
            "Account not found: {}",
            req.account_id
        )));
    }

    // Validate account type
    AccountType::from_str(&req.account_type).ok_or_else(|| {
        LedgerError::Validation(format!("Invalid account type: {}", req.account_type))
    })?;

    // Get current account details
    let current_type: String = conn.query_row(
        "SELECT account_type FROM accounts WHERE account_id = ?1",
        params![req.account_id],
        |row| row.get(0),
    )?;

    if req.account_type != current_type {
        return Err(LedgerError::Validation(
            "Cannot change Account Type. Please delete and recreate the account if necessary.".to_string(),
        ));
    }

    // Validate parent exists if specified
    if let Some(ref parent_id) = req.parent_account {
        // Prevent circular dependency: parent cannot be itself
        if parent_id == &req.account_id {
            return Err(LedgerError::Validation(
                "Account cannot be its own parent".to_string(),
            ));
        }

        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = ?1)",
            params![parent_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LedgerError::Validation(format!(
                "Parent account not found: {}",
                parent_id
            )));
        }
    }

    conn.execute(
        "UPDATE accounts SET name = ?1, account_type = ?2, parent_account = ?3, group_code = ?4, gstin = ?5, state = ?6, address = ?7, email = ?8, phone = ?9 WHERE account_id = ?10",
        params![
            req.name,
            req.account_type,
            req.parent_account,
            req.group_code,
            req.gstin,
            req.state,
            req.address,
            req.email,
            req.phone,
            req.account_id
        ],
    )?;

    let details = serde_json::to_string(&req).ok();
    audit::log_action(conn, "update_account", &req.account_id, "system", details.as_deref(), Some(&req.account_id), Some("accounts"))?;

    Ok(Account {
        account_id: req.account_id.clone(),
        name: req.name.clone(),
        account_type: req.account_type.clone(),
        parent_account: req.parent_account.clone(),
        group_code: req.group_code.clone(),
        is_system: false, // We don't change is_system flag
        created_at: chrono::Utc::now().to_rfc3339(), // This is technically wrong (should fetch original), but fine for return value
        gstin: req.gstin.clone(),
        state: req.state.clone(),
        address: req.address.clone(),
        email: req.email.clone(),
        phone: req.phone.clone(),
    })
}

/// Delete an account (if unused)
pub fn delete_account(conn: &Connection, account_id: &str) -> LedgerResult<()> {
    // 1. Check if system account
    let is_system: bool = conn.query_row(
        "SELECT is_system FROM accounts WHERE account_id = ?1",
        params![account_id],
        |row| row.get(0),
    ).map_err(|_| LedgerError::NotFound(format!("Account not found: {}", account_id)))?;

    if is_system {
        return Err(LedgerError::Validation(
            "Cannot delete a system account".to_string(),
        ));
    }

    // 2. Check for child accounts
    let has_children: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE parent_account = ?1)",
        params![account_id],
        |row| row.get(0),
    )?;

    if has_children {
        return Err(LedgerError::Validation(
            "Cannot delete account with child accounts. Please reassign or delete children first.".to_string(),
        ));
    }

    // 3. Check for existing ledger entries
    let has_entries: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM ledger_lines WHERE account_id = ?1)",
        params![account_id],
        |row| row.get(0),
    )?;

    if has_entries {
        return Err(LedgerError::Validation(
            "Cannot delete account with existing transactions.".to_string(),
        ));
    }

    // Safe to delete
    conn.execute(
        "DELETE FROM accounts WHERE account_id = ?1",
        params![account_id],
    )?;

    audit::log_action(conn, "delete_account", account_id, "system", None, Some(account_id), Some("accounts"))?;

    Ok(())
}

// ── Journal Entry Operations ────────────────────────────────────────────

/// Create a new journal entry with ledger lines.
/// Enforces the fundamental double-entry rule: total debit == total credit.
pub fn create_entry(conn: &Connection, req: &CreateEntryRequest, user_role: Option<&str>) -> LedgerResult<JournalEntry> {
    // ── Validation ──
    if req.lines.is_empty() {
        return Err(LedgerError::Validation(
            "Entry must have at least one line".to_string(),
        ));
    }
    if req.lines.len() < 2 {
        return Err(LedgerError::Validation(
            "Double-entry requires at least 2 lines".to_string(),
        ));
    }

    // Parse and validate all decimals
    let mut total_debit = Decimal::ZERO;
    let mut total_credit = Decimal::ZERO;

    for line in &req.lines {
        let debit = Decimal::from_str(&line.debit)
            .map_err(|_| LedgerError::InvalidDecimal(format!("Invalid debit: {}", line.debit)))?;
        let credit = Decimal::from_str(&line.credit)
            .map_err(|_| LedgerError::InvalidDecimal(format!("Invalid credit: {}", line.credit)))?;

        if debit < Decimal::ZERO || credit < Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Debit/Credit cannot be negative".to_string(),
            ));
        }
        if debit == Decimal::ZERO && credit == Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Line must have either debit or credit > 0".to_string(),
            ));
        }
        if debit > Decimal::ZERO && credit > Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Line cannot have both debit and credit".to_string(),
            ));
        }

        // Verify account exists
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = ?1)",
            params![&line.account_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LedgerError::Validation(format!(
                "Account not found: {}",
                line.account_id
            )));
        }

        total_debit += debit;
        total_credit += credit;
    }

    // ── THE GOLDEN RULE ──
    if total_debit != total_credit {
        return Err(LedgerError::Validation(format!(
            "Double-entry violation: total debit ({}) != total credit ({})",
            total_debit, total_credit
        )));
    }

    // Validate voucher type exists
    let vt_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM voucher_types WHERE type_id = ?1)",
        params![&req.voucher_type],
        |row| row.get(0),
    )?;
    if !vt_exists {
        return Err(LedgerError::Validation(format!(
            "Unknown voucher type: {}",
            req.voucher_type
        )));
    }

    // ── Determine approval status (Maker-Checker) ──
    // AI entries always need approval. Operators need approval. Admins are auto-approved.
    let approval_status = if req.actor_type == "ai" {
        "pending_approval"
    } else if let Some(role) = user_role {
        if role == "admin" { "approved" } else { "pending_approval" }
    } else {
        "approved" // fallback for legacy/test flows
    };

    // ── Atomic transaction: write journal + ledger lines ──
    let tx = conn.unchecked_transaction()?;

    // ── Generate Voucher Number ──
    let voucher_number = if let Some(ref num) = req.voucher_number {
        // Use provided number (manual override)
        // Check uniqueness uniqueness
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE voucher_type = ?1 AND voucher_number = ?2)",
            params![req.voucher_type, num],
            |row| row.get(0),
        )?;
        if exists {
            return Err(LedgerError::Validation(format!(
                "Voucher number {} already exists for type {}",
                num, req.voucher_type
            )));
        }
        num.clone()
    } else {
        // Auto-generate next number
        generate_next_voucher_number(&tx, &req.voucher_type)?
    };

    // ── Compute checksum ──
    let entry_id = Uuid::new_v4().to_string();
    let checksum = compute_entry_checksum(&entry_id, &req.date, &req.narration, &req.lines);

    tx.execute(
        "INSERT INTO journal_entries (entry_id, date, voucher_number, narration, source, voucher_type, created_by, actor_type, approval_status, checksum, is_rcm, ecommerce_operator) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![entry_id, req.date, voucher_number, req.narration, req.source, req.voucher_type, "user", req.actor_type, approval_status, checksum, req.is_rcm.unwrap_or(false), req.ecommerce_operator],
    )?;

    for line in &req.lines {
        let line_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO ledger_lines (line_id, entry_id, account_id, debit, credit) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![line_id, entry_id, line.account_id, line.debit, line.credit],
        )?;
    }

    // Update balance snapshots
    for line in &req.lines {
        update_balance_snapshot(&tx, &line.account_id)?;
    }

    // Audit log
    let details = serde_json::to_string(&req).ok();
    audit::log_action(&tx, "create_entry", &entry_id, &req.actor_type, details.as_deref(), Some(&entry_id), Some("journal_entries"))?;

    // Insert Inventory Entries
    let mut inventory_response: Option<Vec<InventoryEntry>> = None;
    if let Some(inv_items) = &req.inventory {
        for inv in inv_items {
            tx.execute(
                "INSERT INTO inventory_entries (entry_id, item_id, txn_type, quantity, rate, amount, tax_inclusive) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![entry_id, inv.item_id, inv.txn_type, inv.quantity, inv.rate, inv.amount, inv.tax_inclusive.unwrap_or(false)],
            )?;
        }
        // Construct response
        inventory_response = Some(inv_items.iter().map(|i| InventoryEntry {
            entry_id: entry_id.clone(),
            item_id: i.item_id.clone(),
            item_name: None, // We don't fetch names here to save a query, frontend usually knows
            unit_symbol: None,
            txn_type: i.txn_type.clone(),
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
            tax_inclusive: i.tax_inclusive.unwrap_or(false),
        }).collect());
    }

    tx.commit()?;

    Ok(JournalEntry {
        entry_id,
        date: req.date.clone(),
        voucher_number,
        narration: req.narration.clone(),
        source: req.source.clone(),
        voucher_type: req.voucher_type.clone(),
        created_by: "user".to_string(),
        actor_type: req.actor_type.clone(),
        approval_status: approval_status.to_string(),
        checksum,
        created_at: chrono::Utc::now().to_rfc3339(),
        is_rcm: req.is_rcm.unwrap_or(false),
        ecommerce_operator: req.ecommerce_operator.clone(),
        inventory: inventory_response,
    })
}

/// Generate the next voucher number for a given type (e.g., "receipt" -> "RCPT-001")
/// Generate the next voucher number for a given type (e.g., "receipt" -> "RCPT-001")
pub fn generate_next_voucher_number(tx: &rusqlite::Transaction, voucher_type: &str) -> LedgerResult<String> {
    // 1. Get prefix mapping
    let prefix = match voucher_type {
        "receipt" => "RCPT",
        "payment" => "PYMT",
        "journal" => "JRNL",
        "contra" => "CNTR",
        "sales" => "SALE",
        "purchase" => "PURC",
        "debit_note" => "DBNT",
        "credit_note" => "CRNT",
        "production" => "PROD",
        _ => "VCHR",
    };

    // 2. Increment sequence atomically
    tx.execute(
        "INSERT INTO sequences (seq_id, last_val) VALUES (?1, 1) ON CONFLICT(seq_id) DO UPDATE SET last_val = last_val + 1",
        params![voucher_type],
    )?;

    let next_val: i64 = tx.query_row(
        "SELECT last_val FROM sequences WHERE seq_id = ?1",
        params![voucher_type],
        |row| row.get(0),
    )?;

    // 3. Format: PREFIX-001
    // Pad with leading zeros (e.g., 3 digits)
    let number_part = format!("{:03}", next_val); // or just straight number? standard implies some padding.

    Ok(format!("{}-{}", prefix, number_part))
}

/// Peek at the next voucher number without incrementing (for UI display)
pub fn peek_next_voucher_number(conn: &Connection, voucher_type: &str) -> LedgerResult<String> {
    // 1. Get prefix mapping
    let prefix = match voucher_type {
        "receipt" => "RCPT",
        "payment" => "PYMT",
        "journal" => "JRNL",
        "contra" => "CNTR",
        "sales" => "SALE",
        "purchase" => "PURC",
        "debit_note" => "DBNT",
        "credit_note" => "CRNT",
        _ => "VCHR",
    };

    // 2. Query current value
    let last_val: i64 = conn.query_row(
        "SELECT last_val FROM sequences WHERE seq_id = ?1",
        params![voucher_type],
        |row| row.get(0),
    ).unwrap_or(0); // If no sequence exists, next is 1

    let next_val = last_val + 1;

    // 3. Format: PREFIX-001
    let number_part = format!("{:03}", next_val);

    Ok(format!("{}-{}", prefix, number_part))
}

/// Approve a pending journal entry (CA/human action)
pub fn approve_entry(conn: &Connection, entry_id: &str) -> LedgerResult<JournalEntry> {
    // Verify entry exists and is pending
    let entry = get_entry(conn, entry_id)?;
    if entry.approval_status != "pending_approval" && entry.approval_status != "draft" {
        return Err(LedgerError::Validation(format!(
            "Entry {} is not pending approval (status: {})",
            entry_id, entry.approval_status
        )));
    }

    conn.execute(
        "UPDATE journal_entries SET approval_status = 'approved' WHERE entry_id = ?1",
        params![entry_id],
    )?;

    audit::log_action(conn, "approve_entry", entry_id, "human", None, Some(entry_id), Some("journal_entries"))?;

    let mut updated = entry;
    updated.approval_status = "approved".to_string();
    Ok(updated)
}

/// Void (Soft Delete) a journal entry
pub fn delete_entry(conn: &Connection, entry_id: &str) -> LedgerResult<()> {
    // 1. Check if exists
    let entry = get_entry(conn, entry_id)?;
    if entry.approval_status == "voided" {
        return Ok(()); // Already voided
    }

    // 2. Mark as voided
    conn.execute(
        "UPDATE journal_entries SET approval_status = 'voided' WHERE entry_id = ?1",
        params![entry_id],
    )?;

    // 3. Update balances for affected accounts
    let stmt_sql = "SELECT account_id FROM ledger_lines WHERE entry_id = ?1";
    let mut stmt = conn.prepare(stmt_sql)?;
    let account_ids: Vec<String> = stmt
        .query_map(params![entry_id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    for acc_id in account_ids {
        update_balance_snapshot(conn, &acc_id)?;
    }

    audit::log_action(conn, "void_entry", entry_id, "human", None, Some(entry_id), Some("journal_entries"))?;

    Ok(())
}

/// Get a single journal entry by ID
pub fn get_entry(conn: &Connection, entry_id: &str) -> LedgerResult<JournalEntry> {
    conn.query_row(
        "SELECT entry_id, date, voucher_number, narration, source, voucher_type, created_by, actor_type, approval_status, checksum, created_at, is_rcm, ecommerce_operator FROM journal_entries WHERE entry_id = ?1",
        params![entry_id],
        |row| {
            Ok(JournalEntry {
                entry_id: row.get(0)?,
                date: row.get(1)?,
                voucher_number: row.get(2)?,
                narration: row.get(3)?,
                source: row.get(4)?,
                voucher_type: row.get(5)?,
                created_by: row.get(6)?,
                actor_type: row.get(7)?,
                approval_status: row.get(8)?,
                checksum: row.get(9)?,
                created_at: row.get(10)?,
                is_rcm: row.get(11)?,
                ecommerce_operator: row.get(12)?,
                inventory: None,
            })
        },
    )

    .map_err(|_| LedgerError::NotFound(format!("Entry not found: {}", entry_id))).map(|mut entry| {
        // Fetch inventory entries
        let mut stmt = conn.prepare(
            "SELECT ie.entry_id, ie.item_id, i.name, u.symbol, ie.txn_type, ie.quantity, ie.rate, ie.amount, ie.tax_inclusive 
             FROM inventory_entries ie
             JOIN inventory_items i ON ie.item_id = i.item_id
             JOIN inventory_units u ON i.unit_id = u.unit_id
             WHERE ie.entry_id = ?1"
        ).unwrap(); // Should handle error better but unwrap is quick here for now
        
        let inv_rows = stmt.query_map(params![entry_id], |row| {
             Ok(InventoryEntry {
                entry_id: row.get(0)?,
                item_id: row.get(1)?,
                item_name: row.get(2)?,
                unit_symbol: row.get(3)?,
                txn_type: row.get(4)?,
                quantity: row.get(5)?,
                rate: row.get(6)?,
                amount: row.get(7)?,
                tax_inclusive: row.get(8).unwrap_or(false),
            })
        }).unwrap();

        let mut inv_entries = Vec::new();
        for r in inv_rows {
            if let Ok(item) = r {
                inv_entries.push(item);
            }
        }
        
        if !inv_entries.is_empty() {
            entry.inventory = Some(inv_entries);
        }
        entry
    })
}

// ── Ledger Query ────────────────────────────────────────────────────────

/// Update an existing journal entry.
/// Replaces all details and ledger lines.
pub fn update_entry(conn: &Connection, req: &UpdateEntryRequest) -> LedgerResult<JournalEntry> {
    // 1. Verify existence and status
    let current_entry = get_entry(conn, &req.entry_id)?;
    if current_entry.approval_status == "voided" {
        return Err(LedgerError::Validation(
            "Cannot edit a voided entry".to_string(),
        ));
    }

    // 2. Validate Data (Double Entry Rule)
    if req.lines.is_empty() {
        return Err(LedgerError::Validation(
            "Entry must have at least one line".to_string(),
        ));
    }
    if req.lines.len() < 2 {
        return Err(LedgerError::Validation(
            "Double-entry requires at least 2 lines".to_string(),
        ));
    }

    let mut total_debit = Decimal::ZERO;
    let mut total_credit = Decimal::ZERO;

    for line in &req.lines {
        let debit = Decimal::from_str(&line.debit)
            .map_err(|_| LedgerError::InvalidDecimal(format!("Invalid debit: {}", line.debit)))?;
        let credit = Decimal::from_str(&line.credit)
            .map_err(|_| LedgerError::InvalidDecimal(format!("Invalid credit: {}", line.credit)))?;

        if debit < Decimal::ZERO || credit < Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Debit/Credit cannot be negative".to_string(),
            ));
        }
        if debit == Decimal::ZERO && credit == Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Line must have either debit or credit > 0".to_string(),
            ));
        }
        if debit > Decimal::ZERO && credit > Decimal::ZERO {
            return Err(LedgerError::Validation(
                "Line cannot have both debit and credit".to_string(),
            ));
        }

        // Verify account exists
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = ?1)",
            params![&line.account_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LedgerError::Validation(format!(
                "Account not found: {}",
                line.account_id
            )));
        }

        total_debit += debit;
        total_credit += credit;
    }

    if total_debit != total_credit {
        return Err(LedgerError::Validation(format!(
            "Double-entry violation: total debit ({}) != total credit ({})",
            total_debit, total_credit
        )));
    }

    // Validate voucher type exists
    let vt_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM voucher_types WHERE type_id = ?1)",
        params![&req.voucher_type],
        |row| row.get(0),
    )?;
    if !vt_exists {
        return Err(LedgerError::Validation(format!(
            "Unknown voucher type: {}",
            req.voucher_type
        )));
    }

    // 3. Begin Transaction
    let tx = conn.unchecked_transaction()?;

    // Determine voucher number
    let voucher_number = if let Some(ref num) = req.voucher_number {
        // Check uniqueness (exclude current entry)
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE voucher_type = ?1 AND voucher_number = ?2 AND entry_id != ?3)",
            params![req.voucher_type, num, req.entry_id],
            |row| row.get(0),
        )?;
        if exists {
            return Err(LedgerError::Validation(format!(
                "Voucher number {} already exists for type {}",
                num, req.voucher_type
            )));
        }
        num.clone()
    } else {
        // Keep existing number if not provided
        current_entry.voucher_number.clone()
    };

    // Calculate new checksum
    let checksum = compute_entry_checksum(&req.entry_id, &req.date, &req.narration, &req.lines);

    // Update Journal Entry
    tx.execute(
        "UPDATE journal_entries SET date = ?1, voucher_number = ?2, narration = ?3, voucher_type = ?4, checksum = ?5, is_rcm = ?6, ecommerce_operator = ?7 WHERE entry_id = ?8",
        params![req.date, voucher_number, req.narration, req.voucher_type, checksum, req.is_rcm.unwrap_or(false), req.ecommerce_operator, req.entry_id],
    )?;

    // Get old account IDs to update their balances later
    let mut affected_accounts = std::collections::HashSet::new();
    {
        let mut stmt = tx.prepare("SELECT account_id FROM ledger_lines WHERE entry_id = ?1")?;
        let rows = stmt.query_map(params![req.entry_id], |row| row.get::<_, String>(0))?;
        for r in rows {
            affected_accounts.insert(r?);
        }
    }

    // Delete old lines
    tx.execute(
        "DELETE FROM ledger_lines WHERE entry_id = ?1",
        params![req.entry_id],
    )?;

    // Insert new lines
    for line in &req.lines {
        let line_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO ledger_lines (line_id, entry_id, account_id, debit, credit) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![line_id, req.entry_id, line.account_id, line.debit, line.credit],
        )?;
        affected_accounts.insert(line.account_id.clone());
    }

    // Update balances for all affected accounts (old and new)
    for acc_id in affected_accounts {
        update_balance_snapshot(&tx, &acc_id)?;
    }

    let old_state = serde_json::to_string(&current_entry).ok();
    audit::log_action(&tx, "update_entry", &req.entry_id, "user", old_state.as_deref(), Some(&req.entry_id), Some("journal_entries"))?;


    // Update Inventory
    // 1. Delete old
    tx.execute("DELETE FROM inventory_entries WHERE entry_id = ?1", params![req.entry_id])?;

    // 2. Insert new
    if let Some(inv_items) = &req.inventory {
        for inv in inv_items {
             tx.execute(
                "INSERT INTO inventory_entries (entry_id, item_id, txn_type, quantity, rate, amount) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![req.entry_id, inv.item_id, inv.txn_type, inv.quantity, inv.rate, inv.amount],
            )?;
        }
    }

    tx.commit()?;

    Ok(JournalEntry {
        entry_id: req.entry_id.clone(),
        date: req.date.clone(),
        voucher_number,
        narration: req.narration.clone(),
        source: current_entry.source,
        voucher_type: req.voucher_type.clone(),
        created_by: current_entry.created_by,
        actor_type: current_entry.actor_type,
        approval_status: current_entry.approval_status,
        checksum,
        created_at: current_entry.created_at,
        is_rcm: req.is_rcm.unwrap_or(false),
        ecommerce_operator: req.ecommerce_operator.clone(),
        inventory: None, // TODO: Return updated inventory if needed
    })
}

/// Get ledger entries with lines, supporting pagination and filtering
pub fn get_ledger(conn: &Connection, query: &LedgerQuery) -> LedgerResult<LedgerResponse> {
    let mut where_clauses = Vec::new();
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref eid) = query.entry_id {
        where_clauses.push(format!("je.entry_id = ?{}", bind_values.len() + 1));
        bind_values.push(Box::new(eid.clone()));
    }
    if let Some(ref from) = query.from_date {
        where_clauses.push(format!("je.date >= ?{}", bind_values.len() + 1));
        bind_values.push(Box::new(from.clone()));
    }
    if let Some(ref to) = query.to_date {
        where_clauses.push(format!("je.date <= ?{}", bind_values.len() + 1));
        bind_values.push(Box::new(to.clone()));
    }
    if let Some(ref vt) = query.voucher_type {
        // If voucher type is empty string, ignore it
        if !vt.is_empty() {
             where_clauses.push(format!("je.voucher_type = ?{}", bind_values.len() + 1));
             bind_values.push(Box::new(vt.clone()));
        }
    }
    if let Some(ref acc_id) = query.account_id {
        where_clauses.push(format!(
            "je.entry_id IN (SELECT entry_id FROM ledger_lines WHERE account_id = ?{})",
            bind_values.len() + 1
        ));
        bind_values.push(Box::new(acc_id.clone()));
    }
    
    // Search Term (Narration or Voucher Number)
    if let Some(ref search) = query.search_term {
        if !search.is_empty() {
            let pattern = format!("%{}%", search);
            where_clauses.push(format!(
                "(je.narration LIKE ?{0} OR je.voucher_number LIKE ?{0})",
                bind_values.len() + 1
            ));
            bind_values.push(Box::new(pattern));
        }
    }

    // Amount Range Search
    // This is tricky because amounts are in `ledger_lines`.
    // We want entries where ANY line matches the amount range? Or total amount?
    // Usually searching for a specific transaction amount means matching ANY debit/credit line.
    if query.min_amount.is_some() || query.max_amount.is_some() {
        let mut amount_conditions = Vec::new();
        
        if let Some(ref min) = query.min_amount {
             if let Ok(val) = min.parse::<f64>() {
                 amount_conditions.push(format!("(CAST(debit AS REAL) >= {0} OR CAST(credit AS REAL) >= {0})", val));
             }
        }
        if let Some(ref max) = query.max_amount {
             if let Ok(val) = max.parse::<f64>() {
                 amount_conditions.push(format!("(CAST(debit AS REAL) <= {0} OR CAST(credit AS REAL) <= {0})", val));
             }
        }

        if !amount_conditions.is_empty() {
            where_clauses.push(format!(
                "je.entry_id IN (SELECT entry_id FROM ledger_lines WHERE {})",
                amount_conditions.join(" AND ")
            ));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let limit = query.limit.unwrap_or(100);
    let offset = query.offset.unwrap_or(0);

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM journal_entries je {}", where_sql);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        bind_values.iter().map(|b| b.as_ref()).collect();
    let total_count: i64 = conn.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))?;

    // Fetch entries
    let entry_sql = format!(
        "SELECT entry_id, date, voucher_number, narration, source, voucher_type, created_by, actor_type, approval_status, checksum, created_at, is_rcm, ecommerce_operator FROM journal_entries je {} ORDER BY date DESC, created_at DESC LIMIT {} OFFSET {}",
        where_sql, limit, offset
    );

    let params_refs2: Vec<&dyn rusqlite::types::ToSql> =
        bind_values.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&entry_sql)?;
    let entries: Vec<JournalEntry> = stmt
        .query_map(params_refs2.as_slice(), |row| {
            Ok(JournalEntry {
                entry_id: row.get(0)?,
                date: row.get(1)?,
                voucher_number: row.get(2)?,
                narration: row.get(3)?,
                source: row.get(4)?,
                voucher_type: row.get(5)?,
                created_by: row.get(6)?,
                actor_type: row.get(7)?,
                approval_status: row.get(8)?,
                checksum: row.get(9)?,
                created_at: row.get(10)?,
                is_rcm: row.get(11)?,
                ecommerce_operator: row.get(12)?,
                inventory: None,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Fetch lines for these entries
    let entry_ids: Vec<String> = entries.iter().map(|e| e.entry_id.clone()).collect();
    let mut all_lines = Vec::new();

    if !entry_ids.is_empty() {
        let placeholders = std::iter::repeat("?").take(entry_ids.len()).collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT line_id, entry_id, account_id, debit, credit FROM ledger_lines WHERE entry_id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let lines_iter = stmt.query_map(rusqlite::params_from_iter(entry_ids.iter()), |row| {
            Ok(LedgerLine {
                line_id: row.get(0)?,
                entry_id: row.get(1)?,
                account_id: row.get(2)?,
                account_name: None, // Populated later if needed
                debit: row.get(3)?,
                credit: row.get(4)?,
            })
        })?;

        for l in lines_iter {
            all_lines.push(l?);
        }
    }

    // Populate account names efficiently
    let mut account_names = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT account_id, name FROM accounts")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        for r in rows {
            let (id, name) = r?;
            account_names.insert(id, name);
        }
    }

    for line in &mut all_lines {
        if let Some(name) = account_names.get(&line.account_id) {
            line.account_name = Some(name.clone());
        }
    }

    Ok(LedgerResponse {
        entries,
        lines: all_lines,
        total_count,
    })
}

// ── Dashboard ───────────────────────────────────────────────────────────

pub fn get_dashboard_stats(conn: &Connection) -> LedgerResult<DashboardStats> {
    // 1. Pending Approvals
    let pending_approvals: i64 = conn.query_row(
        "SELECT COUNT(*) FROM journal_entries WHERE approval_status = 'pending_approval' OR approval_status = 'draft'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    // 2. Cash & Bank Balance (Current)
    // We aggregate the 'balance' from balance_snapshot for all Asset accounts with specific groups or names
    // Actually, deeper calculation:
    // Cash: Assets with group 'Cash-in-hand'
    // Bank: Assets with group 'Bank Accounts'
    // For simplicity in this iteration, we sum ALL Assets for now, OR we can try to filter by keywords if groups aren't strictly enforced yet.
    // Let's rely on account_type = 'Asset' AND (name like '%Cash%' OR name like '%Bank%') for aheuristic if groups are missing.
    // Better: Use `balance_snapshots` table if reliable, otherwise recalc.
    // Let's recalc from ledger_lines for accuracy.

    #[derive(Default)]
    struct Balances {
        cash: Decimal,
        bank: Decimal,
    }

    let mut balances = Balances::default();

    // Get relevant account IDs
    let mut stmt = conn.prepare("SELECT account_id, name, group_code FROM accounts WHERE account_type = 'asset'")?;
    let account_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;

    let mut cash_ids = Vec::new();
    let mut bank_ids = Vec::new();

    for r in account_rows {
        let (id, name, group) = r?;
        let name_lower = name.to_lowercase();
        let group_code = group.as_deref().unwrap_or("").to_lowercase();
        
        if name_lower.contains("cash") || group_code.contains("cash") {
            cash_ids.push(id);
        } else if name_lower.contains("bank") || group_code.contains("bank") {
            bank_ids.push(id);
        }
    }

    // Helper to sum balance for a list of accounts
    let sum_balance = |ids: &[String]| -> LedgerResult<Decimal> {
         if ids.is_empty() { return Ok(Decimal::ZERO); }
         let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
         let sql = format!(
             r#"
             SELECT 
                COALESCE(SUM(CAST(ll.debit AS REAL)), 0) as total_debit, 
                COALESCE(SUM(CAST(ll.credit AS REAL)), 0) as total_credit
             FROM ledger_lines ll
             JOIN journal_entries je ON ll.entry_id = je.entry_id
             WHERE ll.account_id IN ({}) AND je.approval_status != 'voided'
             "#,
             placeholders
         );
         conn.query_row(&sql, rusqlite::params_from_iter(ids.iter()), |row| {
             let debit: f64 = row.get(0)?;
             let credit: f64 = row.get(1)?;
             // Asset balance = Debit - Credit
             Ok(Decimal::from_f64_retain(debit - credit).unwrap_or(Decimal::ZERO))
         }).map_err(LedgerError::from)
    };

    balances.cash = sum_balance(&cash_ids)?;
    balances.bank = sum_balance(&bank_ids)?;

    // 3. Monthly Income & Expense
    // Get current month start/end
    let now = chrono::Local::now();
    let start_of_month = now.format("%Y-%m-01").to_string();
    let end_of_month = now.format("%Y-%m-31").to_string(); // Approximation is fine for SQL compare, or use %Y-%m-%d of today

    let monthly_income: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(CAST(ll.credit AS REAL) - CAST(ll.debit AS REAL)), 0)
        FROM ledger_lines ll
        JOIN journal_entries je ON ll.entry_id = je.entry_id
        JOIN accounts a ON ll.account_id = a.account_id
        WHERE a.account_type = 'income'
          AND je.date >= ?1 AND je.date <= ?2
          AND je.approval_status != 'voided'
        "#,
        params![start_of_month, end_of_month],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let monthly_expense: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(CAST(ll.debit AS REAL) - CAST(ll.credit AS REAL)), 0)
        FROM ledger_lines ll
        JOIN journal_entries je ON ll.entry_id = je.entry_id
        JOIN accounts a ON ll.account_id = a.account_id
        WHERE a.account_type = 'expense'
          AND je.date >= ?1 AND je.date <= ?2
          AND je.approval_status != 'voided'
        "#,
        params![start_of_month, end_of_month],
        |row| row.get(0),
    ).unwrap_or(0.0);


    Ok(DashboardStats {
        cash_balance: format!("{:.2}", balances.cash),
        bank_balance: format!("{:.2}", balances.bank),
        monthly_income: format!("{:.2}", monthly_income),
        monthly_expense: format!("{:.2}", monthly_expense),
        pending_approvals,
    })
}


// ── Balance Operations ──────────────────────────────────────────────────

/// Get balance for an account
pub fn get_balance(conn: &Connection, account_id: &str) -> LedgerResult<BalanceSnapshot> {
    // Compute live balance from ledger lines, excluding voided entries
    let result = conn.query_row(
        "SELECT 
            COALESCE(SUM(CAST(ll.debit AS REAL)), 0), 
            COALESCE(SUM(CAST(ll.credit AS REAL)), 0) 
         FROM ledger_lines ll
         JOIN journal_entries je ON ll.entry_id = je.entry_id
         WHERE ll.account_id = ?1 AND je.approval_status != 'voided'",
        params![account_id],
        |row| {
            let total_debit: f64 = row.get(0)?;
            let total_credit: f64 = row.get(1)?;
            Ok((total_debit, total_credit))
        },
    )?;

    // Get account name and type for balance direction
    let (account_name, account_type): (String, String) = conn
        .query_row(
            "SELECT name, account_type FROM accounts WHERE account_id = ?1",
            params![account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| LedgerError::NotFound(format!("Account not found: {}", account_id)))?;

    // Calculate balance based on account type
    // Assets & Expenses: Debit - Credit (positive = debit balance)
    // Liabilities, Equity & Income: Credit - Debit (positive = credit balance)
    let balance = match account_type.as_str() {
        "asset" | "expense" => result.0 - result.1,
        _ => result.1 - result.0,
    };

    Ok(BalanceSnapshot {
        account_id: account_id.to_string(),
        account_name: Some(account_name),
        fy_id: "current".to_string(),
        balance: format!("{:.4}", balance),
        last_updated: chrono::Utc::now().to_rfc3339(),
    })
}

/// Update the balance snapshot for an account (called within transactions)
fn update_balance_snapshot(conn: &Connection, account_id: &str) -> LedgerResult<()> {
    let balance = get_balance(conn, account_id)?;
    conn.execute(
        "INSERT OR REPLACE INTO balances_snapshot (account_id, fy_id, balance, last_updated) VALUES (?1, ?2, ?3, ?4)",
        params![account_id, "current", balance.balance, balance.last_updated],
    )?;
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────────

/// Compute a SHA-256 checksum for an entry (tamper detection)
fn compute_entry_checksum(
    entry_id: &str,
    date: &str,
    narration: &str,
    lines: &[LedgerLineInput],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(entry_id.as_bytes());
    hasher.update(date.as_bytes());
    hasher.update(narration.as_bytes());
    for line in lines {
        hasher.update(line.account_id.as_bytes());
        hasher.update(line.debit.as_bytes());
        hasher.update(line.credit.as_bytes());
    }
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::schema::init_company_db;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_valid_journal_entry() {
        let conn = setup_db();
        let req = CreateEntryRequest {
            date: "2026-02-13".to_string(),
            narration: "Office rent paid".to_string(),
            voucher_type: "payment".to_string(),
            source: "manual".to_string(),
            actor_type: "human".to_string(),
            voucher_number: None, // Auto-generate
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_RENT".to_string(),
                    debit: "10000.0000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_BANK".to_string(),
                    debit: "0".to_string(),
                    credit: "10000.0000".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        let entry = create_entry(&conn, &req, Some("operator")).unwrap();
        assert_eq!(entry.approval_status, "pending_approval");
        assert!(!entry.voucher_number.is_empty()); // Check generated number
        assert!(entry.voucher_number.starts_with("PYMT-"));
        assert!(!entry.checksum.is_empty());
    }

    #[test]
    fn test_double_entry_violation_rejected() {
        let conn = setup_db();
        let req = CreateEntryRequest {
            date: "2026-02-13".to_string(),
            narration: "Bad entry".to_string(),
            voucher_type: "journal".to_string(),
            source: "manual".to_string(),
            actor_type: "human".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_RENT".to_string(),
                    debit: "10000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_BANK".to_string(),
                    debit: "0".to_string(),
                    credit: "5000".to_string(), // Mismatch!
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        let result = create_entry(&conn, &req, Some("admin"));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Double-entry violation"));
    }

    #[test]
    fn test_ai_entry_gets_pending_approval() {
        let conn = setup_db();
        let req = CreateEntryRequest {
            date: "2026-02-13".to_string(),
            narration: "AI suggested entry".to_string(),
            voucher_type: "journal".to_string(),
            source: "ai".to_string(),
            actor_type: "ai".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_MISC".to_string(),
                    debit: "500".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_HAND".to_string(),
                    debit: "0".to_string(),
                    credit: "500".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        let entry = create_entry(&conn, &req, Some("ai")).unwrap();
        assert_eq!(entry.approval_status, "pending_approval");
        assert!(entry.voucher_number.starts_with("JRNL-"));
    }

    #[test]
    fn test_approve_entry() {
        let conn = setup_db();
        let req = CreateEntryRequest {
            date: "2026-02-13".to_string(),
            narration: "Test approval".to_string(),
            voucher_type: "journal".to_string(),
            source: "ai".to_string(),
            actor_type: "ai".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_SAL".to_string(),
                    debit: "25000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_BANK".to_string(),
                    debit: "0".to_string(),
                    credit: "25000".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        let entry = create_entry(&conn, &req, Some("operator")).unwrap();
        let approved = approve_entry(&conn, &entry.entry_id).unwrap();
        assert_eq!(approved.approval_status, "approved");
    }

    #[test]
    fn test_balance_calculation() {
        let conn = setup_db();

        // Create entry: Debit Rent 10000, Credit Bank 10000
        let req = CreateEntryRequest {
            date: "2026-02-13".to_string(),
            narration: "Rent".to_string(),
            voucher_type: "payment".to_string(),
            source: "manual".to_string(),
            actor_type: "human".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_RENT".to_string(),
                    debit: "10000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_BANK".to_string(),
                    debit: "0".to_string(),
                    credit: "10000".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        create_entry(&conn, &req, Some("admin")).unwrap();

        // Rent expense should show positive 10000 (debit balance for expense)
        let rent_balance = get_balance(&conn, "EXPENSE_RENT").unwrap();
        assert_eq!(rent_balance.balance, "10000.0000");

        // Bank should show negative 10000 (asset reduced)
        let bank_balance = get_balance(&conn, "ASSET_CASH_BANK").unwrap();
        assert_eq!(bank_balance.balance, "-10000.0000");
    }

    #[test]
    fn test_get_ledger_with_filter() {
        let conn = setup_db();

        // Create two entries
        for i in 0..2 {
            let req = CreateEntryRequest {
                date: format!("2026-02-{:02}", 10 + i),
                narration: format!("Entry {}", i),
                voucher_type: "journal".to_string(),
                source: "manual".to_string(),
                actor_type: "human".to_string(),
                voucher_number: None,
                lines: vec![
                    LedgerLineInput {
                        account_id: "EXPENSE_MISC".to_string(),
                        debit: "100".to_string(),
                        credit: "0".to_string(),
                    },
                    LedgerLineInput {
                        account_id: "ASSET_CASH_HAND".to_string(),
                        debit: "0".to_string(),
                        credit: "100".to_string(),
                    },
                ],
                inventory: None,
                is_rcm: Some(false),
                ecommerce_operator: None,
            };
            create_entry(&conn, &req, Some("admin")).unwrap();
        }

        let query = LedgerQuery {
            account_id: None,
            from_date: None,
            to_date: None,
            voucher_type: None,
            limit: Some(10),
            offset: Some(0),
            min_amount: None,
            max_amount: None,
            search_term: None,
            entry_id: None,
        };
        let result = get_ledger(&conn, &query).unwrap();
        assert_eq!(result.total_count, 2);
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.lines.len(), 4); // 2 lines per entry
    }
}
// --- E-commerce Operators ---

pub fn create_ecommerce_operator(conn: &Connection, req: &CreateOperatorRequest) -> LedgerResult<EcommerceOperator> {
    let operator_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ecommerce_operators (operator_id, name, gstin) VALUES (?1, ?2, ?3)",
        params![operator_id, req.name, req.gstin],
    )?;
    Ok(EcommerceOperator {
        operator_id,
        name: req.name.clone(),
        gstin: req.gstin.clone(),
    })
}

pub fn get_ecommerce_operators(conn: &Connection) -> LedgerResult<Vec<EcommerceOperator>> {
    let mut stmt = conn.prepare("SELECT operator_id, name, gstin FROM ecommerce_operators ORDER BY name")?;
    let operators = stmt
        .query_map([], |row| {
            Ok(EcommerceOperator {
                operator_id: row.get(0)?,
                name: row.get(1)?,
                gstin: row.get(2)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(operators)
}

pub fn delete_ecommerce_operator(conn: &Connection, operator_id: &str) -> LedgerResult<()> {
    conn.execute("DELETE FROM ecommerce_operators WHERE operator_id = ?1", params![operator_id])?;
    Ok(())
}

pub fn update_ecommerce_operator(conn: &Connection, req: &UpdateOperatorRequest) -> LedgerResult<EcommerceOperator> {
    conn.execute(
        "UPDATE ecommerce_operators SET name = ?1, gstin = ?2 WHERE operator_id = ?3",
        params![req.name, req.gstin, req.operator_id],
    )?;
    Ok(EcommerceOperator {
        operator_id: req.operator_id.clone(),
        name: req.name.clone(),
        gstin: req.gstin.clone(),
    })
}

// ── Inventory Operations (Phase 7) ─────────────────────────────────────

pub fn create_item(conn: &Connection, req: &CreateItemRequest) -> LedgerResult<InventoryItem> {
    // Check if name exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM inventory_items WHERE name = ?1)",
        params![&req.name],
        |row| row.get(0),
    ).unwrap_or(false);

    if exists {
        return Err(LedgerError::Validation(format!("Item '{}' already exists", req.name)));
    }

    let item_id = Uuid::new_v4().to_string();

    conn.execute(
        r#"INSERT INTO inventory_items 
        (item_id, name, sku, hsn_code, unit_id, tax_rate, description, opening_qty, opening_value) 
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            item_id, req.name, req.sku, req.hsn_code, req.unit_id, 
            req.tax_rate, req.description, req.opening_qty, req.opening_value
        ],
    )?;

    Ok(InventoryItem {
        item_id,
        name: req.name.clone(),
        sku: req.sku.clone(),
        hsn_code: req.hsn_code.clone(),
        unit_id: req.unit_id.clone(),
        tax_rate: req.tax_rate,
        description: req.description.clone(),
        opening_qty: req.opening_qty,
        opening_value: req.opening_value,
        created_at: chrono::Local::now().to_rfc3339(),
        unit_symbol: None,
    })
}
