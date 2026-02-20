use rusqlite::Connection;

/// Recovery module for crash safety.
/// Handles WAL recovery, integrity checks, and balance snapshot rebuilding.

/// Run a full integrity check on a company database.
/// Returns (is_ok, errors_found).
pub fn integrity_check(conn: &Connection) -> Result<(bool, Vec<String>), rusqlite::Error> {
    let mut errors = Vec::new();

    // SQLite integrity check
    let mut stmt = conn.prepare("PRAGMA integrity_check")?;
    let rows: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    for row in &rows {
        if row != "ok" {
            errors.push(format!("SQLite integrity: {}", row));
        }
    }

    // Check double-entry balance (sum of all debits should equal sum of all credits)
    let (total_debit, total_credit): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(CAST(debit AS REAL)), 0), COALESCE(SUM(CAST(credit AS REAL)), 0) FROM ledger_lines",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let diff = (total_debit - total_credit).abs();
    if diff > 0.0001 {
        errors.push(format!(
            "Double-entry violation: total debit ({}) != total credit ({}), diff: {}",
            total_debit, total_credit, diff
        ));
    }

    // Verify audit chain
    let (chain_valid, chain_error) = super::audit::verify_chain_integrity(conn)?;
    if !chain_valid {
        errors.push(format!(
            "Audit chain tampering detected at entry: {:?}",
            chain_error
        ));
    }

    Ok((errors.is_empty(), errors))
}

/// Rebuild all balance snapshots from ledger lines.
/// Use after crash recovery or data import.
pub fn rebuild_balance_snapshots(conn: &Connection) -> Result<usize, rusqlite::Error> {
    // Clear existing snapshots
    conn.execute("DELETE FROM balances_snapshot", [])?;

    // Get all unique accounts that have ledger entries
    let mut stmt = conn.prepare("SELECT DISTINCT account_id FROM ledger_lines")?;
    let account_ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let count = account_ids.len();

    for account_id in &account_ids {
        // Get account type for balance direction
        let account_type: String = conn.query_row(
            "SELECT account_type FROM accounts WHERE account_id = ?1",
            rusqlite::params![account_id],
            |row| row.get(0),
        )?;

        let (total_debit, total_credit): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(CAST(debit AS REAL)), 0), COALESCE(SUM(CAST(credit AS REAL)), 0) FROM ledger_lines WHERE account_id = ?1",
            rusqlite::params![account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let balance = match account_type.as_str() {
            "asset" | "expense" => total_debit - total_credit,
            _ => total_credit - total_debit,
        };

        conn.execute(
            "INSERT INTO balances_snapshot (account_id, fy_id, balance, last_updated) VALUES (?1, 'current', ?2, datetime('now'))",
            rusqlite::params![account_id, format!("{:.4}", balance)],
        )?;
    }

    log::info!("Rebuilt balance snapshots for {} accounts", count);
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::schema::init_company_db;

    #[test]
    fn test_integrity_check_clean_db() {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();

        let (is_ok, errors) = integrity_check(&conn).unwrap();
        assert!(is_ok);
        assert!(errors.is_empty());
    }
}
