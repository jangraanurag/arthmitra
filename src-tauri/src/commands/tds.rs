use crate::core::models::{
    CreateTdsDeductionRequest, TdsDeduction, TdsLiabilitySummary, TdsSection,
};
use crate::loader::mount;
use rusqlite::params;
use uuid::Uuid;

/// List all TDS sections (master data)
#[tauri::command]
pub async fn get_tds_sections(uuid: String) -> Result<Vec<TdsSection>, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let mut stmt = conn
        .prepare(
            "SELECT section_code, description, threshold_single, threshold_annual, \
             rate_individual, rate_company, is_system FROM tds_sections ORDER BY section_code",
        )
        .map_err(|e| e.to_string())?;

    let sections = stmt
        .query_map([], |row| {
            Ok(TdsSection {
                section_code: row.get(0)?,
                description: row.get(1)?,
                threshold_single: row.get(2)?,
                threshold_annual: row.get(3)?,
                rate_individual: row.get(4)?,
                rate_company: row.get(5)?,
                is_system: row.get::<_, i32>(6)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(sections)
}

/// List TDS deductions with optional filters
#[tauri::command]
pub async fn get_tds_deductions(
    uuid: String,
    from_date: Option<String>,
    to_date: Option<String>,
    status: Option<String>,
) -> Result<Vec<TdsDeduction>, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let mut query = String::from(
        "SELECT deduction_id, entry_id, section_code, party_account_id, party_name, \
         payment_amount, tds_rate, tds_amount, pan, deposit_status, challan_no, \
         deposit_date, period_month, period_year, created_at \
         FROM tds_deductions WHERE 1=1",
    );

    let mut conditions: Vec<String> = vec![];
    if let Some(ref s) = status {
        if !s.is_empty() {
            conditions.push(format!("deposit_status = '{}'", s.replace('\'', "''")));
        }
    }
    if let Some(ref fd) = from_date {
        conditions.push(format!("created_at >= '{}'", fd));
    }
    if let Some(ref td) = to_date {
        conditions.push(format!("created_at <= '{} 23:59:59'", td));
    }

    for c in &conditions {
        query.push_str(" AND ");
        query.push_str(c);
    }
    query.push_str(" ORDER BY created_at DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let deductions = stmt
        .query_map([], |row| {
            Ok(TdsDeduction {
                deduction_id: row.get(0)?,
                entry_id: row.get(1)?,
                section_code: row.get(2)?,
                party_account_id: row.get(3)?,
                party_name: row.get(4)?,
                payment_amount: row.get(5)?,
                tds_rate: row.get(6)?,
                tds_amount: row.get(7)?,
                pan: row.get(8)?,
                deposit_status: row.get(9)?,
                challan_no: row.get(10)?,
                deposit_date: row.get(11)?,
                period_month: row.get(12)?,
                period_year: row.get(13)?,
                created_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(deductions)
}

/// Record a new TDS deduction
#[tauri::command]
pub async fn create_tds_deduction(
    uuid: String,
    req: CreateTdsDeductionRequest,
) -> Result<TdsDeduction, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let deduction_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tds_deductions \
         (deduction_id, entry_id, section_code, party_account_id, party_name, \
          payment_amount, tds_rate, tds_amount, pan, period_month, period_year) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            deduction_id,
            req.entry_id,
            req.section_code,
            req.party_account_id,
            req.party_name,
            req.payment_amount,
            req.tds_rate,
            req.tds_amount,
            req.pan,
            req.period_month,
            req.period_year,
        ],
    )
    .map_err(|e| e.to_string())?;

    let ded = conn
        .query_row(
            "SELECT deduction_id, entry_id, section_code, party_account_id, party_name, \
             payment_amount, tds_rate, tds_amount, pan, deposit_status, challan_no, \
             deposit_date, period_month, period_year, created_at \
             FROM tds_deductions WHERE deduction_id = ?1",
            params![deduction_id],
            |row| {
                Ok(TdsDeduction {
                    deduction_id: row.get(0)?,
                    entry_id: row.get(1)?,
                    section_code: row.get(2)?,
                    party_account_id: row.get(3)?,
                    party_name: row.get(4)?,
                    payment_amount: row.get(5)?,
                    tds_rate: row.get(6)?,
                    tds_amount: row.get(7)?,
                    pan: row.get(8)?,
                    deposit_status: row.get(9)?,
                    challan_no: row.get(10)?,
                    deposit_date: row.get(11)?,
                    period_month: row.get(12)?,
                    period_year: row.get(13)?,
                    created_at: row.get(14)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(ded)
}

/// Mark a TDS deduction as deposited (with challan details)
#[tauri::command]
pub async fn mark_tds_deposited(
    uuid: String,
    deduction_id: String,
    challan_no: String,
    deposit_date: String,
) -> Result<(), String> {
    let conn = mount::get_company_conn(&uuid)?;

    let rows = conn
        .execute(
            "UPDATE tds_deductions \
             SET deposit_status = 'deposited', challan_no = ?1, deposit_date = ?2 \
             WHERE deduction_id = ?3 AND deposit_status = 'pending'",
            params![challan_no, deposit_date, deduction_id],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err("Deduction not found or already deposited".to_string());
    }

    Ok(())
}

/// TDS liability summary grouped by section
#[tauri::command]
pub async fn get_tds_liability_report(
    uuid: String,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<TdsLiabilitySummary>, String> {
    let conn = mount::get_company_conn(&uuid)?;

    let mut where_clause = String::from("WHERE 1=1");
    if let Some(ref fd) = from_date {
        where_clause.push_str(&format!(" AND d.created_at >= '{}'", fd));
    }
    if let Some(ref td) = to_date {
        where_clause.push_str(&format!(" AND d.created_at <= '{} 23:59:59'", td));
    }

    let query = format!(
        "SELECT s.section_code, s.description, \
         COALESCE(SUM(d.payment_amount), 0) as total_payment, \
         COALESCE(SUM(d.tds_amount), 0) as total_tds, \
         COALESCE(SUM(CASE WHEN d.deposit_status = 'deposited' THEN d.tds_amount ELSE 0 END), 0) as total_deposited, \
         COALESCE(SUM(CASE WHEN d.deposit_status = 'pending'   THEN d.tds_amount ELSE 0 END), 0) as total_pending, \
         COUNT(d.deduction_id) as deductions_count \
         FROM tds_sections s \
         LEFT JOIN tds_deductions d ON s.section_code = d.section_code {where_clause} \
         GROUP BY s.section_code, s.description \
         HAVING total_tds > 0 \
         ORDER BY total_pending DESC"
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TdsLiabilitySummary {
                section_code: row.get(0)?,
                description: row.get(1)?,
                total_payment: row.get(2)?,
                total_tds: row.get(3)?,
                total_deposited: row.get(4)?,
                total_pending: row.get(5)?,
                deductions_count: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}
