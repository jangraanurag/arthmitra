use rusqlite::{Connection, Result};

/// Initialize all tables for a company database.
/// Uses WAL mode for crash safety and concurrent read performance.
pub fn init_company_db(conn: &Connection) -> Result<()> {
    // Enable WAL mode for crash safety
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", "5000")?;

    conn.execute_batch(COMPANY_SCHEMA)?;
    perform_migrations(conn)?;
    seed_default_coa(conn)?;
    Ok(())
}

/// Perform idempotent migrations to update existing databases
fn perform_migrations(conn: &Connection) -> Result<()> {
    // Migration 1: Add voucher_number to journal_entries
    let has_voucher_number: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('journal_entries') WHERE name='voucher_number'",
        [],
        |row| {
            let count: i32 = row.get(0)?;
            Ok(count > 0)
        },
    )?;

    if !has_voucher_number {
        conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN voucher_number TEXT NOT NULL DEFAULT ''",
            [],
        )?;
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_voucher_unique ON journal_entries(voucher_type, voucher_number)",
            [],
        )?;
    }

    // Migration 2: Add GST fields to accounts
    let has_gstin: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('accounts') WHERE name='gstin'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !has_gstin {
        conn.execute("ALTER TABLE accounts ADD COLUMN gstin TEXT", [])?;
        conn.execute("ALTER TABLE accounts ADD COLUMN state TEXT", [])?;
        conn.execute("ALTER TABLE accounts ADD COLUMN address TEXT", [])?;
        conn.execute("ALTER TABLE accounts ADD COLUMN email TEXT", [])?;
        conn.execute("ALTER TABLE accounts ADD COLUMN phone TEXT", [])?;
    }

    // Migration 3: Add company_settings table (Key-Value Store)
    let has_settings: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='company_settings'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !has_settings {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS company_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )?;

        // Seed default settings if empty
        conn.execute(
            "INSERT OR IGNORE INTO company_settings (key, value) VALUES 
            ('terms', '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if payment is not made within due date.\n3. Subject to local jurisdiction only.'),
            ('bank_name', ''),
            ('bank_account', ''),
            ('bank_ifsc', '')",
            [],
        )?;
    }

    // Migration 4: Add RCM and E-commerce fields to journal_entries
    let has_rcm: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('journal_entries') WHERE name='is_rcm'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !has_rcm {
        conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN is_rcm INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        conn.execute(
            "ALTER TABLE journal_entries ADD COLUMN ecommerce_operator TEXT",
            [],
        )?;
    }

    // Migration 5: Add tax_inclusive to inventory_entries
    let has_tax_inclusive: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('inventory_entries') WHERE name='tax_inclusive'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !has_tax_inclusive {
        conn.execute(
            "ALTER TABLE inventory_entries ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // Migration 6: Add enhanced audit log fields (details, entity_id, entity_type)
    let has_audit_details: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('audit_log') WHERE name='details'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !has_audit_details {
        conn.execute("ALTER TABLE audit_log ADD COLUMN details TEXT", [])?;
        conn.execute("ALTER TABLE audit_log ADD COLUMN entity_id TEXT", [])?;
        conn.execute("ALTER TABLE audit_log ADD COLUMN entity_type TEXT", [])?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)",
            [],
        )?;
    }

    // Migration 7: TDS (Tax Deducted at Source) tables
    let tds_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tds_sections'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !tds_exists {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS tds_sections (
                section_code     TEXT PRIMARY KEY,
                description      TEXT NOT NULL,
                threshold_single REAL NOT NULL DEFAULT 0,
                threshold_annual REAL NOT NULL DEFAULT 0,
                rate_individual  REAL NOT NULL DEFAULT 0,
                rate_company     REAL NOT NULL DEFAULT 0,
                is_system        INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS tds_deductions (
                deduction_id      TEXT PRIMARY KEY,
                entry_id          TEXT REFERENCES journal_entries(entry_id),
                section_code      TEXT NOT NULL REFERENCES tds_sections(section_code),
                party_account_id  TEXT NOT NULL,
                party_name        TEXT NOT NULL,
                payment_amount    REAL NOT NULL,
                tds_rate          REAL NOT NULL,
                tds_amount        REAL NOT NULL,
                pan               TEXT,
                deposit_status    TEXT NOT NULL DEFAULT 'pending' CHECK(deposit_status IN ('pending','deposited')),
                challan_no        TEXT,
                deposit_date      TEXT,
                period_month      INTEGER NOT NULL,
                period_year       INTEGER NOT NULL,
                created_at        TEXT NOT NULL DEFAULT (datetime('now'))
            );

            INSERT OR IGNORE INTO tds_sections VALUES ('194C','Contractor / Sub-contractor',          30000,  100000, 1.0,  2.0,  1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194J','Professional / Technical Services',    30000,   30000, 10.0, 10.0, 1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194I','Rent (Land, Building, Plant)',        240000,  240000, 10.0, 10.0, 1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194A','Interest (other than bank)',            5000,    5000, 10.0, 10.0, 1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194H','Commission / Brokerage',              15000,   15000,  5.0,  5.0, 1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194B','Lottery / Game Winnings',             10000,   10000, 30.0, 30.0, 1);
            INSERT OR IGNORE INTO tds_sections VALUES ('194M','Payment to Contractor (Indiv.)',    5000000, 5000000,  5.0,  5.0, 1);

            CREATE INDEX IF NOT EXISTS idx_tds_entry  ON tds_deductions(entry_id);
            CREATE INDEX IF NOT EXISTS idx_tds_status ON tds_deductions(deposit_status);
            CREATE INDEX IF NOT EXISTS idx_tds_period ON tds_deductions(period_year, period_month);
            "#,
        )?;
    }

    // Migration 8: Payroll tables
    let payroll_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='employees'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    )?;

    if !payroll_exists {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS employees (
                employee_id     TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                designation     TEXT NOT NULL DEFAULT '',
                department      TEXT NOT NULL DEFAULT '',
                doj             TEXT NOT NULL,
                pan             TEXT,
                pf_number       TEXT,
                esi_number      TEXT,
                bank_name       TEXT,
                bank_account    TEXT,
                bank_ifsc       TEXT,
                status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS salary_structures (
                structure_id    TEXT PRIMARY KEY,
                employee_id     TEXT NOT NULL REFERENCES employees(employee_id),
                effective_from  TEXT NOT NULL,
                basic           REAL NOT NULL DEFAULT 0,
                hra             REAL NOT NULL DEFAULT 0,
                conveyance      REAL NOT NULL DEFAULT 0,
                special         REAL NOT NULL DEFAULT 0,
                other_earnings  REAL NOT NULL DEFAULT 0,
                pf_applicable   INTEGER NOT NULL DEFAULT 1,
                esi_applicable  INTEGER NOT NULL DEFAULT 1,
                pt_applicable   INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS payroll_runs (
                run_id          TEXT PRIMARY KEY,
                period_month    INTEGER NOT NULL,
                period_year     INTEGER NOT NULL,
                status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','processed')),
                processed_at    TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS payroll_entries (
                entry_id        TEXT PRIMARY KEY,
                run_id          TEXT NOT NULL REFERENCES payroll_runs(run_id),
                employee_id     TEXT NOT NULL REFERENCES employees(employee_id),
                basic           REAL NOT NULL DEFAULT 0,
                hra             REAL NOT NULL DEFAULT 0,
                conveyance      REAL NOT NULL DEFAULT 0,
                special         REAL NOT NULL DEFAULT 0,
                other_earnings  REAL NOT NULL DEFAULT 0,
                gross           REAL NOT NULL DEFAULT 0,
                pf_employee     REAL NOT NULL DEFAULT 0,
                pf_employer     REAL NOT NULL DEFAULT 0,
                esi_employee    REAL NOT NULL DEFAULT 0,
                esi_employer    REAL NOT NULL DEFAULT 0,
                pt              REAL NOT NULL DEFAULT 0,
                tds             REAL NOT NULL DEFAULT 0,
                other_deductions REAL NOT NULL DEFAULT 0,
                total_deductions REAL NOT NULL DEFAULT 0,
                net_pay         REAL NOT NULL DEFAULT 0,
                journal_entry_id TEXT REFERENCES journal_entries(entry_id),
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_sal_employee ON salary_structures(employee_id);
            CREATE INDEX IF NOT EXISTS idx_pr_period    ON payroll_runs(period_year, period_month);
            CREATE INDEX IF NOT EXISTS idx_pe_run       ON payroll_entries(run_id);
            CREATE INDEX IF NOT EXISTS idx_pe_employee  ON payroll_entries(employee_id);
            "#,
        )?;
    }

    Ok(())
}

const COMPANY_SCHEMA: &str = r#"
-- ═══════════════════════════════════════════════════════════════
-- ArtMitra Company Database Schema v1.0
-- Double-entry accounting with audit-grade trail
-- ═══════════════════════════════════════════════════════════════

-- Company Settings (Key-Value Store for Config, Images, etc.)
CREATE TABLE IF NOT EXISTS company_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Financial Years (April-March for India)
CREATE TABLE IF NOT EXISTS financial_years (
    fy_id       TEXT PRIMARY KEY,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    is_closed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
    account_id      TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    account_type    TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    parent_account  TEXT,
    group_code      TEXT,
    is_system       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    gstin           TEXT,
    state           TEXT,
    address         TEXT,
    email           TEXT,
    phone           TEXT,
    FOREIGN KEY (parent_account) REFERENCES accounts(account_id)
);

-- Voucher Types (extensible)
CREATE TABLE IF NOT EXISTS voucher_types (
    type_id     TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    is_system   INTEGER NOT NULL DEFAULT 0
);

-- Journal Entries (Event Store — Layer 1)
CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id        TEXT PRIMARY KEY,
    date            TEXT NOT NULL,
    voucher_number  TEXT NOT NULL DEFAULT '', -- Auto-generated (e.g., RCPT-001)
    narration       TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT 'manual',
    voucher_type    TEXT NOT NULL DEFAULT 'journal',
    created_by      TEXT NOT NULL DEFAULT 'system',
    actor_type      TEXT NOT NULL DEFAULT 'human',
    approval_status TEXT NOT NULL DEFAULT 'draft',
    checksum        TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    is_rcm          INTEGER NOT NULL DEFAULT 0,
    ecommerce_operator TEXT, -- Now stores operator_id (UUID) or Name (legacy)
    FOREIGN KEY (voucher_type) REFERENCES voucher_types(type_id),
    FOREIGN KEY(ecommerce_operator) REFERENCES ecommerce_operators(operator_id),
    UNIQUE(voucher_type, voucher_number) -- Ensure uniqueness per sequence
);

CREATE TABLE IF NOT EXISTS ecommerce_operators (
    operator_id TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    gstin       TEXT NOT NULL
);

-- Sequences for Voucher Auto-numbering
CREATE TABLE IF NOT EXISTS sequences (
    seq_id      TEXT PRIMARY KEY, -- e.g., 'receipt', 'payment'
    last_val    INTEGER NOT NULL DEFAULT 0
);

-- Ledger Lines (Double Entry — Layer 2)
CREATE TABLE IF NOT EXISTS ledger_lines (
    line_id     TEXT PRIMARY KEY,
    entry_id    TEXT NOT NULL,
    account_id  TEXT NOT NULL,
    debit       TEXT NOT NULL DEFAULT '0',
    credit      TEXT NOT NULL DEFAULT '0',
    FOREIGN KEY (entry_id) REFERENCES journal_entries(entry_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

-- Balance Snapshots (Layer 3 — Performance Cache)
-- Note: No FK on fy_id — this is a denormalized cache, not source of truth
CREATE TABLE IF NOT EXISTS balances_snapshot (
    account_id      TEXT NOT NULL,
    fy_id           TEXT NOT NULL DEFAULT 'current',
    balance         TEXT NOT NULL DEFAULT '0',
    last_updated    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, fy_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

-- Inventory Impact (for stock-based entries)
CREATE TABLE IF NOT EXISTS inventory_impact (
    impact_id   TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL,
    entry_id    TEXT NOT NULL,
    qty_change  TEXT NOT NULL DEFAULT '0',
    valuation   TEXT NOT NULL DEFAULT '0',
    FOREIGN KEY (entry_id) REFERENCES journal_entries(entry_id)
);

-- GST Records
CREATE TABLE IF NOT EXISTS gst_records (
    gst_id      TEXT PRIMARY KEY,
    entry_id    TEXT NOT NULL,
    gstin       TEXT,
    hsn_code    TEXT,
    cgst        TEXT NOT NULL DEFAULT '0',
    sgst        TEXT NOT NULL DEFAULT '0',
    igst        TEXT NOT NULL DEFAULT '0',
    cess        TEXT NOT NULL DEFAULT '0',
    FOREIGN KEY (entry_id) REFERENCES journal_entries(entry_id)
);

-- Immutable Audit Log (Blockchain-lite Black Box)
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prev_hash       TEXT NOT NULL DEFAULT '',
    data_hash       TEXT NOT NULL,
    action          TEXT NOT NULL,
    actor           TEXT NOT NULL,
    actor_type      TEXT NOT NULL DEFAULT 'system',
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    actor_signature TEXT,
    details         TEXT, -- JSON data showing diffs or snapshot
    entity_id       TEXT, -- ID of the record being modified
    entity_type     TEXT  -- Table name or entity type (e.g., 'journal_entries')
);

-- Master Data: States
CREATE TABLE IF NOT EXISTS states (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    is_system   INTEGER NOT NULL DEFAULT 1
);

-- ═══════════════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_entries(approval_status);
CREATE INDEX IF NOT EXISTS idx_ledger_entry ON ledger_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account);

-- Organization Details (Extended Profile)
CREATE TABLE IF NOT EXISTS organization_details (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    address     TEXT NOT NULL DEFAULT '',
    city        TEXT NOT NULL DEFAULT '',
    state       TEXT NOT NULL DEFAULT '',
    pincode     TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    phone       TEXT NOT NULL DEFAULT '',
    pan         TEXT NOT NULL DEFAULT '',
    website     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════
-- Inventory Management (Phase 7)
-- ═══════════════════════════════════════════════════════════════

-- Stock Units (e.g., kg, pcs, box)
CREATE TABLE IF NOT EXISTS inventory_units (
    unit_id         TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    decimal_places  INTEGER NOT NULL DEFAULT 0,
    is_system       INTEGER NOT NULL DEFAULT 0
);

-- Stock Items (e.g., iPhone 15, Rice, Cement)
CREATE TABLE IF NOT EXISTS inventory_items (
    item_id         TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    sku             TEXT, -- Stock Keeping Unit
    hsn_code        TEXT, -- Harmonized System of Nomenclature
    unit_id         TEXT NOT NULL,
    tax_rate        REAL NOT NULL DEFAULT 0, -- 0, 5, 12, 18, 28
    description     TEXT,
    opening_qty     REAL DEFAULT 0,
    opening_value   REAL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (unit_id) REFERENCES inventory_units(unit_id)
);

-- Inventory Transaction Entries (Part of Journal Entry)
CREATE TABLE IF NOT EXISTS inventory_entries (
    entry_id        TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    txn_type        TEXT NOT NULL CHECK (txn_type IN ('in', 'out')),
    quantity        REAL NOT NULL DEFAULT 0,
    rate            REAL NOT NULL DEFAULT 0,
    amount          REAL NOT NULL DEFAULT 0,
    tax_inclusive   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (entry_id) REFERENCES journal_entries(entry_id),
    FOREIGN KEY (item_id) REFERENCES inventory_items(item_id)
);

-- Ensure the single row exists
INSERT OR IGNORE INTO organization_details (id) VALUES (1);

-- ═══════════════════════════════════════════════════════════════
-- Production & Manufacturing (Phase 11)
-- ═══════════════════════════════════════════════════════════════

-- Bill of Materials (Recipe Header)
CREATE TABLE IF NOT EXISTS bom_headers (
    bom_id          TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL, -- The Finished Good
    name            TEXT NOT NULL,
    output_quantity REAL NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES inventory_items(item_id)
);

-- Bill of Materials Components (Raw Materials)
CREATE TABLE IF NOT EXISTS bom_components (
    component_id    TEXT PRIMARY KEY,
    bom_id          TEXT NOT NULL,
    item_id         TEXT NOT NULL, -- The Raw Material
    quantity        REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (bom_id) REFERENCES bom_headers(bom_id),
    FOREIGN KEY (item_id) REFERENCES inventory_items(item_id)
);

-- Production Orders (Manufacturing Journal)
CREATE TABLE IF NOT EXISTS production_orders (
    order_id        TEXT PRIMARY KEY,
    date            TEXT NOT NULL,
    bom_id          TEXT NOT NULL,
    quantity        REAL NOT NULL DEFAULT 0, -- Quantity of Finished Good produced
    status          TEXT NOT NULL DEFAULT 'draft', -- draft, completed
    entry_id        TEXT, -- Link to the Journal Entry created
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bom_id) REFERENCES bom_headers(bom_id),
    FOREIGN KEY (entry_id) REFERENCES journal_entries(entry_id)
);

"#;

/// Seed the default Indian Chart of Accounts (Schedule III aligned)
/// and voucher types
fn seed_default_coa(conn: &Connection) -> Result<()> {
    // Check if voucher types already seeded
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM voucher_types", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    // Seed States (India)
    let states = [
        ("01", "Jammu & Kashmir"),
        ("02", "Himachal Pradesh"),
        ("03", "Punjab"),
        ("04", "Chandigarh"),
        ("05", "Uttarakhand"),
        ("06", "Haryana"),
        ("07", "Delhi"),
        ("08", "Rajasthan"),
        ("09", "Uttar Pradesh"),
        ("10", "Bihar"),
        ("11", "Sikkim"),
        ("12", "Arunachal Pradesh"),
        ("13", "Nagaland"),
        ("14", "Manipur"),
        ("15", "Mizoram"),
        ("16", "Tripura"),
        ("17", "Meghalaya"),
        ("18", "Assam"),
        ("19", "West Bengal"),
        ("20", "Jharkhand"),
        ("21", "Odisha"),
        ("22", "Chhattisgarh"),
        ("23", "Madhya Pradesh"),
        ("24", "Gujarat"),
        ("25", "Daman & Diu"),
        ("26", "Dadra & Nagar Haveli"),
        ("27", "Maharashtra"),
        ("29", "Karnataka"),
        ("30", "Goa"),
        ("31", "Lakshadweep"),
        ("32", "Kerala"),
        ("33", "Tamil Nadu"),
        ("34", "Puducherry"),
        ("35", "Andaman & Nicobar Islands"),
        ("36", "Telangana"),
        ("37", "Andhra Pradesh"),
        ("38", "Ladakh"),
        ("97", "Other Territory"),
    ];

    for (code, name) in &states {
        conn.execute(
            "INSERT OR IGNORE INTO states (code, name) VALUES (?1, ?2)",
            rusqlite::params![code, name],
        )?;
    }

    // Seed Voucher Types

    // Seed Voucher Types
    let voucher_types = [
        ("journal", "Journal", 1),
        ("receipt", "Receipt", 1),
        ("payment", "Payment", 1),
        ("contra", "Contra", 1),
        ("sales", "Sales", 1),
        ("purchase", "Purchase", 1),
        ("debit_note", "Debit Note", 1),
        ("credit_note", "Credit Note", 1),
    ];
    for (id, name, is_system) in &voucher_types {
        conn.execute(
            "INSERT OR IGNORE INTO voucher_types (type_id, name, is_system) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, is_system],
        )?;
    }

    // Seed Default Indian COA — Schedule III aligned
    let accounts: Vec<(&str, &str, &str, Option<&str>, Option<&str>)> = vec![
        // ── ASSETS ────────────────────────────────────────────────
        ("ASSET", "Assets", "asset", None, Some("A")),
        (
            "ASSET_CA",
            "Current Assets",
            "asset",
            Some("ASSET"),
            Some("A.CA"),
        ),
        (
            "ASSET_CASH",
            "Cash & Bank",
            "asset",
            Some("ASSET_CA"),
            Some("A.CA.CB"),
        ),
        (
            "ASSET_CASH_HAND",
            "Cash in Hand",
            "asset",
            Some("ASSET_CASH"),
            Some("A.CA.CB.H"),
        ),
        (
            "ASSET_CASH_BANK",
            "Cash at Bank",
            "asset",
            Some("ASSET_CASH"),
            Some("A.CA.CB.B"),
        ),
        (
            "ASSET_RECV",
            "Sundry Debtors",
            "asset",
            Some("ASSET_CA"),
            Some("A.CA.SD"),
        ),
        (
            "ASSET_INV",
            "Inventory",
            "asset",
            Some("ASSET_CA"),
            Some("A.CA.INV"),
        ),
        (
            "ASSET_ADV",
            "Advances",
            "asset",
            Some("ASSET_CA"),
            Some("A.CA.ADV"),
        ),
        (
            "ASSET_FA",
            "Fixed Assets",
            "asset",
            Some("ASSET"),
            Some("A.FA"),
        ),
        (
            "ASSET_FA_PPE",
            "Property, Plant & Equipment",
            "asset",
            Some("ASSET_FA"),
            Some("A.FA.PPE"),
        ),
        (
            "ASSET_IA",
            "Intangible Assets",
            "asset",
            Some("ASSET_FA"),
            Some("A.FA.IA"),
        ),
        (
            "ASSET_INP",
            "Input Tax Credits",
            "asset",
            Some("ASSET_CA"),
            Some("A.CA.ITC"),
        ),
        (
            "ASSET_CGST",
            "CGST Input",
            "asset",
            Some("ASSET_INP"),
            Some("A.CA.ITC.CGST"),
        ),
        (
            "ASSET_SGST",
            "SGST Input",
            "asset",
            Some("ASSET_INP"),
            Some("A.CA.ITC.SGST"),
        ),
        (
            "ASSET_IGST",
            "IGST Input",
            "asset",
            Some("ASSET_INP"),
            Some("A.CA.ITC.IGST"),
        ),
        // ── LIABILITIES ──────────────────────────────────────────
        ("LIAB", "Liabilities", "liability", None, Some("L")),
        (
            "LIAB_CL",
            "Current Liabilities",
            "liability",
            Some("LIAB"),
            Some("L.CL"),
        ),
        (
            "LIAB_CRED",
            "Sundry Creditors",
            "liability",
            Some("LIAB_CL"),
            Some("L.CL.SC"),
        ),
        (
            "LIAB_DUTY",
            "Duties & Taxes",
            "liability",
            Some("LIAB_CL"),
            Some("L.CL.DT"),
        ),
        (
            "LIAB_CGST",
            "CGST Output",
            "liability",
            Some("LIAB_DUTY"),
            Some("L.CL.DT.CGST"),
        ),
        (
            "LIAB_SGST",
            "SGST Output",
            "liability",
            Some("LIAB_DUTY"),
            Some("L.CL.DT.SGST"),
        ),
        (
            "LIAB_IGST",
            "IGST Output",
            "liability",
            Some("LIAB_DUTY"),
            Some("L.CL.DT.IGST"),
        ),
        (
            "LIAB_TDS",
            "TDS Payable",
            "liability",
            Some("LIAB_DUTY"),
            Some("L.CL.DT.TDS"),
        ),
        (
            "LIAB_PROV",
            "Provisions",
            "liability",
            Some("LIAB_CL"),
            Some("L.CL.PRV"),
        ),
        (
            "LIAB_LOAN",
            "Loans & Borrowings",
            "liability",
            Some("LIAB"),
            Some("L.LB"),
        ),
        // ── EQUITY ───────────────────────────────────────────────
        ("EQUITY", "Equity", "equity", None, Some("E")),
        (
            "EQUITY_CAP",
            "Share Capital",
            "equity",
            Some("EQUITY"),
            Some("E.SC"),
        ),
        (
            "EQUITY_RES",
            "Reserves & Surplus",
            "equity",
            Some("EQUITY"),
            Some("E.RS"),
        ),
        (
            "EQUITY_PL",
            "Profit & Loss A/c",
            "equity",
            Some("EQUITY_RES"),
            Some("E.RS.PL"),
        ),
        // ── INCOME ───────────────────────────────────────────────
        ("INCOME", "Income", "income", None, Some("I")),
        (
            "INCOME_SALES",
            "Sales Revenue",
            "income",
            Some("INCOME"),
            Some("I.SR"),
        ),
        (
            "INCOME_SVC",
            "Service Revenue",
            "income",
            Some("INCOME"),
            Some("I.SV"),
        ),
        (
            "INCOME_OTH",
            "Other Income",
            "income",
            Some("INCOME"),
            Some("I.OI"),
        ),
        (
            "INCOME_INT",
            "Interest Received",
            "income",
            Some("INCOME_OTH"),
            Some("I.OI.IR"),
        ),
        // ── EXPENSES ─────────────────────────────────────────────
        ("EXPENSE", "Expenses", "expense", None, Some("X")),
        (
            "EXPENSE_COGS",
            "Cost of Goods Sold",
            "expense",
            Some("EXPENSE"),
            Some("X.COGS"),
        ),
        (
            "EXPENSE_PUR",
            "Purchases",
            "expense",
            Some("EXPENSE_COGS"),
            Some("X.COGS.PUR"),
        ),
        (
            "EXPENSE_ADMIN",
            "Administrative Expenses",
            "expense",
            Some("EXPENSE"),
            Some("X.ADM"),
        ),
        (
            "EXPENSE_SAL",
            "Salaries & Wages",
            "expense",
            Some("EXPENSE_ADMIN"),
            Some("X.ADM.SAL"),
        ),
        (
            "EXPENSE_RENT",
            "Rent",
            "expense",
            Some("EXPENSE_ADMIN"),
            Some("X.ADM.RNT"),
        ),
        (
            "EXPENSE_UTIL",
            "Utilities",
            "expense",
            Some("EXPENSE_ADMIN"),
            Some("X.ADM.UTL"),
        ),
        (
            "EXPENSE_DEP",
            "Depreciation",
            "expense",
            Some("EXPENSE"),
            Some("X.DEP"),
        ),
        (
            "EXPENSE_FIN",
            "Finance Costs",
            "expense",
            Some("EXPENSE"),
            Some("X.FIN"),
        ),
        (
            "EXPENSE_INT",
            "Interest Paid",
            "expense",
            Some("EXPENSE_FIN"),
            Some("X.FIN.IP"),
        ),
        (
            "EXPENSE_MISC",
            "Miscellaneous Expenses",
            "expense",
            Some("EXPENSE"),
            Some("X.MISC"),
        ),
    ];

    for (id, name, acc_type, parent, group) in &accounts {
        conn.execute(
            "INSERT OR IGNORE INTO accounts (account_id, name, account_type, parent_account, group_code, is_system) VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            rusqlite::params![id, name, acc_type, parent, group],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_creation() {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();

        // Verify tables exist
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))
            .unwrap();
        assert!(count > 0, "Default COA should be seeded");

        let vt_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM voucher_types", [], |row| row.get(0))
            .unwrap();
        assert_eq!(vt_count, 8, "Should have 8 voucher types");
    }

    #[test]
    fn test_idempotent_seeding() {
        let conn = Connection::open_in_memory().unwrap();
        init_company_db(&conn).unwrap();
        // Run again — should not fail
        init_company_db(&conn).unwrap();
    }
}
