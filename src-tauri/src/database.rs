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
        (
            "SELECT COUNT(*) FROM pragma_table_info('audio_files') WHERE name='expires_at'",
            "ALTER TABLE audio_files ADD COLUMN expires_at INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('audio_files') WHERE name='deleted_at'",
            "ALTER TABLE audio_files ADD COLUMN deleted_at INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='audio_file_path'",
            "ALTER TABLE contribution_entries ADD COLUMN audio_file_path TEXT",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='audio_duration'",
            "ALTER TABLE contribution_entries ADD COLUMN audio_duration INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='audio_size_bytes'",
            "ALTER TABLE contribution_entries ADD COLUMN audio_size_bytes INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='audio_expires_at'",
            "ALTER TABLE contribution_entries ADD COLUMN audio_expires_at INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='audio_deleted_at'",
            "ALTER TABLE contribution_entries ADD COLUMN audio_deleted_at INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contribution_highlights'",
            "CREATE TABLE contribution_highlights (
                id TEXT PRIMARY KEY,
                contribution_entry_id TEXT NOT NULL REFERENCES contribution_entries(id) ON DELETE CASCADE,
                color TEXT NOT NULL,
                text_content TEXT NOT NULL,
                from_pos INTEGER NOT NULL,
                to_pos INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_contribution_highlights_entry_id ON contribution_highlights(contribution_entry_id);",
        ),
        // TTS audio columns on contribution_entries (separate from user-recorded audio_file_path)
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='tts_audio_file_path'",
            "ALTER TABLE contribution_entries ADD COLUMN tts_audio_file_path TEXT",
        ),
        // TTS audio columns on contribution_summaries
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_summaries') WHERE name='tts_audio_file_path'",
            "ALTER TABLE contribution_summaries ADD COLUMN tts_audio_file_path TEXT",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_summaries') WHERE name='tts_audio_duration'",
            "ALTER TABLE contribution_summaries ADD COLUMN tts_audio_duration INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_summaries') WHERE name='tts_audio_size_bytes'",
            "ALTER TABLE contribution_summaries ADD COLUMN tts_audio_size_bytes INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_summaries') WHERE name='tts_audio_expires_at'",
            "ALTER TABLE contribution_summaries ADD COLUMN tts_audio_expires_at INTEGER",
        ),
        (
            "SELECT COUNT(*) FROM pragma_table_info('contribution_summaries') WHERE name='tts_audio_deleted_at'",
            "ALTER TABLE contribution_summaries ADD COLUMN tts_audio_deleted_at INTEGER",
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
