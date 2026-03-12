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

    // Migrations: add columns that may be missing from existing DBs
    let migrations: &[(&str, &str)] = &[
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='content_format'",
            "ALTER TABLE contribution_entries ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'",
        ),
    ];
    for (check_sql, alter_sql) in migrations {
        let needs_migration: bool = conn
            .query_row(check_sql, [], |row| {
                let count: i64 = row.get(0)?;
                Ok(count == 0)
            })
            .unwrap_or(false);
        if needs_migration {
            conn.execute_batch(alter_sql).map_err(|e| e.to_string())?;
        }
    }

    Ok(Arc::new(Mutex::new(conn)))
}

pub fn get_db_path(app: &AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("meeting-tool.db");
    Ok(db_path.to_string_lossy().to_string())
}
