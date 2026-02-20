use crate::core::engine;
use crate::core::models::DashboardStats;
use crate::loader::mount;
use tauri::command;

#[command]
pub fn get_dashboard_stats(uuid: String) -> Result<DashboardStats, String> {
    let conn = mount::get_company_conn(&uuid)?;
    engine::get_dashboard_stats(&conn).map_err(|e| e.to_string())
}
