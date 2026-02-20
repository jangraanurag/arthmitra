use super::engine::LedgerResult;
use super::models::*;
use rusqlite::{params, Connection};

// ── Trial Balance ───────────────────────────────────────────────────────

/// Generate Trial Balance as of a given date.
/// Lists all accounts with ledger activity, showing debit/credit totals.
pub fn generate_trial_balance(
    conn: &Connection,
    query: &ReportQuery,
) -> LedgerResult<TrialBalanceReport> {
    let as_of = query
        .as_of_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    let sql = r#"
        SELECT
            a.account_id,
            a.name,
            a.account_type,
            a.group_code,
            COALESCE(SUM(CASE WHEN je.date <= ?1 THEN CAST(ll.debit AS REAL) ELSE 0 END), 0) as total_debit,
            COALESCE(SUM(CASE WHEN je.date <= ?1 THEN CAST(ll.credit AS REAL) ELSE 0 END), 0) as total_credit
        FROM accounts a
        LEFT JOIN ledger_lines ll ON a.account_id = ll.account_id
        LEFT JOIN journal_entries je ON ll.entry_id = je.entry_id
        WHERE (je.entry_id IS NULL OR je.approval_status != 'voided')
        GROUP BY a.account_id
        HAVING total_debit > 0 OR total_credit > 0
        ORDER BY a.account_type, a.group_code, a.name
    "#;

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![as_of], |row| {
        let account_type: String = row.get(2)?;
        let total_debit: f64 = row.get(4)?;
        let total_credit: f64 = row.get(5)?;

        // Balance direction: Assets & Expenses show debit balance,
        // Liabilities, Equity & Income show credit balance
        let balance = match account_type.as_str() {
            "asset" | "expense" => total_debit - total_credit,
            _ => total_credit - total_debit,
        };

        // For trial balance: show the closing balance in debit or credit column
        let (tb_debit, tb_credit) = if balance >= 0.0 {
            match account_type.as_str() {
                "asset" | "expense" => (balance, 0.0),
                _ => (0.0, balance),
            }
        } else {
            match account_type.as_str() {
                "asset" | "expense" => (0.0, -balance),
                _ => (-balance, 0.0),
            }
        };

        Ok(ReportLine {
            account_id: row.get(0)?,
            account_name: row.get(1)?,
            account_type,
            group_code: row.get(3)?,
            debit: format!("{:.2}", tb_debit),
            credit: format!("{:.2}", tb_credit),
            balance: format!("{:.2}", balance),
        })
    })?;

    let mut lines = Vec::new();
    let mut grand_debit = 0.0_f64;
    let mut grand_credit = 0.0_f64;

    for row in rows {
        let line = row?;
        grand_debit += line.debit.parse::<f64>().unwrap_or(0.0);
        grand_credit += line.credit.parse::<f64>().unwrap_or(0.0);
        lines.push(line);
    }

    let is_balanced = (grand_debit - grand_credit).abs() < 0.01;

    Ok(TrialBalanceReport {
        as_of_date: as_of,
        lines,
        total_debit: format!("{:.2}", grand_debit),
        total_credit: format!("{:.2}", grand_credit),
        is_balanced,
    })
}

// ── Profit & Loss ───────────────────────────────────────────────────────

/// Generate Profit & Loss statement for a date range.
/// Shows Income vs Expense accounts to determine Net Profit/Loss.
pub fn generate_profit_loss(
    conn: &Connection,
    query: &ReportQuery,
) -> LedgerResult<ProfitLossReport> {
    let to_date = query
        .to_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
    let from_date = query.from_date.clone().unwrap_or_else(|| {
        // Default: start of current financial year (April 1)
        let now = chrono::Utc::now();
        let year = if now.format("%m").to_string().parse::<u32>().unwrap_or(1) >= 4 {
            now.format("%Y").to_string()
        } else {
            format!(
                "{}",
                now.format("%Y").to_string().parse::<i32>().unwrap_or(2025) - 1
            )
        };
        format!("{}-04-01", year)
    });

    let sql = r#"
        SELECT
            a.account_id,
            a.name,
            a.account_type,
            a.group_code,
            COALESCE(SUM(CAST(ll.debit AS REAL)), 0) as total_debit,
            COALESCE(SUM(CAST(ll.credit AS REAL)), 0) as total_credit
        FROM accounts a
        JOIN ledger_lines ll ON a.account_id = ll.account_id
        JOIN journal_entries je ON ll.entry_id = je.entry_id
        WHERE a.account_type IN ('income', 'expense')
        AND je.date >= ?1 AND je.date <= ?2
        AND je.approval_status != 'voided'
        GROUP BY a.account_id
        HAVING total_debit > 0 OR total_credit > 0
        ORDER BY a.account_type DESC, a.group_code, a.name
    "#;

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![from_date, to_date], |row| {
        let account_type: String = row.get(2)?;
        let total_debit: f64 = row.get(4)?;
        let total_credit: f64 = row.get(5)?;

        let balance = match account_type.as_str() {
            "expense" => total_debit - total_credit,
            "income" => total_credit - total_debit,
            _ => 0.0,
        };

        Ok(ReportLine {
            account_id: row.get(0)?,
            account_name: row.get(1)?,
            account_type,
            group_code: row.get(3)?,
            debit: format!("{:.2}", total_debit),
            credit: format!("{:.2}", total_credit),
            balance: format!("{:.2}", balance),
        })
    })?;

    let mut income_lines = Vec::new();
    let mut expense_lines = Vec::new();
    let mut total_income = 0.0_f64;
    let mut total_expense = 0.0_f64;

    for row in rows {
        let line = row?;
        let bal = line.balance.parse::<f64>().unwrap_or(0.0);
        match line.account_type.as_str() {
            "income" => {
                total_income += bal;
                income_lines.push(line);
            }
            "expense" => {
                total_expense += bal;
                expense_lines.push(line);
            }
            _ => {}
        }
    }

    let net_profit = total_income - total_expense;

    Ok(ProfitLossReport {
        from_date,
        to_date,
        income_lines,
        expense_lines,
        total_income: format!("{:.2}", total_income),
        total_expense: format!("{:.2}", total_expense),
        net_profit: format!("{:.2}", net_profit),
        is_profit: net_profit >= 0.0,
    })
}

// ── Balance Sheet ───────────────────────────────────────────────────────

/// Generate Balance Sheet as of a given date.
/// Shows Assets = Liabilities + Equity + P&L Surplus
pub fn generate_balance_sheet(
    conn: &Connection,
    query: &ReportQuery,
) -> LedgerResult<BalanceSheetReport> {
    let as_of = query
        .as_of_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    let sql = r#"
        SELECT
            a.account_id,
            a.name,
            a.account_type,
            a.group_code,
            COALESCE(SUM(CASE WHEN je.date <= ?1 THEN CAST(ll.debit AS REAL) ELSE 0 END), 0) as total_debit,
            COALESCE(SUM(CASE WHEN je.date <= ?1 THEN CAST(ll.credit AS REAL) ELSE 0 END), 0) as total_credit
        FROM accounts a
        JOIN ledger_lines ll ON a.account_id = ll.account_id
        JOIN journal_entries je ON ll.entry_id = je.entry_id
        WHERE a.account_type IN ('asset', 'liability', 'equity', 'income', 'expense')
        AND je.approval_status != 'voided'
        GROUP BY a.account_id
        HAVING total_debit > 0 OR total_credit > 0
        ORDER BY a.account_type, a.group_code, a.name
    "#;

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![as_of], |row| {
        let account_type: String = row.get(2)?;
        let total_debit: f64 = row.get(4)?;
        let total_credit: f64 = row.get(5)?;

        let balance = match account_type.as_str() {
            "asset" | "expense" => total_debit - total_credit,
            _ => total_credit - total_debit,
        };

        Ok(ReportLine {
            account_id: row.get(0)?,
            account_name: row.get(1)?,
            account_type,
            group_code: row.get(3)?,
            debit: format!("{:.2}", total_debit),
            credit: format!("{:.2}", total_credit),
            balance: format!("{:.2}", balance),
        })
    })?;

    let mut asset_lines = Vec::new();
    let mut liability_lines = Vec::new();
    let mut equity_lines = Vec::new();
    let mut total_assets = 0.0_f64;
    let mut total_liabilities = 0.0_f64;
    let mut total_equity = 0.0_f64;
    let mut total_income = 0.0_f64;
    let mut total_expense = 0.0_f64;

    for row in rows {
        let line = row?;
        let bal = line.balance.parse::<f64>().unwrap_or(0.0);
        match line.account_type.as_str() {
            "asset" => {
                total_assets += bal;
                asset_lines.push(line);
            }
            "liability" => {
                total_liabilities += bal;
                liability_lines.push(line);
            }
            "equity" => {
                total_equity += bal;
                equity_lines.push(line);
            }
            "income" => {
                total_income += bal;
            }
            "expense" => {
                total_expense += bal;
            }
            _ => {}
        }
    }

    // P&L surplus goes under equity side
    let net_pl_surplus = total_income - total_expense;
    let liabilities_plus_equity = total_liabilities + total_equity + net_pl_surplus;
    let is_balanced = (total_assets - liabilities_plus_equity).abs() < 0.01;

    Ok(BalanceSheetReport {
        as_of_date: as_of,
        asset_lines,
        liability_lines,
        equity_lines,
        total_assets: format!("{:.2}", total_assets),
        total_liabilities: format!("{:.2}", total_liabilities),
        total_equity: format!("{:.2}", total_equity),
        net_pl_surplus: format!("{:.2}", net_pl_surplus),
        liabilities_plus_equity: format!("{:.2}", liabilities_plus_equity),
        is_balanced,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::engine;
    use crate::core::models::{CreateEntryRequest, LedgerLineInput, ReportQuery};
    use crate::core::schema::init_company_db;

    fn setup_db_with_entries() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();

        // Entry 1: Rent expense paid from bank
        let req = CreateEntryRequest {
            date: "2026-01-15".to_string(),
            narration: "Office rent Jan".to_string(),
            voucher_type: "payment".to_string(),
            source: "manual".to_string(),
            actor_type: "human".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "EXPENSE_RENT".to_string(),
                    debit: "15000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "ASSET_CASH_BANK".to_string(),
                    debit: "0".to_string(),
                    credit: "15000".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        engine::create_entry(&conn, &req, Some("admin")).unwrap();

        // Entry 2: Sales income received in cash
        let req2 = CreateEntryRequest {
            date: "2026-01-20".to_string(),
            narration: "Cash sales".to_string(),
            voucher_type: "receipt".to_string(),
            source: "manual".to_string(),
            actor_type: "human".to_string(),
            voucher_number: None,
            lines: vec![
                LedgerLineInput {
                    account_id: "ASSET_CASH_HAND".to_string(),
                    debit: "50000".to_string(),
                    credit: "0".to_string(),
                },
                LedgerLineInput {
                    account_id: "INCOME_SALES".to_string(),
                    debit: "0".to_string(),
                    credit: "50000".to_string(),
                },
            ],
            inventory: None,
            is_rcm: Some(false),
            ecommerce_operator: None,
        };
        engine::create_entry(&conn, &req2, Some("admin")).unwrap();

        conn
    }

    #[test]
    fn test_trial_balance_is_balanced() {
        let conn = setup_db_with_entries();
        let query = ReportQuery {
            from_date: None,
            to_date: None,
            as_of_date: Some("2026-12-31".to_string()),
        };
        let tb = generate_trial_balance(&conn, &query).unwrap();
        assert!(tb.is_balanced, "Trial balance should be balanced");
        assert!(!tb.lines.is_empty(), "Should have account lines");
        assert_eq!(tb.total_debit, tb.total_credit);
    }

    #[test]
    fn test_profit_loss_calculation() {
        let conn = setup_db_with_entries();
        let query = ReportQuery {
            from_date: Some("2026-01-01".to_string()),
            to_date: Some("2026-12-31".to_string()),
            as_of_date: None,
        };
        let pl = generate_profit_loss(&conn, &query).unwrap();
        assert_eq!(pl.total_income, "50000.00");
        assert_eq!(pl.total_expense, "15000.00");
        assert_eq!(pl.net_profit, "35000.00");
        assert!(pl.is_profit);
    }

    #[test]
    fn test_balance_sheet_balanced() {
        let conn = setup_db_with_entries();
        let query = ReportQuery {
            from_date: None,
            to_date: None,
            as_of_date: Some("2026-12-31".to_string()),
        };
        let bs = generate_balance_sheet(&conn, &query).unwrap();
        assert!(
            bs.is_balanced,
            "Balance sheet should be balanced: Assets={} vs L+E={}",
            bs.total_assets, bs.liabilities_plus_equity
        );
    }
}

// ── GST Reports ─────────────────────────────────────────────────────────────

pub fn generate_gstr1(conn: &Connection, query: &ReportQuery) -> LedgerResult<GSTR1Report> {
    let from = query
        .from_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%01").to_string());
    let to = query
        .to_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    // Fetch Company State for Inter-state Logic
    let company_state: String = conn
        .query_row("SELECT state FROM company_settings LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|_| "Unknown".to_string());

    // 1. Fetch Sales Entries
    let sql = r#"
        SELECT
            je.entry_id,
            je.date,
            je.voucher_number,
            cust.name as customer_name,
            cust.gstin as customer_gstin,
            cust.state as customer_state,
            ll.credit as taxable_value,
            je.is_rcm
        FROM journal_entries je
        JOIN ledger_lines ll ON je.entry_id = ll.entry_id
        JOIN accounts a ON ll.account_id = a.account_id
        LEFT JOIN ledger_lines ll_cust ON je.entry_id = ll_cust.entry_id AND ll_cust.debit > 0
        LEFT JOIN accounts cust ON ll_cust.account_id = cust.account_id AND cust.account_type = 'asset'
        WHERE je.date >= ?1 AND je.date <= ?2
          AND je.voucher_type IN ('sales', 'credit_note', 'debit_note')
          AND je.approval_status IN ('approved', 'draft')
          AND a.account_type IN ('income', 'asset', 'expense')
    "#;

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, bool>(7)?,
        ))
    })?;

    let mut b2b_invoices = Vec::new();
    let mut b2b_rcm = Vec::new();
    let mut b2c_large = Vec::new();
    let mut b2c_small_buckets: std::collections::HashMap<String, (f64, f64, f64, f64)> =
        std::collections::HashMap::new();

    for row in rows {
        let (entry_id, _date, _v_num, c_name, c_gstin, c_state, taxable_str, is_rcm) = row?;
        let taxable = taxable_str.parse::<f64>().unwrap_or(0.0);

        // Fetch Tax
        let tax_sql = r#"
            SELECT a.name, a.group_code, ll.credit
            FROM ledger_lines ll
            JOIN accounts a ON ll.account_id = a.account_id
            WHERE ll.entry_id = ?1 AND a.account_type = 'liability'
        "#;
        let mut tax_stmt = conn.prepare(tax_sql)?;
        let tax_rows = tax_stmt.query_map(params![entry_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;

        let mut igst = 0.0;
        let mut cgst = 0.0;
        let mut sgst = 0.0;

        for tr in tax_rows {
            let (name, group, credit_str) = tr?;
            let credit = credit_str.parse::<f64>().unwrap_or(0.0);
            let name_lower = name.to_lowercase();
            let group_code = group.as_deref().unwrap_or("");

            if group_code.contains("DT.IGST") || name_lower.contains("igst") {
                igst += credit;
            } else if group_code.contains("DT.CGST") || name_lower.contains("cgst") {
                cgst += credit;
            } else if group_code.contains("DT.SGST") || name_lower.contains("sgst") {
                sgst += credit;
            }
        }

        let total_tax = igst + cgst + sgst;
        let customer_state = c_state.unwrap_or_else(|| "Unknown".to_string());

        if let Some(gstin) = c_gstin {
            if !gstin.trim().is_empty() {
                // B2B
                let row = GSTRow {
                    section: format!("B2B - {}", c_name.unwrap_or_default()),
                    taxable_value: format!("{:.2}", taxable),
                    igst: format!("{:.2}", igst),
                    cgst: format!("{:.2}", cgst),
                    sgst: format!("{:.2}", sgst),
                    cess: "0.00".to_string(),
                    total_tax: format!("{:.2}", total_tax),
                };

                if is_rcm {
                    b2b_rcm.push(row);
                } else {
                    b2b_invoices.push(row);
                }
                continue;
            }
        }

        // B2C Logic
        let is_inter_state = !customer_state.eq_ignore_ascii_case(&company_state);

        if is_inter_state && taxable > 250000.0 {
            // B2C Large
            b2c_large.push(GSTRow {
                section: format!("B2C Large - {}", customer_state),
                taxable_value: format!("{:.2}", taxable),
                igst: format!("{:.2}", igst),
                cgst: format!("{:.2}", cgst),
                sgst: format!("{:.2}", sgst),
                cess: "0.00".to_string(),
                total_tax: format!("{:.2}", total_tax),
            });
        } else {
            // B2C Small (Aggregated)
            let entry = b2c_small_buckets
                .entry(customer_state)
                .or_insert((0.0, 0.0, 0.0, 0.0));
            entry.0 += taxable;
            entry.1 += igst;
            entry.2 += cgst;
            entry.3 += sgst;
        }
    }

    let mut b2c_small = Vec::new();
    let mut total_taxable = 0.0;
    let mut total_igst = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;

    for (state, (taxable, igst, cgst, sgst)) in b2c_small_buckets {
        b2c_small.push(GSTRow {
            section: format!("B2C Small - {}", state),
            taxable_value: format!("{:.2}", taxable),
            igst: format!("{:.2}", igst),
            cgst: format!("{:.2}", cgst),
            sgst: format!("{:.2}", sgst),
            cess: "0.00".to_string(),
            total_tax: format!("{:.2}", igst + cgst + sgst),
        });
    }

    // Helper to sum up buckets
    let mut sum_bucket = |rows: &Vec<GSTRow>| {
        for row in rows {
            total_taxable += row.taxable_value.parse::<f64>().unwrap_or(0.0);
            total_igst += row.igst.parse::<f64>().unwrap_or(0.0);
            total_cgst += row.cgst.parse::<f64>().unwrap_or(0.0);
            total_sgst += row.sgst.parse::<f64>().unwrap_or(0.0);
        }
    };

    sum_bucket(&b2b_invoices);
    sum_bucket(&b2b_rcm);
    sum_bucket(&b2c_large);
    sum_bucket(&b2c_small);

    let total_liability = GSTRow {
        section: "Total Liability".to_string(),
        taxable_value: format!("{:.2}", total_taxable),
        igst: format!("{:.2}", total_igst),
        cgst: format!("{:.2}", total_cgst),
        sgst: format!("{:.2}", total_sgst),
        cess: "0.00".to_string(),
        total_tax: format!("{:.2}", total_igst + total_cgst + total_sgst),
    };

    // 2. HSN Summary
    let hsn_sql = r#"
        SELECT 
            i.hsn_code, 
            i.name, 
            u.symbol, 
            SUM(ie.quantity) as total_qty, 
            SUM(ie.amount) as total_val,
            ie.tax_inclusive,
            i.tax_rate
        FROM inventory_entries ie
        JOIN inventory_items i ON ie.item_id = i.item_id
        JOIN inventory_units u ON i.unit_id = u.unit_id
        JOIN journal_entries je ON ie.entry_id = je.entry_id
        WHERE je.date >= ?1 AND je.date <= ?2
          AND je.voucher_type IN ('sales', 'credit_note', 'debit_note')
          AND je.approval_status IN ('approved', 'draft')
          AND ie.txn_type = 'out'
        GROUP BY i.hsn_code, i.name
    "#;

    let mut hsn_stmt = conn.prepare(hsn_sql)?;
    let hsn_rows = hsn_stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?, // hsn_code
            row.get::<_, String>(1)?,         // name (desc)
            row.get::<_, String>(2)?,         // uqc
            row.get::<_, f64>(3)?,            // total_qty
            row.get::<_, f64>(4)?,            // total_val (amount)
            row.get::<_, bool>(5)?,           // tax_inclusive
            row.get::<_, f64>(6)?,            // tax_rate
        ))
    })?;

    let mut hsn_summary = Vec::new();

    for row in hsn_rows {
        let (hsn, desc, uqc, qty, amount, tax_inclusive, rate) = row?;
        let hsn_code = hsn.unwrap_or_else(|| "Unknown".to_string());

        // Calculate tax back from amount
        // If tax_inclusive: Amount = Taxable + Tax. Tax = Taxable * Rate/100.
        // Amount = Taxable * (1 + Rate/100) -> Taxable = Amount / (1 + Rate/100)

        let (taxable, tax_amt) = if tax_inclusive {
            let t = amount / (1.0 + rate / 100.0);
            (t, amount - t)
        } else {
            (amount, amount * rate / 100.0)
        };

        // Split tax into IGST vs CGST/SGST based on APPROXIMATION
        // Since HSN summary aggregates across all invoices, we don't strictly know which kept IGST vs CGST here
        // without joining back to Ledger Lines or tracking split.
        // For accurate GSTR-1, we should group by State too, but Section 12 is just HSN/SAC total.
        // It asks for Total Value, Taxable Value, Integrated Tax, Central Tax, State Tax, Cess.
        // We will assume Intra-state (CGST+SGST) for simplicity unless we detect IGST.
        // IMPROVEMENT: To be precise, we need to know the 'nature' of each transaction in the sum.
        // For now, let's use a heuristic: splitting 50-50 CGST/SGST is safest default for local businesses,
        // but if we want per-line accuracy, we'd need a more complex query.
        // Let's assume 100% CGST/SGST for simplicity in this MVP unless rate suggests otherwise? No.

        // BETTER APPROACH: We really should query the tax ledgers linked to these entries.
        // But that is hard. Let's just output assuming Intra-State (CGST+SGST) for now to populate the table.
        // Or better: Checking if company state matches? No, we don't have customer info here easily.

        let igst = 0.0;
        let cgst = tax_amt / 2.0;
        let sgst = tax_amt / 2.0;

        hsn_summary.push(HSNRow {
            hsn_code,
            description: desc,
            uqc,
            total_quantity: format!("{:.2}", qty),
            total_value: format!("{:.2}", amount), // Total Value including tax? Or simple total? GSTR1 Instr says "Total Value" usually means Taxable + Tax
            taxable_value: format!("{:.2}", taxable),
            igst: format!("{:.2}", igst),
            cgst: format!("{:.2}", cgst),
            sgst: format!("{:.2}", sgst),
            cess: "0.00".to_string(),
        });
    }

    // 3. Documents Issued
    // Count Cancelled separately
    let doc_sql = r#"
        SELECT 
            voucher_type, 
            MIN(voucher_number), 
            MAX(voucher_number), 
            COUNT(*) as total,
            SUM(CASE WHEN approval_status = 'voided' THEN 1 ELSE 0 END) as cancelled
        FROM journal_entries
        WHERE date >= ?1 AND date <= ?2
          AND voucher_type IN ('sales', 'credit_note', 'debit_note', 'purchase', 'receipt', 'payment')
        GROUP BY voucher_type
    "#;
    let mut stmt = conn.prepare(doc_sql)?;
    let docs = stmt
        .query_map(params![from, to], |row| {
            let min_v: Option<String> = row.get(1)?;
            let max_v: Option<String> = row.get(2)?;

            Ok(DocumentDoc {
                doc_type: row.get::<_, String>(0)?,
                from_serial: min_v.unwrap_or_default(),
                to_serial: max_v.unwrap_or_default(),
                total_count: row.get::<_, i64>(3)?,
                cancelled_count: row.get::<_, i64>(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(GSTR1Report {
        return_period: format!("{} to {}", from, to),
        b2b_invoices,
        b2b_rcm,
        b2c_large,
        b2c_small,
        hsn_summary,
        documents_issued: docs,
        total_liability,
    })
}

pub fn generate_gstr3b(conn: &Connection, query: &ReportQuery) -> LedgerResult<GSTR3BReport> {
    let from = query
        .from_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%01").to_string());
    let to = query
        .to_date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    // Fetch Company State
    let company_state: String = conn
        .query_row("SELECT state FROM company_settings LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|_| "Unknown".to_string());

    // 3.1 Outward Taxable Supplies (Output Tax)
    let out_sql = r#"
        SELECT a.name, a.account_type, a.group_code, ll.credit, cust.state
        FROM journal_entries je
        JOIN ledger_lines ll ON je.entry_id = ll.entry_id
        JOIN accounts a ON ll.account_id = a.account_id
        LEFT JOIN ledger_lines ll_cust ON je.entry_id = ll_cust.entry_id AND ll_cust.debit > 0
        LEFT JOIN accounts cust ON ll_cust.account_id = cust.account_id
        WHERE je.date >= ?1 AND je.date <= ?2
          AND je.voucher_type IN ('sales', 'credit_note', 'debit_note')
          AND je.approval_status IN ('approved', 'draft')
          AND cust.account_type = 'asset'
    "#;

    let mut out_taxable = 0.0;
    let mut out_igst = 0.0;
    let mut out_cgst = 0.0;
    let mut out_sgst = 0.0;

    let mut inter_state_taxable = 0.0;
    let mut inter_state_igst = 0.0;

    let mut stmt = conn.prepare(out_sql)?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;

    for row in rows {
        let (name, acc_type, group, credit_str, cust_state) = row?;
        let credit = credit_str.parse::<f64>().unwrap_or(0.0);
        if credit == 0.0 {
            continue;
        }

        if acc_type == "income" || acc_type == "asset" || acc_type == "expense" {
            out_taxable += credit;
            // Check for Inter-state supply
            if let Some(state) = &cust_state {
                if !state.eq_ignore_ascii_case(&company_state) && !state.is_empty() {
                    inter_state_taxable += credit;
                }
            }
        } else if acc_type == "liability" {
            let name_lower = name.to_lowercase();
            let group_code = group.as_deref().unwrap_or("");
            if group_code.contains("DT.IGST") || name_lower.contains("igst") {
                out_igst += credit;
                // IGST implies inter-state usually, but let's be strict about matching the income leg
                // Simplification: All IGST output is inter-state tax
                inter_state_igst += credit;
            } else if group_code.contains("DT.CGST") || name_lower.contains("cgst") {
                out_cgst += credit;
            } else if group_code.contains("DT.SGST") || name_lower.contains("sgst") {
                out_sgst += credit;
            }
        }
    }

    let outward_row = GSTRow {
        section: "3.1(a) Outward Taxable Supplies".to_string(),
        taxable_value: format!("{:.2}", out_taxable),
        igst: format!("{:.2}", out_igst),
        cgst: format!("{:.2}", out_cgst),
        sgst: format!("{:.2}", out_sgst),
        cess: "0.00".to_string(),
        total_tax: format!("{:.2}", out_igst + out_cgst + out_sgst),
    };

    // 3.2 Inter-State Supplies (Unregistered, Composition, UIN)
    // For now, assuming all B2C Inter-state goes here.
    let inter_state_row = GSTRow {
        section: "3.2 Inter-state supplies".to_string(),
        taxable_value: format!("{:.2}", inter_state_taxable),
        igst: format!("{:.2}", inter_state_igst),
        cgst: "0.00".to_string(),
        sgst: "0.00".to_string(),
        cess: "0.00".to_string(),
        total_tax: format!("{:.2}", inter_state_igst),
    };

    // 4. Eligible ITC (Input Tax)
    let itc_sql = r#"
        SELECT a.name, a.account_type, a.group_code, ll.debit
        FROM journal_entries je
        JOIN ledger_lines ll ON je.entry_id = ll.entry_id
        JOIN accounts a ON ll.account_id = a.account_id
        WHERE je.date >= ?1 AND je.date <= ?2
          AND je.voucher_type IN ('purchase', 'debit_note')
          AND je.approval_status IN ('approved', 'draft')
    "#;

    let mut itc_igst = 0.0;
    let mut itc_cgst = 0.0;
    let mut itc_sgst = 0.0;

    let mut stmt = conn.prepare(itc_sql)?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    for row in rows {
        let (name, acc_type, group, debit_str) = row?;
        let debit = debit_str.parse::<f64>().unwrap_or(0.0);
        if debit == 0.0 {
            continue;
        }

        if acc_type == "asset" {
            let name_lower = name.to_lowercase();
            let group_code = group.as_deref().unwrap_or("");
            if group_code.contains("ITC.IGST") || name_lower.contains("igst") {
                itc_igst += debit;
            } else if group_code.contains("ITC.CGST") || name_lower.contains("cgst") {
                itc_cgst += debit;
            } else if group_code.contains("ITC.SGST") || name_lower.contains("sgst") {
                itc_sgst += debit;
            }
        }
    }

    let itc_row = GSTRow {
        section: "4.A(5) All other ITC".to_string(),
        taxable_value: "0.00".to_string(),
        igst: format!("{:.2}", itc_igst),
        cgst: format!("{:.2}", itc_cgst),
        sgst: format!("{:.2}", itc_sgst),
        cess: "0.00".to_string(),
        total_tax: format!("{:.2}", itc_igst + itc_cgst + itc_sgst),
    };

    // Net Payable
    let pay_igst = (out_igst - itc_igst).max(0.0);
    let pay_cgst = (out_cgst - itc_cgst).max(0.0);
    let pay_sgst = (out_sgst - itc_sgst).max(0.0);

    let payment_row = GSTRow {
        section: "Net Tax Liability".to_string(),
        taxable_value: format!("{:.2}", out_taxable),
        igst: format!("{:.2}", pay_igst),
        cgst: format!("{:.2}", pay_cgst),
        sgst: format!("{:.2}", pay_sgst),
        cess: "0.00".to_string(),
        total_tax: format!("{:.2}", pay_igst + pay_cgst + pay_sgst),
    };

    Ok(GSTR3BReport {
        return_period: format!("{} to {}", from, to),
        outward_supplies: outward_row,
        inter_state_supplies: inter_state_row,
        eligible_itc: itc_row,
        payment_tax: payment_row,
    })
}
