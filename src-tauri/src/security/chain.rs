/// Audit chain verification utilities.
/// Re-exports from core::audit for the security API boundary.
use rusqlite::Connection;

/// Verify the integrity of the audit chain for a company database.
/// Returns (is_valid, error_at_id_if_any)
pub fn verify_chain_integrity(conn: &Connection) -> Result<(bool, Option<i64>), String> {
    crate::core::audit::verify_chain_integrity(conn)
        .map_err(|e| format!("Chain verification error: {}", e))
}
