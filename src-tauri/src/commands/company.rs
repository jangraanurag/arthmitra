use std::path::PathBuf;

use crate::core::models::*;
use crate::loader::{meta, mount, registry, scanner};

/// Discover companies from all configured scan directories.
/// Returns a list of all known companies (from registry + newly discovered).
#[tauri::command]
pub async fn discover_companies(_app: tauri::AppHandle) -> Result<Vec<CompanyInfo>, String> {
    // Get scan directories
    let scan_dirs = scanner::get_default_scan_dirs();

    // Scan for company.meta files
    let discovered = scanner::scan_directories(&scan_dirs);

    // Register newly discovered companies
    for (path, meta) in &discovered {
        let drive_type = if path.starts_with("/media") || path.starts_with("/mnt") {
            "usb"
        } else {
            "local"
        };

        #[cfg(target_os = "windows")]
        let drive_type = {
            let path_str = path.to_string_lossy();
            if path_str.starts_with("C:") {
                "local"
            } else if path_str.len() >= 2 && path_str.as_bytes()[1] == b':' {
                "external"
            } else {
                "local"
            }
        };

        registry::register_company(
            &meta.uuid,
            &meta.company_name,
            &path.to_string_lossy(),
            meta.gstin.as_deref(),
            drive_type,
        )?;
    }

    // Check availability of all registered companies
    let mut companies = registry::get_all_companies()?;
    for company in &mut companies {
        let path = PathBuf::from(&company.path);
        if !path.exists() {
            company.status = "disconnected".to_string();
            registry::update_company_status(&company.uuid, "disconnected").ok();
        } else if mount::is_mounted(&company.uuid) {
            company.status = "mounted".to_string();
        } else {
            company.status = "available".to_string();
        }
    }

    log::info!("Discovered {} companies", companies.len());
    Ok(companies)
}

/// Mount a company database (open it for operations)
#[tauri::command]
pub async fn mount_company(uuid: String) -> Result<CompanyInfo, String> {
    // Get company path from registry
    let companies = registry::get_all_companies()?;
    let company = companies
        .iter()
        .find(|c| c.uuid == uuid)
        .ok_or_else(|| format!("Company not found in registry: {}", uuid))?;

    let path = PathBuf::from(&company.path);
    if !path.exists() {
        return Err(format!(
            "Company directory not found: {}. Drive may have been disconnected.",
            company.path
        ));
    }

    mount::mount_company(&uuid, &path)?;

    let mut updated = company.clone();
    updated.status = "mounted".to_string();
    Ok(updated)
}

/// Unmount a company database (safely close it)
#[tauri::command]
pub async fn unmount_company(uuid: String) -> Result<(), String> {
    mount::unmount_company(&uuid)
}

/// Create a new company with folder structure and initial database
#[tauri::command]
pub async fn create_company(req: CreateCompanyRequest) -> Result<CompanyInfo, String> {
    let company_dir = PathBuf::from(&req.path);

    // Create directory structure
    std::fs::create_dir_all(&company_dir)
        .map_err(|e| format!("Cannot create company directory: {}", e))?;
    std::fs::create_dir_all(company_dir.join("attachments"))
        .map_err(|e| format!("Cannot create attachments directory: {}", e))?;
    std::fs::create_dir_all(company_dir.join("backups"))
        .map_err(|e| format!("Cannot create backups directory: {}", e))?;
    std::fs::create_dir_all(company_dir.join("ai_memory"))
        .map_err(|e| format!("Cannot create ai_memory directory: {}", e))?;

    // Generate UUID
    let uuid = uuid::Uuid::new_v4().to_string();

    // Create company.meta
    let company_meta = CompanyMeta {
        uuid: uuid.clone(),
        company_name: req.company_name.clone(),
        gstin: req.gstin.clone(),
        db_version: "1.0.0".to_string(),
        encryption_flag: false,
    };

    meta::write_meta(&company_dir.join("company.meta"), &company_meta)?;

    // Mount the company (this creates and initializes the DB)
    mount::mount_company(&uuid, &company_dir)?;

    // Create default financial year
    let conn = mount::get_company_conn(&uuid)?;

    // Parse start date for FY
    let fy_start = &req.financial_year_start;
    let fy_end = calculate_fy_end(fy_start)?;
    let fy_id = format!("FY_{}", &fy_start[..4]);

    conn.execute(
        "INSERT INTO financial_years (fy_id, start_date, end_date, is_active) VALUES (?1, ?2, ?3, 1)",
        rusqlite::params![fy_id, fy_start, fy_end],
    )
    .map_err(|e| format!("Cannot create financial year: {}", e))?;

    // Register in system registry
    registry::register_company(
        &uuid,
        &req.company_name,
        &req.path,
        req.gstin.as_deref(),
        "local",
    )?;

    log::info!("Created company: {} ({})", req.company_name, uuid);

    Ok(CompanyInfo {
        uuid,
        company_name: req.company_name,
        gstin: req.gstin,
        path: req.path,
        drive_type: "local".to_string(),
        last_opened: Some(chrono::Utc::now().to_rfc3339()),
        status: "mounted".to_string(),
    })
}

/// Validate company integrity
#[tauri::command]
pub async fn validate_company(uuid: String) -> Result<(bool, Vec<String>), String> {
    let conn = mount::get_company_conn(&uuid)?;
    crate::core::recovery::integrity_check(&conn)
        .map_err(|e| format!("Integrity check error: {}", e))
}

/// Calculate financial year end date from start date
/// Indian standard: April 1 to March 31
fn calculate_fy_end(start_date: &str) -> Result<String, String> {
    let parts: Vec<&str> = start_date.split('-').collect();
    if parts.len() != 3 {
        return Err("Invalid date format. Use YYYY-MM-DD".to_string());
    }
    let year: i32 = parts[0].parse().map_err(|_| "Invalid year".to_string())?;
    let month: u32 = parts[1].parse().map_err(|_| "Invalid month".to_string())?;

    // FY end is 12 months later minus 1 day
    let end_year = if month <= 3 { year } else { year + 1 };
    let end_month = if month == 1 { 12 } else { month - 1 };

    // Last day of end_month
    let last_day = match end_month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if end_year % 4 == 0 && (end_year % 100 != 0 || end_year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => return Err("Invalid month calculation".to_string()),
    };

    Ok(format!("{:04}-{:02}-{:02}", end_year, end_month, last_day))
}

/// Get full company profile (Registry Info + DB Details)
#[tauri::command]
pub async fn get_company_profile(uuid: String) -> Result<CompanyProfile, String> {
    // 1. Get basic info from Registry
    let companies = registry::get_all_companies()?;
    let info = companies
        .into_iter()
        .find(|c| c.uuid == uuid)
        .ok_or_else(|| "Company not found in registry".to_string())?;

    // 2. Get details from DB
    let conn = mount::get_company_conn(&uuid)?;
    let details = conn.query_row(
        "SELECT address, city, state, pincode, email, phone, pan, website FROM organization_details WHERE id = 1",
        [],
        |row| {
            Ok(OrganizationDetails {
                address: row.get(0)?,
                city: row.get(1)?,
                state: row.get(2)?,
                pincode: row.get(3)?,
                email: row.get(4)?,
                phone: row.get(5)?,
                pan: row.get(6)?,
                website: row.get(7)?,
            })
        },
    ).map_err(|e| format!("Failed to fetch organization details: {}", e))?;

    Ok(CompanyProfile { info, details })
}

/// Update company details
#[tauri::command]
pub async fn update_company(payload: UpdateCompanyRequest) -> Result<CompanyProfile, String> {
    let uuid = &payload.uuid;

    // 1. Update DB (Organization Details)
    let conn = mount::get_company_conn(uuid)?;
    conn.execute(
        "UPDATE organization_details SET address=?1, city=?2, state=?3, pincode=?4, email=?5, phone=?6, pan=?7, website=?8, updated_at=datetime('now') WHERE id=1",
        rusqlite::params![
            payload.details.address,
            payload.details.city,
            payload.details.state,
            payload.details.pincode,
            payload.details.email,
            payload.details.phone,
            payload.details.pan,
            payload.details.website
        ]
    ).map_err(|e| format!("Failed to update database: {}", e))?;

    // 2. Update company.meta (if Name/GSTIN changed)
    // We need to read the existing meta, update it, and write it back.
    // However, we don't have the path easily here without querying registry.
    let companies = registry::get_all_companies()?;
    let current_info = companies.iter().find(|c| c.uuid == payload.uuid).ok_or("Company not found")?;
    
    let company_dir = PathBuf::from(&current_info.path);
    let meta_path = company_dir.join("company.meta");
    
    let mut meta = meta::read_meta(&meta_path)?;
    meta.company_name = payload.company_name.clone();
    meta.gstin = payload.gstin.clone();
    
    meta::write_meta(&meta_path, &meta)?;

    // 3. Update Registry
    registry::register_company(
        uuid,
        &payload.company_name,
        &current_info.path,
        payload.gstin.as_deref(),
        &current_info.drive_type
    )?;

    // 4. Return updated profile
    get_company_profile(uuid.to_string()).await
}

/// Get all states
#[tauri::command]
pub async fn get_states(uuid: String) -> Result<Vec<State>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare("SELECT code, name, is_system FROM states ORDER BY name ASC")
        .map_err(|e| format!("Query error: {}", e))?;

    let states = stmt
        .query_map([], |row| {
            Ok(State {
                code: row.get(0)?,
                name: row.get(1)?,
                is_system: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(states)
}

/// Create a new state
#[tauri::command]
pub async fn create_state(uuid: String, code: String, name: String) -> Result<State, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Check if exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM states WHERE code = ?1)",
        rusqlite::params![&code],
        |row| row.get(0),
    ).unwrap_or(false);

    if exists {
        return Err(format!("State code {} already exists", code));
    }

    conn.execute(
        "INSERT INTO states (code, name, is_system) VALUES (?1, ?2, 0)",
        rusqlite::params![code, name],
    ).map_err(|e| format!("Failed to create state: {}", e))?;

    Ok(State {
        code,
        name,
        is_system: false,
    })
}

// ── Financial Years ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_financial_years(uuid: String) -> Result<Vec<FinancialYear>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare("SELECT fy_id, start_date, end_date, is_active, is_closed FROM financial_years ORDER BY start_date DESC")
        .map_err(|e| format!("Query error: {}", e))?;

    let years = stmt
        .query_map([], |row| {
            Ok(FinancialYear {
                fy_id: row.get(0)?,
                start_date: row.get(1)?,
                end_date: row.get(2)?,
                is_active: row.get(3)?,
                is_closed: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(years)
}

#[tauri::command]
pub async fn create_financial_year(uuid: String, start_date: String) -> Result<FinancialYear, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Calculate End Date
    let end_date = calculate_fy_end(&start_date)?;
    let fy_id = format!("FY_{}", &start_date[..4]); // Simple ID generation

    // Check if exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM financial_years WHERE fy_id = ?1)",
        rusqlite::params![&fy_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if exists {
        return Err(format!("Financial Year {} already exists", fy_id));
    }

    conn.execute(
        "INSERT INTO financial_years (fy_id, start_date, end_date, is_active, is_closed) VALUES (?1, ?2, ?3, 0, 0)",
        rusqlite::params![fy_id, start_date, end_date],
    ).map_err(|e| format!("Failed to create FY: {}", e))?;

    Ok(FinancialYear {
        fy_id,
        start_date,
        end_date,
        is_active: false,
        is_closed: false
    })
}

// ── Backups ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_backup(uuid: String) -> Result<String, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Get company path from registry to find backup folder
    let companies = registry::get_all_companies()?;
    let company = companies.iter().find(|c| c.uuid == uuid).ok_or("Company not found")?;
    
    let company_dir = PathBuf::from(&company.path);
    let backup_dir = company_dir.join("backups");
    
    if !backup_dir.exists() {
        std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let filename = format!("backup_{}.db", timestamp);
    let backup_path = backup_dir.join(&filename);

    // Use VACUUM INTO for consistent online backup
    conn.execute(
        &format!("VACUUM INTO '{}'", backup_path.to_string_lossy()),
        [],
    ).map_err(|e| format!("Backup failed: {}", e))?;

    Ok(backup_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn get_backups(uuid: String) -> Result<Vec<BackupInfo>, String> {
    let companies = registry::get_all_companies()?;
    let company = companies.iter().find(|c| c.uuid == uuid).ok_or("Company not found")?;
    
    let backup_dir = PathBuf::from(&company.path).join("backups");
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    let entries = std::fs::read_dir(backup_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("db") {
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let created: chrono::DateTime<chrono::Local> = metadata.created().unwrap_or(std::time::SystemTime::now()).into();
            
            backups.push(BackupInfo {
                filename: entry.file_name().to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                size: metadata.len(),
                created_at: created.format("%Y-%m-%d %H:%M:%S").to_string(),
            });
        }
    }

    // Sort by newest first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

#[tauri::command]
pub async fn restore_backup(uuid: String, backup_path: String) -> Result<(), String> {
    // 1. Unmount to close connection
    mount::unmount_company(&uuid)?;

    // 2. Locate paths
    let companies = registry::get_all_companies()?;
    let company = companies.iter().find(|c| c.uuid == uuid).ok_or("Company not found")?;
    
    let company_dir = PathBuf::from(&company.path);
    let db_path = company_dir.join("company.db");
    let source_path = PathBuf::from(&backup_path);

    if !source_path.exists() {
        // Try to recover by Remounting before erroring
        mount::mount_company(&uuid, &company_dir)?;
        return Err(format!("Backup file not found at: {}", backup_path));
    }

    // 3. Create a safety backup of current state before overwrite (just in case)
    let safety_path = company_dir.join("backups").join("pre_restore_safety.db");
    // Ensure backups dir exists for safety backup
    std::fs::create_dir_all(company_dir.join("backups")).ok();
    
    if db_path.exists() {
        std::fs::copy(&db_path, &safety_path).map_err(|e| e.to_string())?;
    }

    // 4. Copy backup to company.db
    std::fs::copy(&source_path, &db_path).map_err(|e| e.to_string())?;
    
    // 5. Remove WAL/SHM files to prevent corruption from mismatch
    let wal_path = company_dir.join("company.db-wal");
    let shm_path = company_dir.join("company.db-shm");
    if wal_path.exists() { std::fs::remove_file(wal_path).ok(); }
    if shm_path.exists() { std::fs::remove_file(shm_path).ok(); }

    // 6. Remount
    mount::mount_company(&uuid, &company_dir)?;

    Ok(())
}
