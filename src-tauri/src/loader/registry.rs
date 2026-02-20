use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::core::models::CompanyInfo;

static REGISTRY_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Initialize the system-level company registry database.
/// This is separate from company databases — it tracks known companies.
pub fn init_registry(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| format!("Cannot open registry: {}", e))?;

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS company_registry (
            uuid        TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            path        TEXT NOT NULL,
            gstin       TEXT,
            drive_type  TEXT NOT NULL DEFAULT 'local',
            last_opened TEXT,
            status      TEXT NOT NULL DEFAULT 'available'
        );

        CREATE TABLE IF NOT EXISTS scan_directories (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS users (
            user_id        TEXT PRIMARY KEY,
            username       TEXT NOT NULL UNIQUE,
            password_hash  TEXT NOT NULL,
            display_name   TEXT NOT NULL,
            role           TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('admin','operator')),
            is_active      INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            last_login     TEXT
        );
        ",
    )
    .map_err(|e| format!("Cannot create registry tables: {}", e))?;

    // Seed default admin user if no users exist
    let user_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);

    if user_count == 0 {
        let default_hash = bcrypt::hash("admin123", bcrypt::DEFAULT_COST)
            .map_err(|e| format!("Failed to hash default password: {}", e))?;
        conn.execute(
            "INSERT INTO users (user_id, username, password_hash, display_name, role, must_change_password) VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            params![
                uuid::Uuid::new_v4().to_string(),
                "admin",
                default_hash,
                "Administrator",
                "admin"
            ],
        )
        .map_err(|e| format!("Failed to seed default admin: {}", e))?;
        log::info!("Seeded default admin user (admin/admin123)");
    }

    // Store path for later use
    let mut reg = REGISTRY_PATH.lock().unwrap();
    *reg = Some(path.to_path_buf());

    Ok(())
}

/// Get the registry database connection (internal)
fn get_registry_conn() -> Result<Connection, String> {
    let reg = REGISTRY_PATH.lock().unwrap();
    let path = reg
        .as_ref()
        .ok_or_else(|| "Registry not initialized".to_string())?;
    Connection::open(path).map_err(|e| format!("Cannot open registry: {}", e))
}

/// Public wrapper for registry connection (used by auth module)
pub fn get_registry_conn_pub() -> Result<Connection, String> {
    get_registry_conn()
}

/// Register or update a company in the registry
pub fn register_company(
    uuid: &str,
    name: &str,
    path: &str,
    gstin: Option<&str>,
    drive_type: &str,
) -> Result<(), String> {
    let conn = get_registry_conn()?;
    conn.execute(
        "INSERT OR REPLACE INTO company_registry (uuid, company_name, path, gstin, drive_type, status) VALUES (?1, ?2, ?3, ?4, ?5, 'available')",
        params![uuid, name, path, gstin, drive_type],
    )
    .map_err(|e| format!("Cannot register company: {}", e))?;
    Ok(())
}

/// Get all registered companies
pub fn get_all_companies() -> Result<Vec<CompanyInfo>, String> {
    let conn = get_registry_conn()?;
    let mut stmt = conn
        .prepare("SELECT uuid, company_name, gstin, path, drive_type, last_opened, status FROM company_registry ORDER BY last_opened DESC")
        .map_err(|e| format!("Query error: {}", e))?;

    let companies: Vec<CompanyInfo> = stmt
        .query_map([], |row| {
            Ok(CompanyInfo {
                uuid: row.get(0)?,
                company_name: row.get(1)?,
                gstin: row.get(2)?,
                path: row.get(3)?,
                drive_type: row.get(4)?,
                last_opened: row.get(5)?,
                status: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(companies)
}

/// Update company status
pub fn update_company_status(uuid: &str, status: &str) -> Result<(), String> {
    let conn = get_registry_conn()?;
    conn.execute(
        "UPDATE company_registry SET status = ?1 WHERE uuid = ?2",
        params![status, uuid],
    )
    .map_err(|e| format!("Cannot update status: {}", e))?;
    Ok(())
}

/// Mark company as opened
pub fn mark_opened(uuid: &str) -> Result<(), String> {
    let conn = get_registry_conn()?;
    conn.execute(
        "UPDATE company_registry SET last_opened = datetime('now'), status = 'mounted' WHERE uuid = ?1",
        params![uuid],
    )
    .map_err(|e| format!("Cannot mark opened: {}", e))?;
    Ok(())
}

/// Remove a company from the registry
pub fn remove_company(uuid: &str) -> Result<(), String> {
    let conn = get_registry_conn()?;
    conn.execute(
        "DELETE FROM company_registry WHERE uuid = ?1",
        params![uuid],
    )
    .map_err(|e| format!("Cannot remove company: {}", e))?;
    Ok(())
}
