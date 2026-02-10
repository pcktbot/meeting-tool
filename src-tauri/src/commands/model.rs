use crate::commands::transcribe::WhisperState;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

const MODEL_BASE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

#[derive(serde::Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_downloaded: bool,
}

fn get_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(data_dir.join("models"))
}

#[tauri::command]
pub async fn get_model_status(app: AppHandle) -> Result<ModelInfo, String> {
    let models_dir = get_models_dir(&app)?;
    let model_path = models_dir.join("ggml-base.en.bin");
    let is_downloaded = model_path.exists();
    let size = if is_downloaded {
        std::fs::metadata(&model_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    Ok(ModelInfo {
        name: "ggml-base.en".to_string(),
        path: model_path.to_string_lossy().to_string(),
        size_bytes: size,
        is_downloaded,
    })
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    state: State<'_, WhisperState>,
    model_name: String,
) -> Result<String, String> {
    let models_dir = get_models_dir(&app)?;
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let model_filename = format!("{}.bin", model_name);
    let model_path = models_dir.join(&model_filename);

    if model_path.exists() {
        // Model already downloaded, just load it
        let mut engine = state.0.lock().map_err(|e| e.to_string())?;
        engine.load_model(model_path.clone(), model_name)?;
        return Ok(model_path.to_string_lossy().to_string());
    }

    let url = format!("{}/{}", MODEL_BASE_URL, model_filename);

    app.emit("model-download-progress", "Starting download...")
        .ok();

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    std::fs::write(&model_path, &bytes)
        .map_err(|e| format!("Failed to save model file: {}", e))?;

    app.emit("model-download-progress", "Loading model...").ok();

    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.load_model(model_path.clone(), model_name)?;

    app.emit("model-download-progress", "Ready").ok();

    Ok(model_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn load_model(
    app: AppHandle,
    state: State<'_, WhisperState>,
) -> Result<(), String> {
    let models_dir = get_models_dir(&app)?;
    let model_path = models_dir.join("ggml-base.en.bin");

    if !model_path.exists() {
        return Err("Model not found. Please download it first.".into());
    }

    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.load_model(model_path, "ggml-base.en".to_string())?;

    app.emit("model-status", "Model loaded and ready").ok();

    Ok(())
}
