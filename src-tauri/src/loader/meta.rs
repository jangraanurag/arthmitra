use std::path::Path;

use crate::core::models::CompanyMeta;

/// Parse and validate a company.meta file (TOML format)
pub fn read_meta(path: &Path) -> Result<CompanyMeta, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Cannot read company.meta: {}", e))?;

    let meta: CompanyMeta =
        toml::from_str(&content).map_err(|e| format!("Invalid company.meta format: {}", e))?;

    validate_meta(&meta)?;
    Ok(meta)
}

/// Write a company.meta file
pub fn write_meta(path: &Path, meta: &CompanyMeta) -> Result<(), String> {
    let content =
        toml::to_string_pretty(meta).map_err(|e| format!("Cannot serialize meta: {}", e))?;

    std::fs::write(path, content).map_err(|e| format!("Cannot write company.meta: {}", e))?;

    Ok(())
}

/// Validate meta fields
fn validate_meta(meta: &CompanyMeta) -> Result<(), String> {
    if meta.uuid.is_empty() {
        return Err("company.meta: uuid is required".to_string());
    }
    if meta.company_name.is_empty() {
        return Err("company.meta: company_name is required".to_string());
    }
    if meta.db_version.is_empty() {
        return Err("company.meta: db_version is required".to_string());
    }

    // Validate GSTIN format if provided
    if let Some(ref gstin) = meta.gstin {
        if !gstin.is_empty() && !crate::security::gstin::validate_gstin(gstin) {
            return Err(format!("company.meta: invalid GSTIN format: {}", gstin));
        }
    }

    Ok(())
}
