use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState(pub Arc<Mutex<Connection>>);

pub fn init_db(app: &AppHandle) -> Result<Arc<Mutex<Connection>>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join("meeting-tool.db");

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| e.to_string())?;

    // Run schema creation
    conn.execute_batch(include_str!("../../src/db/schema.sql"))
        .map_err(|e| e.to_string())?;

    Ok(Arc::new(Mutex::new(conn)))
}

pub fn get_db_path(app: &AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("meeting-tool.db");
    Ok(db_path.to_string_lossy().to_string())
}
