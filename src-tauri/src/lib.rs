pub mod commands;
pub mod core;
pub mod loader;
pub mod security;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize the system database directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir).ok();

            // Initialize the company registry (system-level DB)
            let registry_path = app_data_dir.join("system.db");
            loader::registry::init_registry(&registry_path)
                .expect("Failed to initialize company registry");

            // Initialize auth state
            app.manage(commands::auth::AuthState::new());

            log::info!("ArthMitra started. Data dir: {:?}", app_data_dir);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Company commands
            commands::company::discover_companies,
            commands::company::mount_company,
            commands::company::unmount_company,
            commands::company::create_company,
            commands::company::validate_company,
            commands::company::get_company_profile,
            commands::company::update_company,
            commands::company::get_states,
            commands::company::create_state,
            // FY & Backup
            commands::company::get_financial_years,
            commands::company::create_financial_year,
            commands::company::create_backup,
            commands::company::get_backups,
            commands::company::restore_backup,
            // Ledger commands
            commands::ledger::create_entry,
            commands::ledger::update_entry,
            commands::ledger::get_ledger,
            commands::ledger::get_entry,
            commands::ledger::get_balance,
            commands::ledger::delete_entry,
            commands::ledger::get_next_voucher_number,
            commands::ledger::get_accounts,
            commands::ledger::create_account,
            commands::ledger::update_account,
            commands::ledger::delete_account,
            commands::ledger::approve_entry,
            // Report commands
            commands::ledger::get_trial_balance,
            commands::ledger::get_profit_loss,
            commands::ledger::get_balance_sheet,
            // Search
            commands::ledger::global_search,
            // GST Reports
            commands::ledger::get_gstr1,
            commands::ledger::get_gstr3b,
            // Dashboard
            commands::dashboard::get_dashboard_stats,
            // Inventory (Phase 7)
            commands::inventory::get_units,
            commands::inventory::create_unit,
            commands::inventory::delete_unit,
            commands::inventory::get_items,
            commands::inventory::create_item,
            commands::inventory::update_item,
            commands::inventory::delete_item,
            // Inventory Reporting (Phase 9)
            commands::inventory::get_stock_summary,
            commands::inventory::get_item_ledger,
            // Production (Phase 11)
            commands::production::create_bom,
            commands::production::get_boms,
            commands::production::get_bom_details,
            commands::production::delete_bom,
            commands::production::create_production_order,
            commands::production::get_production_orders,
            // Auth (Phase 13)
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_current_user,
            commands::auth::get_users,
            commands::auth::create_user,
            commands::auth::update_user,
            commands::auth::change_password,
            commands::auth::delete_user,
            // Settings (Phase 14)
            commands::settings::get_company_settings,
            commands::settings::update_company_settings,
            commands::settings::upload_image,
            // E-commerce Operators (Phase 16)
            commands::ledger::create_ecommerce_operator,
            commands::ledger::get_ecommerce_operators,
            commands::ledger::delete_ecommerce_operator,
            commands::ledger::update_ecommerce_operator,
            // Import (Phase 15)
            commands::import::read_import_file,
            commands::import::import_ledgers,
            commands::import::import_items,
            // Audit (Phase 22)
            commands::audit::get_audit_logs,
            commands::audit::verify_audit_chain,
            // TDS (Phase 23)
            commands::tds::get_tds_sections,
            commands::tds::get_tds_deductions,
            commands::tds::create_tds_deduction,
            commands::tds::mark_tds_deposited,
            commands::tds::get_tds_liability_report,
            // Payroll (Phase 24)
            commands::payroll::get_employees,
            commands::payroll::create_employee,
            commands::payroll::update_employee,
            commands::payroll::get_salary_structure,
            commands::payroll::save_salary_structure,
            commands::payroll::get_payroll_runs,
            commands::payroll::compute_payroll,
            commands::payroll::get_payroll_entries,
            commands::payroll::update_payroll_entry,
            commands::payroll::process_payroll,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ArthMitra");
}
