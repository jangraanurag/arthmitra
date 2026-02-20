use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::loader::registry;

// ── Session State ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub must_change_password: bool,
}

/// Application-level auth state managed by Tauri
pub struct AuthState {
    pub session: Mutex<Option<UserSession>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

// ── User model ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub is_active: bool,
    pub must_change_password: bool,
    pub created_at: String,
    pub last_login: Option<String>,
}

// ── Helper: get registry connection ────────────────────────────────────────

fn get_conn() -> Result<Connection, String> {
    registry::get_registry_conn_pub()
}

// ── Tauri Commands ─────────────────────────────────────────────────────────

/// Login with username and password
#[tauri::command]
pub fn login(
    username: String,
    password: String,
    state: tauri::State<'_, AuthState>,
) -> Result<UserSession, String> {
    let conn = get_conn()?;

    let row = conn.query_row(
        "SELECT user_id, username, password_hash, display_name, role, is_active, must_change_password FROM users WHERE username = ?1",
        params![username],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, bool>(5)?,
                row.get::<_, bool>(6)?,
            ))
        },
    ).map_err(|_| "Invalid username or password".to_string())?;

    let (user_id, uname, password_hash, display_name, role, is_active, must_change_password) = row;

    if !is_active {
        return Err("Account is deactivated. Contact an administrator.".to_string());
    }

    // Verify password
    let valid = bcrypt::verify(&password, &password_hash)
        .map_err(|e| format!("Password verification error: {}", e))?;

    if !valid {
        return Err("Invalid username or password".to_string());
    }

    // Update last_login
    conn.execute(
        "UPDATE users SET last_login = datetime('now') WHERE user_id = ?1",
        params![user_id],
    )
    .ok();

    let session = UserSession {
        user_id,
        username: uname,
        display_name,
        role,
        must_change_password,
    };

    // Store session
    let mut s = state.session.lock().unwrap();
    *s = Some(session.clone());

    log::info!("User '{}' logged in successfully", session.username);
    Ok(session)
}

/// Logout the current user
#[tauri::command]
pub fn logout(state: tauri::State<'_, AuthState>) -> Result<(), String> {
    let mut s = state.session.lock().unwrap();
    if let Some(ref session) = *s {
        log::info!("User '{}' logged out", session.username);
    }
    *s = None;
    Ok(())
}

/// Get the current logged-in user (if any)
#[tauri::command]
pub fn get_current_user(state: tauri::State<'_, AuthState>) -> Result<Option<UserSession>, String> {
    let s = state.session.lock().unwrap();
    Ok(s.clone())
}

/// Get all users (admin only)
#[tauri::command]
pub fn get_users(state: tauri::State<'_, AuthState>) -> Result<Vec<User>, String> {
    require_admin(&state)?;

    let conn = get_conn()?;
    let mut stmt = conn
        .prepare("SELECT user_id, username, display_name, role, is_active, must_change_password, created_at, last_login FROM users ORDER BY created_at ASC")
        .map_err(|e| format!("Query error: {}", e))?;

    let users = stmt
        .query_map([], |row| {
            Ok(User {
                user_id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get(4)?,
                must_change_password: row.get(5)?,
                created_at: row.get(6)?,
                last_login: row.get(7)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}

/// Create a new user (admin only)
#[tauri::command]
pub fn create_user(
    username: String,
    password: String,
    display_name: String,
    role: String,
    state: tauri::State<'_, AuthState>,
) -> Result<User, String> {
    require_admin(&state)?;

    if role != "admin" && role != "operator" {
        return Err("Invalid role. Must be 'admin' or 'operator'.".to_string());
    }

    if username.len() < 3 {
        return Err("Username must be at least 3 characters.".to_string());
    }

    if password.len() < 6 {
        return Err("Password must be at least 6 characters.".to_string());
    }

    let conn = get_conn()?;

    // Check uniqueness
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            params![username],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if exists {
        return Err(format!("Username '{}' already exists.", username));
    }

    let user_id = uuid::Uuid::new_v4().to_string();
    let password_hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Failed to hash password: {}", e))?;

    conn.execute(
        "INSERT INTO users (user_id, username, password_hash, display_name, role) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, username, password_hash, display_name, role],
    )
    .map_err(|e| format!("Failed to create user: {}", e))?;

    log::info!("Created user '{}' with role '{}'", username, role);

    Ok(User {
        user_id,
        username,
        display_name,
        role,
        is_active: true,
        must_change_password: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_login: None,
    })
}

/// Update a user (admin only)
#[tauri::command]
pub fn update_user(
    user_id: String,
    display_name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
    state: tauri::State<'_, AuthState>,
) -> Result<User, String> {
    require_admin(&state)?;

    if let Some(ref r) = role {
        if r != "admin" && r != "operator" {
            return Err("Invalid role. Must be 'admin' or 'operator'.".to_string());
        }
    }

    let conn = get_conn()?;

    // Fetch current user
    let mut user = conn
        .query_row(
            "SELECT user_id, username, display_name, role, is_active, must_change_password, created_at, last_login FROM users WHERE user_id = ?1",
            params![user_id],
            |row| {
                Ok(User {
                    user_id: row.get(0)?,
                    username: row.get(1)?,
                    display_name: row.get(2)?,
                    role: row.get(3)?,
                    is_active: row.get(4)?,
                    must_change_password: row.get(5)?,
                    created_at: row.get(6)?,
                    last_login: row.get(7)?,
                })
            },
        )
        .map_err(|_| "User not found.".to_string())?;

    if let Some(dn) = display_name {
        user.display_name = dn;
    }
    if let Some(r) = role {
        user.role = r;
    }
    if let Some(active) = is_active {
        user.is_active = active;
    }

    conn.execute(
        "UPDATE users SET display_name = ?1, role = ?2, is_active = ?3 WHERE user_id = ?4",
        params![user.display_name, user.role, user.is_active, user.user_id],
    )
    .map_err(|e| format!("Failed to update user: {}", e))?;

    log::info!("Updated user '{}'", user.username);
    Ok(user)
}

/// Change password (any user for own, admin for any)
#[tauri::command]
pub fn change_password(
    user_id: String,
    old_password: Option<String>,
    new_password: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let session = {
        let s = state.session.lock().unwrap();
        s.clone().ok_or("Not logged in.".to_string())?
    };

    let is_self = session.user_id == user_id;
    let is_admin = session.role == "admin";

    if !is_self && !is_admin {
        return Err("Permission denied.".to_string());
    }

    if new_password.len() < 6 {
        return Err("New password must be at least 6 characters.".to_string());
    }

    let conn = get_conn()?;

    // If changing own password (non-admin), verify old password
    if is_self && !is_admin {
        let old_pw = old_password.ok_or("Old password is required.".to_string())?;
        let stored_hash: String = conn
            .query_row(
                "SELECT password_hash FROM users WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| "User not found.".to_string())?;

        let valid = bcrypt::verify(&old_pw, &stored_hash)
            .map_err(|e| format!("Verification error: {}", e))?;
        if !valid {
            return Err("Old password is incorrect.".to_string());
        }
    }

    let new_hash = bcrypt::hash(&new_password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Failed to hash password: {}", e))?;

    conn.execute(
        "UPDATE users SET password_hash = ?1, must_change_password = 0 WHERE user_id = ?2",
        params![new_hash, user_id],
    )
    .map_err(|e| format!("Failed to change password: {}", e))?;

    // Update session if self to clear must_change_password
    if is_self {
        let mut s = state.session.lock().unwrap();
        if let Some(ref mut sess) = *s {
            sess.must_change_password = false;
        }
    }

    log::info!("Password changed for user_id '{}'", user_id);
    Ok(())
}

/// Delete (deactivate) a user (admin only)
#[tauri::command]
pub fn delete_user(
    user_id: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    require_admin(&state)?;

    // Prevent self-deletion
    {
        let s = state.session.lock().unwrap();
        if let Some(ref session) = *s {
            if session.user_id == user_id {
                return Err("Cannot deactivate your own account.".to_string());
            }
        }
    }

    let conn = get_conn()?;
    conn.execute(
        "UPDATE users SET is_active = 0 WHERE user_id = ?1",
        params![user_id],
    )
    .map_err(|e| format!("Failed to deactivate user: {}", e))?;

    log::info!("Deactivated user_id '{}'", user_id);
    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn require_admin(state: &tauri::State<'_, AuthState>) -> Result<(), String> {
    let s = state.session.lock().unwrap();
    match &*s {
        Some(session) if session.role == "admin" => Ok(()),
        Some(_) => Err("Permission denied. Admin access required.".to_string()),
        None => Err("Not logged in.".to_string()),
    }
}
