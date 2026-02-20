use arthmitra_lib::core::{engine, models, reports, schema};
use models::{CreateAccountRequest, CreateEntryRequest, LedgerLineInput, ReportQuery};
use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open_in_memory()?;

    // 1. Initialize Schema
    schema::init_company_db(&conn)?;

    println!("1. Schema Initialized");

    // 2. Create B2B Customer (with GSTIN)
    let b2b_req = CreateAccountRequest {
        name: "B2B Customer".to_string(),
        account_type: "asset".to_string(),
        parent_account: None,
        group_code: None,
        gstin: Some("27ABCDE1234F1Z5".to_string()),
        state: Some("Maharashtra".to_string()),
        address: Some("Mumbai".to_string()),
        email: None,
        phone: None,
    };
    let b2b_acc = engine::create_account(&conn, &b2b_req)?;
    println!(
        "2. Created B2B Account: {} (GSTIN: {:?})",
        b2b_acc.name, b2b_acc.gstin
    );
    assert_eq!(b2b_acc.gstin, Some("27ABCDE1234F1Z5".to_string()));

    // 3. Create B2C Customer (no GSTIN)
    let b2c_req = CreateAccountRequest {
        name: "B2C Customer".to_string(),
        account_type: "asset".to_string(),
        parent_account: None,
        group_code: None,
        gstin: None,
        state: Some("Maharashtra".to_string()),
        address: None,
        email: None,
        phone: None,
    };
    let b2c_acc = engine::create_account(&conn, &b2c_req)?;
    println!(
        "3. Created B2C Account: {} (GSTIN: {:?})",
        b2c_acc.name, b2c_acc.gstin
    );
    assert!(b2c_acc.gstin.is_none());

    // 4. Create Sales Income Account
    let sales_req = CreateAccountRequest {
        name: "Sales Account".to_string(),
        account_type: "income".to_string(),
        parent_account: None,
        group_code: None,
        gstin: None,
        state: None,
        address: None,
        email: None,
        phone: None,
    };
    let sales_acc = engine::create_account(&conn, &sales_req)?;

    // 5. Create B2B Sales Entry
    let b2b_entry_req = CreateEntryRequest {
        date: "2023-10-01".to_string(),
        voucher_number: Some("INV-001".to_string()),
        narration: "B2B Sale".to_string(),
        voucher_type: "sales".to_string(),
        source: "manual".to_string(),
        actor_type: "user".to_string(),
        lines: vec![
            LedgerLineInput {
                account_id: b2b_acc.account_id.clone(),
                debit: "1000.00".to_string(),
                credit: "0.00".to_string(),
            },
            LedgerLineInput {
                account_id: sales_acc.account_id.clone(),
                debit: "0.00".to_string(),
                credit: "1000.00".to_string(),
            },
        ],
        inventory: None,
        is_rcm: None,
        ecommerce_operator: None,
    };
    let b2b_entry = engine::create_entry(&conn, &b2b_entry_req, Some("admin"))?;
    engine::approve_entry(&conn, &b2b_entry.entry_id)?;
    println!(
        "4. Created & Approved B2B Entry: {}",
        b2b_entry.voucher_number
    );

    // 6. Create B2C Sales Entry
    let b2c_entry_req = CreateEntryRequest {
        date: "2023-10-02".to_string(),
        voucher_number: Some("INV-002".to_string()),
        narration: "B2C Sale".to_string(),
        voucher_type: "sales".to_string(),
        source: "manual".to_string(),
        actor_type: "user".to_string(),
        lines: vec![
            LedgerLineInput {
                account_id: b2c_acc.account_id.clone(),
                debit: "500.00".to_string(),
                credit: "0.00".to_string(),
            },
            LedgerLineInput {
                account_id: sales_acc.account_id.clone(),
                debit: "0.00".to_string(),
                credit: "500.00".to_string(),
            },
        ],
        inventory: None,
        is_rcm: None,
        ecommerce_operator: None,
    };
    let b2c_entry = engine::create_entry(&conn, &b2c_entry_req, Some("admin"))?;
    engine::approve_entry(&conn, &b2c_entry.entry_id)?;
    println!(
        "5. Created & Approved B2C Entry: {}",
        b2c_entry.voucher_number
    );

    // 7. Generate GSTR-1
    let report_query = ReportQuery {
        from_date: Some("2023-10-01".to_string()),
        to_date: Some("2023-10-31".to_string()),
        as_of_date: None,
    };
    let gstr1 = reports::generate_gstr1(&conn, &report_query)?;

    println!("6. Generated GSTR-1 Report");
    println!("   B2B Invoices: {}", gstr1.b2b_invoices.len());
    println!("   B2C Small Groups: {}", gstr1.b2c_small.len());

    assert_eq!(gstr1.b2b_invoices.len(), 1, "Should have 1 B2B invoice");
    assert_eq!(gstr1.b2b_invoices[0].taxable_value, "1000.00");

    assert!(!gstr1.b2c_small.is_empty(), "Should have B2C rows");
    let b2c_taxable: f64 = gstr1
        .b2c_small
        .iter()
        .map(|r| r.taxable_value.parse::<f64>().unwrap())
        .sum();
    assert_eq!(b2c_taxable, 500.00, "B2C taxable value should be 500.00");

    println!("Verification Successful!");
    Ok(())
}
