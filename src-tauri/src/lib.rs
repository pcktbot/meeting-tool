mod audio;
mod commands;
mod whisper;

use commands::transcribe::WhisperState;
use std::sync::Mutex;
use whisper::engine::WhisperEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WhisperState(Mutex::new(WhisperEngine::new())))
        .invoke_handler(tauri::generate_handler![
            commands::transcribe::transcribe_file,
            commands::model::get_model_status,
            commands::model::download_model,
            commands::model::load_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
