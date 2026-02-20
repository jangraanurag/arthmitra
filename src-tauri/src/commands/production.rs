use crate::core::models::{
    BOMComponent, BOMHeader, CreateBOMRequest, CreateProductionOrderRequest, ProductionOrder,
};
use crate::loader::mount;
use rusqlite::{params, Result};
use uuid::Uuid;

// ── BOM Management ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_bom(
    uuid: String,
    request: CreateBOMRequest,
) -> Result<BOMHeader, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let bom_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO bom_headers (bom_id, item_id, name, output_quantity) VALUES (?1, ?2, ?3, ?4)",
        params![bom_id, request.item_id, request.name, request.output_quantity],
    )
    .map_err(|e| e.to_string())?;

    for component in request.components {
        let comp_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO bom_components (component_id, bom_id, item_id, quantity) VALUES (?1, ?2, ?3, ?4)",
            params![comp_id, bom_id, component.item_id, component.quantity],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(BOMHeader {
        bom_id,
        item_id: request.item_id,
        name: request.name,
        output_quantity: request.output_quantity,
        created_at: chrono::Local::now().to_string(),
        finished_good_name: None, // Frontend can fetch or we can return if needed
    })
}

#[tauri::command]
pub async fn get_boms(uuid: String) -> Result<Vec<BOMHeader>, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT h.bom_id, h.item_id, h.name, h.output_quantity, h.created_at, i.name as item_name
            FROM bom_headers h
            JOIN inventory_items i ON h.item_id = i.item_id
            ORDER BY h.name
            "#,
        )
        .map_err(|e| e.to_string())?;

    let boms = stmt
        .query_map([], |row| {
            Ok(BOMHeader {
                bom_id: row.get(0)?,
                item_id: row.get(1)?,
                name: row.get(2)?,
                output_quantity: row.get(3)?,
                created_at: row.get(4)?,
                finished_good_name: Some(row.get(5)?),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(boms)
}

#[tauri::command]
pub async fn get_bom_details(
    uuid: String,
    bom_id: String,
) -> Result<(BOMHeader, Vec<BOMComponent>), String> {
    let conn = mount::get_company_conn(&uuid)?;

    let header = conn
        .query_row(
            r#"
            SELECT h.bom_id, h.item_id, h.name, h.output_quantity, h.created_at, i.name
            FROM bom_headers h
            JOIN inventory_items i ON h.item_id = i.item_id
            WHERE h.bom_id = ?1
            "#,
            params![bom_id],
            |row| {
                Ok(BOMHeader {
                    bom_id: row.get(0)?,
                    item_id: row.get(1)?,
                    name: row.get(2)?,
                    output_quantity: row.get(3)?,
                    created_at: row.get(4)?,
                    finished_good_name: Some(row.get(5)?),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT c.component_id, c.bom_id, c.item_id, c.quantity, i.name, u.symbol
            FROM bom_components c
            JOIN inventory_items i ON c.item_id = i.item_id
            JOIN inventory_units u ON i.unit_id = u.unit_id
            WHERE c.bom_id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let components = stmt
        .query_map(params![bom_id], |row| {
            Ok(BOMComponent {
                component_id: row.get(0)?,
                bom_id: row.get(1)?,
                item_id: row.get(2)?,
                quantity: row.get(3)?,
                item_name: Some(row.get(4)?),
                unit_symbol: Some(row.get(5)?),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok((header, components))
}

#[tauri::command]
pub async fn delete_bom(
    uuid: String,
    bom_id: String,
) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;

    conn.execute("DELETE FROM bom_components WHERE bom_id = ?1", params![bom_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bom_headers WHERE bom_id = ?1", params![bom_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Production ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_production_order(
    uuid: String,
    request: CreateProductionOrderRequest,
) -> Result<String, String> {
    let mut conn = mount::get_company_conn(&uuid)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Fetch BOM details
    let (header, components) = {
        // ... Reusing logic from get_bom_details manually since we have a transaction ...
        // Simplification: We fetch header and components inside transaction
        let h = tx.query_row(
            "SELECT item_id, output_quantity FROM bom_headers WHERE bom_id = ?1",
            params![request.bom_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        ).map_err(|e| e.to_string())?;
        
        // Fetch components
        let mut stmt = tx.prepare("SELECT item_id, quantity FROM bom_components WHERE bom_id = ?1").map_err(|e| e.to_string())?;
        let comps = stmt.query_map(params![request.bom_id], |row| {
             Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        }).map_err(|e| e.to_string())?
          .collect::<Result<Vec<(String, f64)>, _>>()
          .map_err(|e| e.to_string())?;
          
        (h, comps)
    };

    let finished_good_id = header.0;
    let base_output_qty = header.1;
    let production_qty = request.quantity;
    
    // Scale factor: If BOM makes 1KG and we make 10KG, we need 10x components
    let scale_factor = production_qty / base_output_qty;

    // 2. Create Journal Entry (Manufacturing)
    let entry_id = Uuid::new_v4().to_string();
    let voucher_number = crate::core::engine::generate_next_voucher_number(&tx, "production")
        .map_err(|e| e.to_string())?;

    tx.execute(
        r#"
        INSERT INTO journal_entries (entry_id, date, voucher_number, narration, source, voucher_type, approval_status, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
        "#,
        params![
            entry_id,
            request.date,
            voucher_number,
            format!("Production of QM: {}", production_qty),
            "manufacturing",
            "journal", 
            "approved" // Auto-approved
        ],
    ).map_err(|e| e.to_string())?;

    // 3. Inventory Impact (Consumption)
    // We assume Rate = Weighted Average Cost.
    // Ideally we fetch current rate. For MVP, we take 0 or Last Purchase Price.
    // Let's assume we don't track Cost for now, just quantity. Value = 0.
    
    // In strict accounting, we need:
    // Credit Raw Materials (Asset)
    // Debit Finished Goods (Asset)
    
    // Calculate Total Cost
    let mut total_cost = 0.0;
    
    for (comp_item_id, comp_qty) in components {
        let consumed_qty = comp_qty * scale_factor;
        
        // Fetch current rate (WAC) ? Simple hack: 0 for now
        let rate = 0.0; 
        let amount = consumed_qty * rate;
        total_cost += amount;

        tx.execute(
            r#"
            INSERT INTO inventory_entries (entry_id, item_id, txn_type, quantity, rate, amount)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![entry_id, comp_item_id, "out", consumed_qty, rate, amount],
        ).map_err(|e| e.to_string())?;
    }

    // 4. Inventory Impact (Production)
    tx.execute(
        r#"
        INSERT INTO inventory_entries (entry_id, item_id, txn_type, quantity, rate, amount)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![entry_id, finished_good_id, "in", production_qty, 0.0, total_cost], // Rate = Total Cost / Qty
    ).map_err(|e| e.to_string())?;

    // 5. Create Production Order Record
    let order_id = Uuid::new_v4().to_string();
    tx.execute(
        r#"
        INSERT INTO production_orders (order_id, date, bom_id, quantity, status, entry_id)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![order_id, request.date, request.bom_id, production_qty, "completed", entry_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(order_id)
}

#[tauri::command]
pub async fn get_production_orders(
    uuid: String,
) -> Result<Vec<ProductionOrder>, String> {
     let conn = mount::get_company_conn(&uuid)?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT p.order_id, p.date, p.bom_id, p.quantity, p.status, p.entry_id, p.created_at, h.name, je.voucher_number
            FROM production_orders p
            JOIN bom_headers h ON p.bom_id = h.bom_id
            LEFT JOIN journal_entries je ON p.entry_id = je.entry_id
            ORDER BY p.date DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let orders = stmt
        .query_map([], |row| {
            Ok(ProductionOrder {
                order_id: row.get(0)?,
                date: row.get(1)?,
                bom_id: row.get(2)?,
                quantity: row.get(3)?,
                status: row.get(4)?,
                entry_id: row.get(5)?,
                created_at: row.get(6)?,
                bom_name: Some(row.get(7)?),
                voucher_number: row.get(8).ok(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(orders)
}
