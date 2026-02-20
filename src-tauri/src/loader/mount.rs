use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::core::recovery;
use crate::core::schema;

/// Global map of currently mounted company databases
static MOUNTED_DBS: Mutex<Option<HashMap<String, MountedCompany>>> = Mutex::new(None);

struct MountedCompany {
    path: PathBuf,
    // Note: Connection cannot be stored across threads directly.
    // We store the path and create connections on-demand.
}

/// Mount a company database (open safely with integrity check)
pub fn mount_company(uuid: &str, company_dir: &Path) -> Result<(), String> {
    let db_path = company_dir.join("company.db");

    // Verify the directory still exists (USB might be removed)
    if !company_dir.exists() {
        return Err(format!("Company directory not found: {:?}", company_dir));
    }

    // Open and validate
    let conn = Connection::open(&db_path).map_err(|e| format!("Cannot open company DB: {}", e))?;

    // Initialize schema if this is a new company
    schema::init_company_db(&conn)
        .map_err(|e| format!("Cannot initialize company schema: {}", e))?;

    // Run integrity check
    let (is_ok, errors) =
        recovery::integrity_check(&conn).map_err(|e| format!("Integrity check failed: {}", e))?;

    if !is_ok {
        log::warn!("Company {} has integrity issues: {:?}", uuid, errors);
        // Try to recover by rebuilding snapshots
        recovery::rebuild_balance_snapshots(&conn)
            .map_err(|e| format!("Recovery failed: {}", e))?;
    }

    // Register as mounted
    let mut dbs = MOUNTED_DBS.lock().unwrap();
    if dbs.is_none() {
        *dbs = Some(HashMap::new());
    }
    dbs.as_mut().unwrap().insert(
        uuid.to_string(),
        MountedCompany {
            path: company_dir.to_path_buf(),
        },
    );

    // Update registry
    super::registry::mark_opened(uuid)?;

    log::info!("Mounted company: {} at {:?}", uuid, company_dir);
    Ok(())
}

/// Unmount a company database (safe close)
pub fn unmount_company(uuid: &str) -> Result<(), String> {
    let mut dbs = MOUNTED_DBS.lock().unwrap();
    if let Some(ref mut map) = *dbs {
        if map.remove(uuid).is_some() {
            super::registry::update_company_status(uuid, "available")?;
            log::info!("Unmounted company: {}", uuid);
            Ok(())
        } else {
            Err(format!("Company {} is not mounted", uuid))
        }
    } else {
        Err("No companies mounted".to_string())
    }
}

/// Get a connection to a mounted company database
pub fn get_company_conn(uuid: &str) -> Result<Connection, String> {
    let dbs = MOUNTED_DBS.lock().unwrap();
    if let Some(ref map) = *dbs {
        if let Some(mc) = map.get(uuid) {
            let db_path = mc.path.join("company.db");
            let conn =
                Connection::open(&db_path).map_err(|e| format!("Cannot open company DB: {}", e))?;
            // Ensure WAL mode
            conn.pragma_update(None, "journal_mode", "WAL")
                .map_err(|e| format!("Cannot set WAL: {}", e))?;
            Ok(conn)
        } else {
            Err(format!("Company {} is not mounted", uuid))
        }
    } else {
        Err("No companies mounted".to_string())
    }
}

/// Check if a company is currently mounted
pub fn is_mounted(uuid: &str) -> bool {
    let dbs = MOUNTED_DBS.lock().unwrap();
    if let Some(ref map) = *dbs {
        map.contains_key(uuid)
    } else {
        false
    }
}
