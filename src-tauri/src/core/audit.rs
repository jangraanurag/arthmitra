use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

/// Append an immutable audit log entry with blockchain-lite hash chaining.
/// Each entry's hash depends on the previous entry's hash, making tampering detectable.
pub fn log_action(
    conn: &Connection,
    action: &str,
    actor: &str,
    actor_type: &str,
    details: Option<&str>,
    entity_id: Option<&str>,
    entity_type: Option<&str>,
) -> Result<(), rusqlite::Error> {
    // Get the last hash in the chain
    let prev_hash: String = conn
        .query_row(
            "SELECT COALESCE((SELECT data_hash FROM audit_log ORDER BY id DESC LIMIT 1), '')",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let timestamp = chrono::Utc::now().to_rfc3339();

    // Compute data hash = SHA-256(prev_hash + action + actor + timestamp + details + entity_id + entity_type)
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(action.as_bytes());
    hasher.update(actor.as_bytes());
    hasher.update(actor_type.as_bytes());
    hasher.update(timestamp.as_bytes());
    if let Some(d) = details {
        hasher.update(d.as_bytes());
    }
    if let Some(e) = entity_id {
        hasher.update(e.as_bytes());
    }
    if let Some(t) = entity_type {
        hasher.update(t.as_bytes());
    }

    let data_hash = hex::encode(hasher.finalize());

    conn.execute(
        "INSERT INTO audit_log (prev_hash, data_hash, action, actor, actor_type, timestamp, details, entity_id, entity_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![prev_hash, data_hash, action, actor, actor_type, timestamp, details, entity_id, entity_type],
    )?;

    Ok(())
}

/// Verify the entire audit chain integrity.
/// Walks every entry and recomputes hashes. Returns (is_valid, error_at_id).
pub fn verify_chain_integrity(conn: &Connection) -> Result<(bool, Option<i64>), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, prev_hash, data_hash, action, actor, actor_type, timestamp, details, entity_id, entity_type FROM audit_log ORDER BY id ASC",
    )?;

    // (id, prev, hash, action, actor, type, time, details, ent_id, ent_type)
    let rows: Vec<(
        i64,
        String,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut expected_prev_hash = String::new();

    for (
        id,
        prev_hash,
        data_hash,
        action,
        actor,
        actor_type,
        timestamp,
        details,
        entity_id,
        entity_type,
    ) in &rows
    {
        // Verify chain link
        if *prev_hash != expected_prev_hash {
            log::error!("Audit chain broken at id {}: prev_hash mismatch", id);
            return Ok((false, Some(*id)));
        }

        // Recompute and verify data hash
        let mut hasher = Sha256::new();
        hasher.update(prev_hash.as_bytes());
        hasher.update(action.as_bytes());
        hasher.update(actor.as_bytes());
        hasher.update(actor_type.as_bytes());
        hasher.update(timestamp.as_bytes());

        if let Some(d) = details {
            hasher.update(d.as_bytes());
        }
        if let Some(e) = entity_id {
            hasher.update(e.as_bytes());
        }
        if let Some(t) = entity_type {
            hasher.update(t.as_bytes());
        }

        let computed_hash = hex::encode(hasher.finalize());

        if computed_hash != *data_hash {
            log::error!("Audit chain tampered at id {}: data_hash mismatch", id);
            return Ok((false, Some(*id)));
        }

        expected_prev_hash = data_hash.clone();
    }

    Ok((true, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::schema::init_company_db;

    #[test]
    fn test_audit_chain_integrity() {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();

        // Log several actions
        log_action(&conn, "create_entry", "user1", "human", None, None, None).unwrap();
        log_action(
            &conn,
            "approve_entry",
            "ca1",
            "human",
            Some("Approved by CA"),
            Some("ENT-1"),
            Some("journal"),
        )
        .unwrap();
        log_action(&conn, "create_entry", "ai_engine", "ai", None, None, None).unwrap();

        // Verify chain
        let (valid, error_id) = verify_chain_integrity(&conn).unwrap();
        assert!(valid, "Chain should be valid");
        assert!(error_id.is_none());
    }

    #[test]
    fn test_tamper_detection() {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();

        log_action(&conn, "create_entry", "user1", "human", None, None, None).unwrap();
        log_action(&conn, "approve_entry", "ca1", "human", None, None, None).unwrap();

        // Tamper with data
        conn.execute(
            "UPDATE audit_log SET action = 'delete_entry' WHERE id = 1",
            [],
        )
        .unwrap();

        // Verify should fail
        let (valid, error_id) = verify_chain_integrity(&conn).unwrap();
        assert!(!valid, "Tamper should be detected");
        assert_eq!(error_id, Some(1));
    }
}
