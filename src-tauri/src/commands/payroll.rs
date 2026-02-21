use crate::core::models::{
    CreateEmployeeRequest, Employee, PayrollEntry, PayrollRun, SaveSalaryStructureRequest,
    SalaryStructure,
};
use crate::core::engine;
use crate::core::models::CreateEntryRequest;
use crate::loader::mount;
use rusqlite::params;
use uuid::Uuid;

// ─── Statutory rates (hard-coded per Indian law, tunable later via settings) ─
const PF_RATE_EMPLOYEE: f64 = 12.0 / 100.0;   // 12% of basic
const PF_RATE_EMPLOYER: f64 = 12.0 / 100.0;
const ESI_WAGE_LIMIT: f64 = 21000.0;           // ESI not applicable above this gross
const ESI_RATE_EMPLOYEE: f64 = 0.75 / 100.0;
const ESI_RATE_EMPLOYER: f64 = 3.25 / 100.0;
const PT_AMOUNT: f64 = 200.0;                  // Maharashtra default
const PT_THRESHOLD: f64 = 10000.0;

// ─── Employees ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_employees(uuid: String) -> Result<Vec<Employee>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare(
            "SELECT employee_id, name, designation, department, doj, pan, \
             pf_number, esi_number, bank_name, bank_account, bank_ifsc, status, created_at \
             FROM employees ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let employees = stmt
        .query_map([], |row| {
            Ok(Employee {
                employee_id: row.get(0)?,
                name: row.get(1)?,
                designation: row.get(2)?,
                department: row.get(3)?,
                doj: row.get(4)?,
                pan: row.get(5)?,
                pf_number: row.get(6)?,
                esi_number: row.get(7)?,
                bank_name: row.get(8)?,
                bank_account: row.get(9)?,
                bank_ifsc: row.get(10)?,
                status: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(employees)
}

#[tauri::command]
pub async fn create_employee(
    uuid: String,
    req: CreateEmployeeRequest,
) -> Result<Employee, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let employee_id = format!("EMP-{}", Uuid::new_v4().to_string()[..8].to_uppercase());

    conn.execute(
        "INSERT INTO employees \
         (employee_id, name, designation, department, doj, pan, \
          pf_number, esi_number, bank_name, bank_account, bank_ifsc) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            employee_id, req.name, req.designation, req.department, req.doj,
            req.pan, req.pf_number, req.esi_number,
            req.bank_name, req.bank_account, req.bank_ifsc,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_employee_by_id(&conn, &employee_id)
}

#[tauri::command]
pub async fn update_employee(
    uuid: String,
    employee_id: String,
    req: CreateEmployeeRequest,
) -> Result<Employee, String> {
    let conn = mount::get_company_conn(&uuid)?;

    conn.execute(
        "UPDATE employees SET name=?1, designation=?2, department=?3, doj=?4, \
         pan=?5, pf_number=?6, esi_number=?7, bank_name=?8, bank_account=?9, bank_ifsc=?10 \
         WHERE employee_id=?11",
        params![
            req.name, req.designation, req.department, req.doj,
            req.pan, req.pf_number, req.esi_number,
            req.bank_name, req.bank_account, req.bank_ifsc, employee_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_employee_by_id(&conn, &employee_id)
}

fn get_employee_by_id(conn: &rusqlite::Connection, id: &str) -> Result<Employee, String> {
    conn.query_row(
        "SELECT employee_id, name, designation, department, doj, pan, \
         pf_number, esi_number, bank_name, bank_account, bank_ifsc, status, created_at \
         FROM employees WHERE employee_id=?1",
        params![id],
        |row| Ok(Employee {
            employee_id: row.get(0)?,
            name: row.get(1)?,
            designation: row.get(2)?,
            department: row.get(3)?,
            doj: row.get(4)?,
            pan: row.get(5)?,
            pf_number: row.get(6)?,
            esi_number: row.get(7)?,
            bank_name: row.get(8)?,
            bank_account: row.get(9)?,
            bank_ifsc: row.get(10)?,
            status: row.get(11)?,
            created_at: row.get(12)?,
        }),
    )
    .map_err(|e| e.to_string())
}

// ─── Salary Structures ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_salary_structure(
    uuid: String,
    employee_id: String,
) -> Result<Option<SalaryStructure>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let result = conn.query_row(
        "SELECT structure_id, employee_id, effective_from, basic, hra, conveyance, \
         special, traveling_allowance, food_allowance, other_earnings, \
         pf_applicable, esi_applicable, pt_applicable, created_at \
         FROM salary_structures WHERE employee_id=?1 ORDER BY effective_from DESC LIMIT 1",
        params![employee_id],
        |row| Ok(SalaryStructure {
            structure_id: row.get(0)?,
            employee_id: row.get(1)?,
            effective_from: row.get(2)?,
            basic: row.get(3)?,
            hra: row.get(4)?,
            conveyance: row.get(5)?,
            special: row.get(6)?,
            traveling_allowance: row.get(7)?,
            food_allowance: row.get(8)?,
            other_earnings: row.get(9)?,
            pf_applicable: row.get::<_, i32>(10)? == 1,
            esi_applicable: row.get::<_, i32>(11)? == 1,
            pt_applicable: row.get::<_, i32>(12)? == 1,
            created_at: row.get(13)?,
        }),
    );

    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_salary_structure(
    uuid: String,
    req: SaveSalaryStructureRequest,
) -> Result<SalaryStructure, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let structure_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO salary_structures \
         (structure_id, employee_id, effective_from, basic, hra, conveyance, special, \
          traveling_allowance, food_allowance, other_earnings, pf_applicable, esi_applicable, pt_applicable) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![
            structure_id, req.employee_id, req.effective_from,
            req.basic, req.hra, req.conveyance, req.special, 
            req.traveling_allowance, req.food_allowance, req.other_earnings,
            req.pf_applicable as i32, req.esi_applicable as i32, req.pt_applicable as i32,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT structure_id, employee_id, effective_from, basic, hra, conveyance, \
         special, traveling_allowance, food_allowance, other_earnings, \
         pf_applicable, esi_applicable, pt_applicable, created_at \
         FROM salary_structures WHERE structure_id=?1",
        params![structure_id],
        |row| Ok(SalaryStructure {
            structure_id: row.get(0)?,
            employee_id: row.get(1)?,
            effective_from: row.get(2)?,
            basic: row.get(3)?,
            hra: row.get(4)?,
            conveyance: row.get(5)?,
            special: row.get(6)?,
            traveling_allowance: row.get(7)?,
            food_allowance: row.get(8)?,
            other_earnings: row.get(9)?,
            pf_applicable: row.get::<_, i32>(10)? == 1,
            esi_applicable: row.get::<_, i32>(11)? == 1,
            pt_applicable: row.get::<_, i32>(12)? == 1,
            created_at: row.get(13)?,
        }),
    )
    .map_err(|e| e.to_string())
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_payroll_runs(uuid: String) -> Result<Vec<PayrollRun>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn
        .prepare(
            "SELECT run_id, period_month, period_year, status, processed_at, created_at \
             FROM payroll_runs ORDER BY period_year DESC, period_month DESC",
        )
        .map_err(|e| e.to_string())?;

    let runs = stmt
        .query_map([], |row| {
            Ok(PayrollRun {
                run_id: row.get(0)?,
                period_month: row.get(1)?,
                period_year: row.get(2)?,
                status: row.get(3)?,
                processed_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(runs)
}

/// Compute payroll for a month/year — creates a draft run (or updates existing draft).
/// Returns computed PayrollEntry rows (not yet posted to journal).
#[tauri::command]
pub async fn compute_payroll(
    uuid: String,
    month: i32,
    year: i32,
) -> Result<(PayrollRun, Vec<PayrollEntry>), String> {
    let conn = mount::get_company_conn(&uuid)?;

    // Check for existing draft run for this period
    let existing: Option<String> = conn
        .query_row(
            "SELECT run_id FROM payroll_runs WHERE period_month=?1 AND period_year=?2 AND status='draft'",
            params![month, year],
            |row| row.get(0),
        )
        .ok();

    // Delete old draft entries if re-computing
    if let Some(ref rid) = existing {
        conn.execute("DELETE FROM payroll_entries WHERE run_id=?1", params![rid])
            .map_err(|e| e.to_string())?;
    }

    let had_existing = existing.is_some();
    let run_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

    if !had_existing {
        conn.execute(
            "INSERT INTO payroll_runs (run_id, period_month, period_year) VALUES (?1,?2,?3)",
            params![run_id, month, year],
        )
        .map_err(|e| e.to_string())?;
    }

    // Get all active employees with their latest salary structure
    struct EmpSal {
        employee_id: String,
        name: String,
        basic: f64, hra: f64, conveyance: f64, special: f64, 
        traveling_allowance: f64, food_allowance: f64, other_earnings: f64,
        pf_applicable: bool, esi_applicable: bool, pt_applicable: bool,
    }

    let mut stmt = conn.prepare(
        "SELECT e.employee_id, e.name, \
         COALESCE(s.basic,0), COALESCE(s.hra,0), COALESCE(s.conveyance,0), \
         COALESCE(s.special,0), COALESCE(s.traveling_allowance,0), COALESCE(s.food_allowance,0), COALESCE(s.other_earnings,0), \
         COALESCE(s.pf_applicable,1), COALESCE(s.esi_applicable,1), COALESCE(s.pt_applicable,1) \
         FROM employees e \
         LEFT JOIN salary_structures s ON s.employee_id = e.employee_id \
           AND s.structure_id = (SELECT structure_id FROM salary_structures \
                                  WHERE employee_id=e.employee_id \
                                  ORDER BY effective_from DESC LIMIT 1) \
         WHERE e.status = 'active'",
    ).map_err(|e| e.to_string())?;

    let emp_list: Vec<EmpSal> = stmt
        .query_map([], |row| {
            Ok(EmpSal {
                employee_id: row.get(0)?,
                name: row.get(1)?,
                basic: row.get(2)?,
                hra: row.get(3)?,
                conveyance: row.get(4)?,
                special: row.get(5)?,
                traveling_allowance: row.get(6)?,
                food_allowance: row.get(7)?,
                other_earnings: row.get(8)?,
                pf_applicable: row.get::<_, i32>(9)? == 1,
                esi_applicable: row.get::<_, i32>(10)? == 1,
                pt_applicable: row.get::<_, i32>(11)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut entries: Vec<PayrollEntry> = vec![];

    for emp in emp_list {
        let gross = emp.basic + emp.hra + emp.conveyance + emp.special + emp.traveling_allowance + emp.food_allowance + emp.other_earnings;

        let pf_employee = if emp.pf_applicable { (emp.basic * PF_RATE_EMPLOYEE * 100.0).round() / 100.0 } else { 0.0 };
        let pf_employer = if emp.pf_applicable { (emp.basic * PF_RATE_EMPLOYER * 100.0).round() / 100.0 } else { 0.0 };
        let esi_employee = if emp.esi_applicable && gross <= ESI_WAGE_LIMIT { (gross * ESI_RATE_EMPLOYEE * 100.0).round() / 100.0 } else { 0.0 };
        let esi_employer = if emp.esi_applicable && gross <= ESI_WAGE_LIMIT { (gross * ESI_RATE_EMPLOYER * 100.0).round() / 100.0 } else { 0.0 };
        let pt = if emp.pt_applicable && gross >= PT_THRESHOLD { PT_AMOUNT } else { 0.0 };
        let total_deductions = pf_employee + esi_employee + pt;
        let net_pay = (gross - total_deductions).max(0.0);

        let entry_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO payroll_entries \
             (entry_id, run_id, employee_id, basic, hra, conveyance, special, traveling_allowance, food_allowance, other_earnings, \
              gross, pf_employee, pf_employer, esi_employee, esi_employer, pt, tds, \
              leave_deductions, late_coming_deductions, overtime_amount, advance_payout, advance_deduction, \
              other_deductions, total_deductions, net_pay) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,0.0, 0.0,0.0,0.0,0.0,0.0, 0.0,?17,?18)",
            params![
                entry_id, run_id, emp.employee_id,
                emp.basic, emp.hra, emp.conveyance, emp.special, emp.traveling_allowance, emp.food_allowance, emp.other_earnings,
                gross, pf_employee, pf_employer, esi_employee, esi_employer, pt,
                total_deductions, net_pay,
            ],
        )
        .map_err(|e| e.to_string())?;

        entries.push(PayrollEntry {
            entry_id,
            run_id: run_id.clone(),
            employee_id: emp.employee_id,
            employee_name: emp.name,
            basic: emp.basic, hra: emp.hra, conveyance: emp.conveyance,
            special: emp.special, traveling_allowance: emp.traveling_allowance, food_allowance: emp.food_allowance, other_earnings: emp.other_earnings,
            gross, pf_employee, pf_employer, esi_employee, esi_employer,
            pt, tds: 0.0, other_deductions: 0.0, 
            leave_deductions: 0.0, late_coming_deductions: 0.0, overtime_amount: 0.0, 
            advance_payout: 0.0, advance_deduction: 0.0,
            total_deductions, net_pay,
            journal_entry_id: None,
        });
    }

    let run = conn.query_row(
        "SELECT run_id, period_month, period_year, status, processed_at, created_at \
         FROM payroll_runs WHERE run_id=?1",
        params![run_id],
        |row| Ok(PayrollRun {
            run_id: row.get(0)?, period_month: row.get(1)?, period_year: row.get(2)?,
            status: row.get(3)?, processed_at: row.get(4)?, created_at: row.get(5)?,
        }),
    )
    .map_err(|e| e.to_string())?;

    Ok((run, entries))
}

/// Get entries for an existing payroll run
#[tauri::command]
pub async fn get_payroll_entries(
    uuid: String,
    run_id: String,
) -> Result<Vec<PayrollEntry>, String> {
    let conn = mount::get_company_conn(&uuid)?;
    let mut stmt = conn.prepare(
        "SELECT pe.entry_id, pe.run_id, pe.employee_id, e.name, \
         pe.basic, pe.hra, pe.conveyance, pe.special, pe.traveling_allowance, pe.food_allowance, pe.other_earnings, pe.gross, \
         pe.pf_employee, pe.pf_employer, pe.esi_employee, pe.esi_employer, pe.pt, \
         pe.tds, pe.leave_deductions, pe.late_coming_deductions, pe.overtime_amount, pe.advance_payout, pe.advance_deduction, \
         pe.other_deductions, pe.total_deductions, pe.net_pay, pe.journal_entry_id \
         FROM payroll_entries pe JOIN employees e ON e.employee_id=pe.employee_id \
         WHERE pe.run_id=?1 ORDER BY e.name",
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map(params![run_id], |row| {
        Ok(PayrollEntry {
            entry_id: row.get(0)?, run_id: row.get(1)?, employee_id: row.get(2)?,
            employee_name: row.get(3)?, basic: row.get(4)?, hra: row.get(5)?,
            conveyance: row.get(6)?, special: row.get(7)?, 
            traveling_allowance: row.get(8)?, food_allowance: row.get(9)?,
            other_earnings: row.get(10)?, gross: row.get(11)?, 
            pf_employee: row.get(12)?, pf_employer: row.get(13)?,
            esi_employee: row.get(14)?, esi_employer: row.get(15)?, pt: row.get(16)?,
            tds: row.get(17)?, 
            leave_deductions: row.get(18)?, late_coming_deductions: row.get(19)?, 
            overtime_amount: row.get(20)?, advance_payout: row.get(21)?, advance_deduction: row.get(22)?,
            other_deductions: row.get(23)?, total_deductions: row.get(24)?, 
            net_pay: row.get(25)?, journal_entry_id: row.get(26)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// Update variable components of a drafted payroll entry
#[tauri::command]
pub async fn update_payroll_entry(
    uuid: String,
    entry_id: String,
    req: crate::core::models::UpdatePayrollEntryRequest,
) -> Result<PayrollEntry, String> {
    let conn = mount::get_company_conn(&uuid)?;

    // 1. Get existing entry to find fixed details and recompute
    let (basic, hra, conveyance, special, pf_applicable, esi_applicable, pt_applicable): (f64, f64, f64, f64, bool, bool, bool) = conn.query_row(
        "SELECT pe.basic, pe.hra, pe.conveyance, pe.special, \
         COALESCE(s.pf_applicable, 1), COALESCE(s.esi_applicable, 1), COALESCE(s.pt_applicable, 1) \
         FROM payroll_entries pe \
         LEFT JOIN salary_structures s ON s.employee_id = pe.employee_id \
           AND s.structure_id = (SELECT structure_id FROM salary_structures WHERE employee_id=pe.employee_id ORDER BY effective_from DESC LIMIT 1) \
         WHERE pe.entry_id=?1",
        rusqlite::params![&entry_id],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
            row.get::<_, i32>(4)? == 1, row.get::<_, i32>(5)? == 1, row.get::<_, i32>(6)? == 1
        )),
    ).map_err(|e| e.to_string())?;

    let gross = basic + hra + conveyance + special + req.traveling_allowance + req.food_allowance + req.other_earnings + req.overtime_amount;
    
    // PF/ESI Calculation
    let pf_employee = if pf_applicable { (basic * PF_RATE_EMPLOYEE * 100.0).round() / 100.0 } else { 0.0 };
    let pf_employer = if pf_applicable { (basic * PF_RATE_EMPLOYER * 100.0).round() / 100.0 } else { 0.0 };
    let esi_employee = if esi_applicable && gross <= ESI_WAGE_LIMIT { (gross * ESI_RATE_EMPLOYEE * 100.0).round() / 100.0 } else { 0.0 };
    let esi_employer = if esi_applicable && gross <= ESI_WAGE_LIMIT { (gross * ESI_RATE_EMPLOYER * 100.0).round() / 100.0 } else { 0.0 };
    let pt = if pt_applicable && gross >= PT_THRESHOLD { PT_AMOUNT } else { 0.0 };

    let total_deductions = pf_employee + esi_employee + pt + req.leave_deductions + req.late_coming_deductions + req.advance_deduction + req.other_deductions;
    let net_pay = (gross + req.advance_payout - total_deductions).max(0.0);

    conn.execute(
        "UPDATE payroll_entries SET \
         traveling_allowance=?1, food_allowance=?2, other_earnings=?3, overtime_amount=?4, \
         leave_deductions=?5, late_coming_deductions=?6, advance_payout=?7, advance_deduction=?8, other_deductions=?9, \
         gross=?10, pf_employee=?11, pf_employer=?12, esi_employee=?13, esi_employer=?14, pt=?15, \
         total_deductions=?16, net_pay=?17 \
         WHERE entry_id=?18",
        rusqlite::params![
            req.traveling_allowance, req.food_allowance, req.other_earnings, req.overtime_amount,
            req.leave_deductions, req.late_coming_deductions, req.advance_payout, req.advance_deduction, req.other_deductions,
            gross, pf_employee, pf_employer, esi_employee, esi_employer, pt,
            total_deductions, net_pay, entry_id
        ],
    ).map_err(|e| e.to_string())?;

    // Now return the updated entry
    let mut stmt = conn.prepare(
        "SELECT pe.entry_id, pe.run_id, pe.employee_id, e.name, \
         pe.basic, pe.hra, pe.conveyance, pe.special, pe.traveling_allowance, pe.food_allowance, pe.other_earnings, pe.gross, \
         pe.pf_employee, pe.pf_employer, pe.esi_employee, pe.esi_employer, pe.pt, \
         pe.tds, pe.leave_deductions, pe.late_coming_deductions, pe.overtime_amount, pe.advance_payout, pe.advance_deduction, \
         pe.other_deductions, pe.total_deductions, pe.net_pay, pe.journal_entry_id \
         FROM payroll_entries pe JOIN employees e ON e.employee_id=pe.employee_id \
         WHERE pe.entry_id=?1",
    ).map_err(|e| e.to_string())?;

    let entry = stmt.query_row(rusqlite::params![entry_id], |row| {
        Ok(PayrollEntry {
            entry_id: row.get(0)?, run_id: row.get(1)?, employee_id: row.get(2)?,
            employee_name: row.get(3)?, basic: row.get(4)?, hra: row.get(5)?,
            conveyance: row.get(6)?, special: row.get(7)?, 
            traveling_allowance: row.get(8)?, food_allowance: row.get(9)?,
            other_earnings: row.get(10)?, gross: row.get(11)?, 
            pf_employee: row.get(12)?, pf_employer: row.get(13)?,
            esi_employee: row.get(14)?, esi_employer: row.get(15)?, pt: row.get(16)?,
            tds: row.get(17)?, 
            leave_deductions: row.get(18)?, late_coming_deductions: row.get(19)?, 
            overtime_amount: row.get(20)?, advance_payout: row.get(21)?, advance_deduction: row.get(22)?,
            other_deductions: row.get(23)?, total_deductions: row.get(24)?, 
            net_pay: row.get(25)?, journal_entry_id: row.get(26)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(entry)
}

/// Process (finalize) a payroll run — posts a consolidated journal entry.
/// Salary Expense A/c Dr (gross + employer PF/ESI)
///   PF Payable A/c Cr (pf_employee + pf_employer)
///   ESI Payable A/c Cr (esi_employee + esi_employer)
///   PT Payable A/c Cr
///   Salary Payable A/c Cr (net_pay)
#[tauri::command]
pub async fn process_payroll(
    uuid: String,
    run_id: String,
) -> Result<PayrollRun, String> {
    let conn = mount::get_company_conn(&uuid)?;

    // Verify run is draft
    let status: String = conn.query_row(
        "SELECT status FROM payroll_runs WHERE run_id=?1",
        params![run_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if status != "draft" {
        return Err("Payroll run is already processed".to_string());
    }

    // Aggregate totals from payroll_entries
    let (
        total_gross, total_net, total_pf_emp, total_pf_er, total_esi_emp, total_esi_er, total_pt, 
        total_leave_ded, total_late_ded, total_adv_payout, total_adv_ded
    ): (f64,f64,f64,f64,f64,f64,f64,f64,f64,f64,f64) = conn.query_row(
        "SELECT SUM(gross), SUM(net_pay), SUM(pf_employee), SUM(pf_employer), \
         SUM(esi_employee), SUM(esi_employer), SUM(pt), \
         SUM(leave_deductions), SUM(late_coming_deductions), SUM(advance_payout), SUM(advance_deduction) \
         FROM payroll_entries WHERE run_id=?1",
        rusqlite::params![run_id],
        |row| Ok((
            row.get::<_,f64>(0).unwrap_or(0.0),
            row.get::<_,f64>(1).unwrap_or(0.0),
            row.get::<_,f64>(2).unwrap_or(0.0),
            row.get::<_,f64>(3).unwrap_or(0.0),
            row.get::<_,f64>(4).unwrap_or(0.0),
            row.get::<_,f64>(5).unwrap_or(0.0),
            row.get::<_,f64>(6).unwrap_or(0.0),
            row.get::<_,f64>(7).unwrap_or(0.0),
            row.get::<_,f64>(8).unwrap_or(0.0),
            row.get::<_,f64>(9).unwrap_or(0.0),
            row.get::<_,f64>(10).unwrap_or(0.0),
        )),
    ).map_err(|e| e.to_string())?;

    if total_gross == 0.0 {
        return Err("No payroll entries found for this run".to_string());
    }

    let (month, year): (i32, i32) = conn.query_row(
        "SELECT period_month, period_year FROM payroll_runs WHERE run_id=?1",
        params![run_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // Resolve or create payroll-related accounts
    let salary_expense_id = find_or_create_account(&conn, "Salary & Wages", "expense")?;
    let salary_payable_id = find_or_create_account(&conn, "Salary Payable", "liability")?;
    let pf_payable_id     = find_or_create_account(&conn, "PF Payable", "liability")?;
    let esi_payable_id    = find_or_create_account(&conn, "ESI Payable", "liability")?;
    let pt_payable_id     = find_or_create_account(&conn, "PT Payable", "liability")?;
    let employee_advances_id = find_or_create_account(&conn, "Employee Advances", "asset")?;
    let leave_deductions_id = find_or_create_account(&conn, "Leave Deductions Recovery", "income")?;

    let total_employer_cost = total_gross + total_pf_er + total_esi_er;

    let emp_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM payroll_entries WHERE run_id=?1",
            rusqlite::params![run_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let narration = format!("Salary for {}/{} — {} employees", month, year, emp_count);

    let mut lines: Vec<crate::core::models::LedgerLineInput> = vec![];

    // Debit: Salary & Wages (gross + employer statutory)
    lines.push(crate::core::models::LedgerLineInput {
        account_id: salary_expense_id,
        debit: format!("{:.2}", total_employer_cost),
        credit: "0.00".to_string(),
    });
    
    // Debit: Employee Advances (new payouts given this month)
    if total_adv_payout > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: employee_advances_id.clone(),
            debit: format!("{:.2}", total_adv_payout),
            credit: "0.00".to_string(),
        });
    }

    // Credit: Salary Payable (net pay, which includes advance_payouts - deductions)
    lines.push(crate::core::models::LedgerLineInput {
        account_id: salary_payable_id,
        debit: "0.00".to_string(),
        credit: format!("{:.2}", total_net),
    });
    // Credit: PF Payable
    let total_pf = total_pf_emp + total_pf_er;
    if total_pf > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: pf_payable_id,
            debit: "0.00".to_string(),
            credit: format!("{:.2}", total_pf),
        });
    }
    // Credit: ESI Payable
    let total_esi = total_esi_emp + total_esi_er;
    if total_esi > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: esi_payable_id,
            debit: "0.00".to_string(),
            credit: format!("{:.2}", total_esi),
        });
    }
    // Credit: PT Payable
    if total_pt > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: pt_payable_id,
            debit: "0.00".to_string(),
            credit: format!("{:.2}", total_pt),
        });
    }
    
    // Credit: Employee Advances (recovered this month)
    if total_adv_ded > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: employee_advances_id,
            debit: "0.00".to_string(),
            credit: format!("{:.2}", total_adv_ded),
        });
    }

    // Credit: Leave Deductions Recovery (Income)
    let total_leaves = total_leave_ded + total_late_ded;
    if total_leaves > 0.0 {
        lines.push(crate::core::models::LedgerLineInput {
            account_id: leave_deductions_id,
            debit: "0.00".to_string(),
            credit: format!("{:.2}", total_leaves),
        });
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let entry_req = CreateEntryRequest {
        date: today,
        voucher_number: None,
        narration,
        voucher_type: "Journal".to_string(),
        source: "payroll".to_string(),
        actor_type: "system".to_string(),
        is_rcm: None,
        ecommerce_operator: None,
        lines,
        inventory: None,
    };

    let journal_entry = engine::create_entry(&conn, &entry_req, Some("admin"))
        .map_err(|e| e.to_string())?;

    // Mark run as processed, store journal entry id in each payroll_entry
    conn.execute(
        "UPDATE payroll_runs SET status='processed', processed_at=datetime('now') WHERE run_id=?1",
        params![run_id],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE payroll_entries SET journal_entry_id=?1 WHERE run_id=?2",
        params![journal_entry.entry_id, run_id],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT run_id, period_month, period_year, status, processed_at, created_at \
         FROM payroll_runs WHERE run_id=?1",
        params![run_id],
        |row| Ok(PayrollRun {
            run_id: row.get(0)?, period_month: row.get(1)?, period_year: row.get(2)?,
            status: row.get(3)?, processed_at: row.get(4)?, created_at: row.get(5)?,
        }),
    )
    .map_err(|e| e.to_string())
}

/// Helper: find an account by name or create it
fn find_or_create_account(
    conn: &rusqlite::Connection,
    name: &str,
    account_type: &str,
) -> Result<String, String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT account_id FROM accounts WHERE name=?1 LIMIT 1",
            params![name],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return Ok(id);
    }

    let account_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO accounts (account_id, name, account_type, is_system) VALUES (?1,?2,?3,0)",
        params![account_id, name, account_type],
    )
    .map_err(|e| e.to_string())?;
    Ok(account_id)
}
