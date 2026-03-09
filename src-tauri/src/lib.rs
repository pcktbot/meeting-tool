mod audio;
mod commands;
mod database;
mod whisper;

use commands::transcribe::WhisperState;
use database::DbState;
use std::sync::Mutex;
use tauri::Manager;
use whisper::engine::WhisperEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WhisperState(Mutex::new(WhisperEngine::new())))
        .setup(|app| {
            let db_conn =
                database::init_db(&app.handle()).expect("Failed to initialize database");
            app.manage(DbState(db_conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::transcribe::transcribe_file,
            commands::model::get_model_status,
            commands::model::download_model,
            commands::model::load_model,
            commands::database::db_execute,
            commands::database::db_run,
            commands::database::db_get_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
