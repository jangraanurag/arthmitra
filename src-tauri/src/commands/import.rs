use crate::core::engine;
use crate::core::models::{CreateAccountRequest, CreateItemRequest};
use crate::loader::mount;
use calamine::{open_workbook, Data, Reader, Xlsx, XlsxError};
use csv::ReaderBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    success_count: usize,
    error_count: usize,
    errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPreview {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

fn data_to_string(data: &Data) -> String {
    match data {
        Data::String(s) => s.clone(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(f) => f.to_string(), // Simplified
        Data::Error(e) => format!("{:?}", e),
        Data::Empty => "".to_string(),
        Data::DateTimeIso(d) => d.to_string(), 
        Data::DurationIso(d) => d.to_string(),
    }
}

#[tauri::command]
pub async fn read_import_file(file_path: String) -> Result<ImportPreview, String> {
    let path = Path::new(&file_path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "csv" => read_csv(&file_path),
        "xlsx" | "xls" => read_excel(&file_path),
        _ => Err("Unsupported file format".to_string()),
    }
}

fn read_csv(path: &str) -> Result<ImportPreview, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = ReaderBuilder::new().from_reader(file);
    
    let headers = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows = Vec::new();
    for (i, result) in rdr.records().enumerate() {
        if i >= 5 { break; } // Preview only first 5 rows
        let record = result.map_err(|e| e.to_string())?;
        rows.push(record.iter().map(|s| s.to_string()).collect());
    }

    Ok(ImportPreview { headers, rows })
}

fn read_excel(path: &str) -> Result<ImportPreview, String> {
    let mut workbook: Xlsx<std::io::BufReader<std::fs::File>> = open_workbook(path).map_err(|e: XlsxError| e.to_string())?;
    let range = workbook
        .worksheet_range_at(0)
        .ok_or("No worksheets found")?
        .map_err(|e| e.to_string())?;

    let mut rows_iter = range.rows();
    
    let headers = rows_iter
        .next()
        .ok_or("Empty file")?
        .iter()
        .map(|c| data_to_string(c))
        .collect();

    let mut rows = Vec::new();
    for (i, row) in rows_iter.enumerate() {
        if i >= 5 { break; }
        rows.push(row.iter().map(|c| data_to_string(c)).collect());
    }

    Ok(ImportPreview { headers, rows })
}

#[tauri::command]
pub async fn import_ledgers(
    uuid: String,
    file_path: String,
    mapping: HashMap<String, String>,
) -> Result<ImportResult, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let path = Path::new(&file_path);
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let mut success_count = 0;
    let mut error_count = 0;
    let mut errors = Vec::new();

    let rows: Vec<HashMap<String, String>> = match extension.as_str() {
        "csv" => parse_csv_full(&file_path, &mapping)?,
        "xlsx" | "xls" => parse_excel_full(&file_path, &mapping)?,
        _ => return Err("Unsupported file format".to_string()),
    };

    for (i, row) in rows.iter().enumerate() {
        let name = row.get("name").cloned().unwrap_or_default();
        if name.is_empty() {
            error_count += 1;
            errors.push(format!("Row {}: Name is required", i + 1));
            continue;
        }

        let default_type = "Sundry Debtors".to_string();
        let account_type = row.get("account_type").unwrap_or(&default_type).clone();

        let req = CreateAccountRequest {
            name,
            account_type,
            parent_account: None,
            group_code: None, // Added missing field
            gstin: row.get("gstin").cloned(),
            state: row.get("state").cloned(),
            address: row.get("address").cloned(),
            email: row.get("email").cloned(),
            phone: row.get("phone").cloned(),
            // description: None, // Removed
            // opening_balance: ... // Removed, to be handled via Journal Entry if needed
        };

        match engine::create_account(&conn, &req) {
            Ok(_) => success_count += 1,
            Err(e) => {
                error_count += 1;
                errors.push(format!("Row {}: {}", i + 1, e));
            }
        }
    }

    Ok(ImportResult {
        success_count,
        error_count,
        errors,
    })
}

#[tauri::command]
pub async fn import_items(
    uuid: String,
    file_path: String,
    mapping: HashMap<String, String>,
) -> Result<ImportResult, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Fetch all units to map symbol -> unit_id
    let mut unit_map: HashMap<String, String> = HashMap::new();
    let mut default_unit_id: Option<String> = None;
    
    // New scope for borrowing conn
    {
        let mut stmt = conn.prepare("SELECT unit_id, symbol FROM inventory_units").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
             Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;

        for r in rows {
            if let Ok((id, symbol)) = r {
                if default_unit_id.is_none() {
                    default_unit_id = Some(id.clone());
                }
                unit_map.insert(symbol.to_lowercase(), id);
            }
        }
    }

    if default_unit_id.is_none() {
        return Err("No units found involved in the system. Please create at least one unit first.".to_string());
    }

    let rows: Vec<HashMap<String, String>> = match Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "csv" => parse_csv_full(&file_path, &mapping)?,
        "xlsx" | "xls" => parse_excel_full(&file_path, &mapping)?,
        _ => return Err("Unsupported file format".to_string()),
    };
    
    let mut success_count = 0;
    let mut error_count = 0;
    let mut errors = Vec::new();

    for (i, row) in rows.iter().enumerate() {
        let name = row.get("name").cloned().unwrap_or_default();
        if name.is_empty() {
             error_count += 1;
             errors.push(format!("Row {}: Name is required", i + 1));
             continue;
        }
        
        // Resolve unit
        let unit_val = row.get("unit").cloned().unwrap_or_default().to_lowercase();
        let unit_id = unit_map.get(&unit_val).cloned().unwrap_or_else(|| default_unit_id.clone().unwrap());

        let req = CreateItemRequest {
            name,
            sku: row.get("sku").cloned(),
            hsn_code: row.get("hsn_code").cloned(),
            unit_id,
            tax_rate: row.get("tax_rate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
            description: row.get("description").cloned(),
            opening_qty: row.get("opening_qty").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
            opening_value: row.get("opening_value").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
        };

        match engine::create_item(&conn, &req) {
             Ok(_) => success_count += 1,
             Err(e) => {
                 error_count += 1;
                 errors.push(format!("Row {}: {}", i + 1, e));
             }
        }
    }

    Ok(ImportResult {
        success_count,
        error_count,
        errors,
    })
}


fn parse_csv_full(path: &str, mapping: &HashMap<String, String>) -> Result<Vec<HashMap<String, String>>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = ReaderBuilder::new().from_reader(file);
    let headers: Vec<String> = rdr.headers().map_err(|e| e.to_string())?.iter().map(|s| s.to_string()).collect();
    
    let mut mapped_rows = Vec::new();
    
    for result in rdr.records() {
        let record = result.map_err(|e| e.to_string())?;
        let mut row_map = HashMap::new();
        
        for (i, cell) in record.iter().enumerate() {
            if i < headers.len() {
                let header = &headers[i];
                if let Some(field) = mapping.get(header) {
                    row_map.insert(field.clone(), cell.to_string());
                }
            }
        }
        mapped_rows.push(row_map);
    }
    
    Ok(mapped_rows)
}

fn parse_excel_full(path: &str, mapping: &HashMap<String, String>) -> Result<Vec<HashMap<String, String>>, String> {
    let mut workbook: Xlsx<std::io::BufReader<std::fs::File>> = open_workbook(path).map_err(|e: XlsxError| e.to_string())?;
    let range = workbook.worksheet_range_at(0).ok_or("No worksheets")?.map_err(|e| e.to_string())?;
    let mut rows_iter = range.rows();
    
    let headers: Vec<String> = rows_iter.next().ok_or("Empty file")?.iter().map(|c| data_to_string(c)).collect();
    
    let mut mapped_rows = Vec::new();
    
    for row in rows_iter {
        let mut row_map = HashMap::new();
        for (i, cell) in row.iter().enumerate() {
            if i < headers.len() {
                let header = &headers[i];
                if let Some(field) = mapping.get(header) {
                    row_map.insert(field.clone(), data_to_string(cell));
                }
            }
        }
        mapped_rows.push(row_map);
    }
    
    Ok(mapped_rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::Path;

    #[test]
    fn test_csv_parsing() {
        let mapping = HashMap::from([
            ("Name".to_string(), "name".to_string()),
            ("GSTIN".to_string(), "gstin".to_string()),
            ("Opening Balance".to_string(), "opening_balance".to_string()),
        ]);
        
        // Path to the sample file created earlier
        let path = "/home/anurag/sites/arthmitra/sample_ledgers.csv";
        
        // If file doesn't exist (e.g. CI), skip or fail.
        if !Path::new(path).exists() {
            eprintln!("Test file not found at {}", path);
            return;
        }

        let rows = parse_csv_full(path, &mapping).expect("Failed to parse CSV");
        
        assert_eq!(rows.len(), 3);
        // Alpha Traders
        assert_eq!(rows[0].get("name").unwrap(), "Alpha Traders");
        assert_eq!(rows[0].get("gstin").unwrap(), "27ABCDE1234F1Z5");
        assert_eq!(rows[0].get("opening_balance").unwrap(), "50000");
    }
}
