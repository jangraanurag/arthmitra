use crate::loader::mount;
use rusqlite::OptionalExtension;
use std::collections::HashMap;



/// Fetch all company settings as a Key-Value map
#[tauri::command]
pub fn get_company_settings(uuid: String) -> Result<HashMap<String, String>, String> {
    let conn = mount::get_company_conn(&uuid).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT key, value FROM company_settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut settings = HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            settings.insert(k, v);
        }
    }

    Ok(settings)
}

/// Update multiple settings at once
#[tauri::command]
pub fn update_company_settings(uuid: String, settings: HashMap<String, String>) -> Result<(), String> {
    let mut conn = mount::get_company_conn(&uuid).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // We prepare the statement once and execute it for each setting
    {
        let mut stmt = tx.prepare(
            "INSERT INTO company_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) 
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
        ).map_err(|e| e.to_string())?;

        for (key, value) in settings {
            stmt.execute([key, value]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Upload an image (Logo/Signature) as base64 string
/// We validate size roughly by string length (base64 size ~= 1.33 * original size)
#[tauri::command]
pub fn upload_image(uuid: String, key: String, base64_data: String) -> Result<(), String> {
    // 1. Validate key
    if !["logo_base64", "signature_base64"].contains(&key.as_str()) {
        return Err("Invalid image key. Only logo and signature are allowed.".to_string());
    }

    // 2. Validate size (Max 500KB for logo, 200KB for signature)
    let max_size = if key == "logo_base64" { 500 * 1024 } else { 200 * 1024 };
    // Base64 string length check (approx)
    if base64_data.len() > (max_size * 4 / 3) {
        return Err(format!("Image too large. Max size is {}KB", max_size / 1024));
    }

    // 3. Save to DB
    let conn = mount::get_company_conn(&uuid).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO company_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        [key, base64_data],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
