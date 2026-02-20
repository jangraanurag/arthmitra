use crate::core::models::*;
use crate::loader::mount;
use uuid::Uuid;

// ── Units ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_units(uuid: String) -> Result<Vec<InventoryUnit>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare("SELECT unit_id, name, symbol, decimal_places, is_system FROM inventory_units ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let units = stmt
        .query_map([], |row| {
            Ok(InventoryUnit {
                unit_id: row.get(0)?,
                name: row.get(1)?,
                symbol: row.get(2)?,
                decimal_places: row.get(3)?,
                is_system: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(units)
}

#[tauri::command]
pub async fn create_unit(uuid: String, req: CreateUnitRequest) -> Result<InventoryUnit, String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Check for duplicates (symbol)
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM inventory_units WHERE symbol = ?1)",
        rusqlite::params![&req.symbol],
        |row| row.get(0),
    ).unwrap_or(false);

    if exists {
        return Err(format!("Unit with symbol '{}' already exists", req.symbol));
    }

    let unit_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO inventory_units (unit_id, name, symbol, decimal_places, is_system) VALUES (?1, ?2, ?3, ?4, 0)",
        rusqlite::params![unit_id, req.name, req.symbol, req.decimal_places],
    ).map_err(|e| format!("Failed to create unit: {}", e))?;

    Ok(InventoryUnit {
        unit_id,
        name: req.name,
        symbol: req.symbol,
        decimal_places: req.decimal_places,
        is_system: false,
    })
}

#[tauri::command]
pub async fn delete_unit(uuid: String, unit_id: String) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Check if used in items
    let used: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM inventory_items WHERE unit_id = ?1)",
        rusqlite::params![&unit_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if used {
        return Err("Cannot delete unit: It is used by one or more items.".to_string());
    }

    conn.execute(
        "DELETE FROM inventory_units WHERE unit_id = ?1 AND is_system = 0",
        rusqlite::params![unit_id],
    ).map_err(|e| format!("Failed to delete unit: {}", e))?;

    Ok(())
}

// ── Items ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_items(uuid: String) -> Result<Vec<InventoryItem>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare(r#"
            SELECT i.item_id, i.name, i.sku, i.hsn_code, i.unit_id, i.tax_rate, i.description, 
                   i.opening_qty, i.opening_value, i.created_at, u.symbol
            FROM inventory_items i
            LEFT JOIN inventory_units u ON i.unit_id = u.unit_id
            ORDER BY i.name ASC
        "#)
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(InventoryItem {
                item_id: row.get(0)?,
                name: row.get(1)?,
                sku: row.get(2)?,
                hsn_code: row.get(3)?,
                unit_id: row.get(4)?,
                tax_rate: row.get(5)?,
                description: row.get(6)?,
                opening_qty: row.get(7)?,
                opening_value: row.get(8)?,
                created_at: row.get(9)?,
                unit_symbol: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn create_item(uuid: String, req: CreateItemRequest) -> Result<InventoryItem, String> {
    let conn = mount::get_company_conn(&uuid)?;
    crate::core::engine::create_item(&conn, &req).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_item(uuid: String, req: UpdateItemRequest) -> Result<InventoryItem, String> {
    let conn = mount::get_company_conn(&uuid)?;

    conn.execute(
        r#"UPDATE inventory_items 
        SET name=?1, sku=?2, hsn_code=?3, unit_id=?4, tax_rate=?5, description=?6 
        WHERE item_id=?7"#,
        rusqlite::params![
            req.name, req.sku, req.hsn_code, req.unit_id, 
            req.tax_rate, req.description, req.item_id
        ],
    ).map_err(|e| format!("Failed to update item: {}", e))?;

    // Fetch updated to return full object
    // Fetch updated to return full object
    let item = conn.query_row(
        r#"SELECT i.item_id, i.name, i.sku, i.hsn_code, i.unit_id, i.tax_rate, i.description, i.opening_qty, i.opening_value, i.created_at, u.symbol 
        FROM inventory_items i
        LEFT JOIN inventory_units u ON i.unit_id = u.unit_id
        WHERE i.item_id = ?1"#,
        rusqlite::params![req.item_id],
        |row| {
             Ok(InventoryItem {
                item_id: row.get(0)?,
                name: row.get(1)?,
                sku: row.get(2)?,
                hsn_code: row.get(3)?,
                unit_id: row.get(4)?,
                tax_rate: row.get(5)?,
                description: row.get(6)?,
                opening_qty: row.get(7)?,
                opening_value: row.get(8)?,
                created_at: row.get(9)?,
                unit_symbol: row.get(10)?,
            })
        }
    ).map_err(|e| e.to_string())?;

    Ok(item)
}

#[tauri::command]
pub async fn delete_item(uuid: String, item_id: String) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;
    
    // Check for transactions (Implementation pending in Phase 8)
    // For now, allow delete if just created
    
    conn.execute(
        "DELETE FROM inventory_items WHERE item_id = ?1",
        rusqlite::params![item_id],
    ).map_err(|e| format!("Failed to delete item: {}", e))?;

    Ok(())
}

// ── Reporting ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_stock_summary(uuid: String) -> Result<Vec<StockSummaryItem>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare(r#"
            SELECT 
                i.item_id, i.name, i.sku, u.symbol, 
                i.opening_qty, i.opening_value,
                COALESCE(SUM(CASE WHEN ie.txn_type = 'in' THEN ie.quantity ELSE -ie.quantity END), 0) as net_qty,
                COALESCE(SUM(CASE WHEN ie.txn_type = 'in' THEN ie.amount ELSE -ie.amount END), 0) as net_value
            FROM inventory_items i
            JOIN inventory_units u ON i.unit_id = u.unit_id
            LEFT JOIN inventory_entries ie ON i.item_id = ie.item_id
            GROUP BY i.item_id
            ORDER BY i.name ASC
        "#)
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            let opening_qty: f64 = row.get(4)?;
            let opening_val: f64 = row.get(5)?;
            let net_qty: f64 = row.get(6)?;
            let net_val: f64 = row.get(7)?;

            Ok(StockSummaryItem {
                item_id: row.get(0)?,
                name: row.get(1)?,
                sku: row.get(2)?,
                unit_symbol: row.get(3)?,
                closing_qty: opening_qty + net_qty,
                closing_value: opening_val + net_val,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn get_item_ledger(uuid: String, item_id: String) -> Result<Vec<ItemLedgerEntry>, String> {
    let conn = mount::get_company_conn(&uuid)?;

    // 1. Get Opening Balance
    let opening: (f64, f64) = conn.query_row(
        "SELECT opening_qty, opening_value FROM inventory_items WHERE item_id = ?1",
        rusqlite::params![item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("Item not found: {}", e))?;

    let mut running_qty = opening.0;

    // 2. Fetch Transactions
    let mut stmt = conn
        .prepare(r#"
            SELECT 
                je.entry_id, je.date, je.voucher_number, je.voucher_type,
                ie.txn_type, ie.quantity, ie.rate, ie.amount
            FROM inventory_entries ie
            JOIN journal_entries je ON ie.entry_id = je.entry_id
            WHERE ie.item_id = ?1
            ORDER BY je.date ASC, je.created_at ASC
        "#)
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();

    // Add Opening Balance as a fake entry? 
    // Usually ledger UI shows "Opening Balance" as first row.
    // For now, let's just return transactions and let UI handle Opening,
    // OR we return a special entry for Opening.
    // Let's stick to returning transactions, but we need to calculate running balance correctly.
    // Actually, providing an "Opening Balance" row simplifies frontend.
    
    entries.push(ItemLedgerEntry {
        entry_id: "opening".to_string(),
        date: "".to_string(), // Or start of FY
        voucher_number: None,
        voucher_type: "Opening Balance".to_string(),
        txn_type: "in".to_string(), // treated as 'in' for logic, or special display
        quantity: opening.0,
        rate: if opening.0 != 0.0 { opening.1 / opening.0 } else { 0.0 },
        amount: opening.1,
        running_qty: opening.0,
    });

    let txns = stmt
        .query_map(rusqlite::params![item_id], |row| {
             let txn_type: String = row.get(4)?;
             let qty: f64 = row.get(5)?;
             let rate: f64 = row.get(6)?;
             let amount: f64 = row.get(7)?;

             Ok((
                row.get::<_, String>(0)?, // entry_id
                row.get::<_, String>(1)?, // date
                row.get::<_, Option<String>>(2)?, // voucher_number
                row.get::<_, String>(3)?, // voucher_type
                txn_type,
                qty,
                rate,
                amount
             ))
        })
        .map_err(|e| e.to_string())?;

    for txn in txns {
        if let Ok((entry_id, date, v_no, v_type, t_type, qty, rate, amt)) = txn {
            if t_type == "in" {
                running_qty += qty;
            } else {
                running_qty -= qty;
            }

            entries.push(ItemLedgerEntry {
                entry_id,
                date,
                voucher_number: v_no,
                voucher_type: v_type,
                txn_type: t_type,
                quantity: qty,
                rate,
                amount: amt,
                running_qty,
            });
        }
    }

    Ok(entries)
}
