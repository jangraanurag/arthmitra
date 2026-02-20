use std::path::{Path, PathBuf};

use super::meta;
use crate::core::models::CompanyMeta;

/// Scan a list of directories for company folders (containing company.meta).
pub fn scan_directories(dirs: &[PathBuf]) -> Vec<(PathBuf, CompanyMeta)> {
    let mut results = Vec::new();

    for dir in dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }
        scan_recursive(dir, &mut results, 3); // Max depth 3
    }

    results
}

/// Recursively scan for company.meta files up to max_depth
fn scan_recursive(dir: &Path, results: &mut Vec<(PathBuf, CompanyMeta)>, max_depth: usize) {
    if max_depth == 0 {
        return;
    }

    let meta_path = dir.join("company.meta");
    if meta_path.exists() {
        match meta::read_meta(&meta_path) {
            Ok(m) => {
                log::info!("Discovered company: {} at {:?}", m.company_name, dir);
                results.push((dir.to_path_buf(), m));
            }
            Err(e) => {
                log::warn!("Invalid company.meta at {:?}: {}", meta_path, e);
            }
        }
        return; // Don't scan deeper inside a company folder
    }

    // Scan subdirectories
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip hidden dirs and known non-company dirs
                let name = path.file_name().unwrap_or_default().to_str().unwrap_or("");
                if !name.starts_with('.') && name != "node_modules" && name != "target" {
                    scan_recursive(&path, results, max_depth - 1);
                }
            }
        }
    }
}

/// Get default scan directories based on OS
pub fn get_default_scan_dirs() -> Vec<PathBuf> {
    let mut scan_dirs = Vec::new();

    // Home directory
    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        let home = PathBuf::from(home);
        scan_dirs.push(home.join("ArthMitra"));
        scan_dirs.push(home.join("Companies"));
        scan_dirs.push(home.clone());

        // Documents directory
        let docs = home.join("Documents");
        if docs.exists() {
            scan_dirs.push(docs.join("ArthMitra"));
            scan_dirs.push(docs);
        }
    }

    // On Linux, check /media and /mnt for USB drives
    #[cfg(target_os = "linux")]
    {
        scan_dirs.push(PathBuf::from("/media"));
        scan_dirs.push(PathBuf::from("/mnt"));
    }

    // On Windows, check common drive letters
    #[cfg(target_os = "windows")]
    {
        for letter in b'D'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() {
                scan_dirs.push(path);
            }
        }
    }

    scan_dirs
}
