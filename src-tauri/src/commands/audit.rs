use crate::core::audit;
use crate::core::models::AuditLogEntry;
use crate::loader::mount;
use tauri::command;

/// Get recent audit log entries for the given company database.
#[command]
pub async fn get_audit_logs(
    uuid: String,
    limit: Option<i64>,
) -> Result<Vec<AuditLogEntry>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let limit = limit.unwrap_or(100);

    let mut stmt = conn.prepare(
        "SELECT id, prev_hash, data_hash, action, actor, actor_type, timestamp, actor_signature, details, entity_id, entity_type
         FROM audit_log
         ORDER BY id DESC
         LIMIT ?1",
    ).map_err(|e| e.to_string())?;

    let logs = stmt
        .query_map([limit], |row| {
            Ok(AuditLogEntry {
                id: row.get(0)?,
                prev_hash: row.get(1)?,
                data_hash: row.get(2)?,
                action: row.get(3)?,
                actor: row.get(4)?,
                actor_type: row.get(5)?,
                timestamp: row.get(6)?,
                actor_signature: row.get(7)?,
                details: row.get(8)?,
                entity_id: row.get(9)?,
                entity_type: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(logs)
}

/// Verify the integrity of the tamper-proof audit chain.
#[command]
pub async fn verify_audit_chain(uuid: String) -> Result<(bool, Option<i64>), String> {
    let conn = mount::get_company_conn(&uuid)?;
    audit::verify_chain_integrity(&conn).map_err(|e| e.to_string())
}
