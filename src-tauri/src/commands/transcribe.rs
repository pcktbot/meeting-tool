use crate::audio::processor;
use crate::whisper::engine::{Segment, WhisperEngine};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct WhisperState(pub Mutex<WhisperEngine>);

#[derive(serde::Serialize, Clone)]
pub struct TranscriptionResult {
    pub segments: Vec<Segment>,
    pub full_text: String,
    pub model_used: String,
}

#[tauri::command]
pub async fn transcribe_file(
    app: AppHandle,
    state: State<'_, WhisperState>,
    file_path: String,
) -> Result<TranscriptionResult, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    app.emit("transcription-progress", "Loading audio file...")
        .ok();

    let audio_data = processor::load_wav_as_f32(&path)?;

    app.emit("transcription-progress", "Transcribing...").ok();

    let engine = state.0.lock().map_err(|e| e.to_string())?;

    if !engine.is_loaded() {
        return Err("Whisper model not loaded. Please download a model first.".into());
    }

    let model_name = engine.model_name().to_string();
    let segments = engine.transcribe(&audio_data)?;

    let full_text = segments
        .iter()
        .map(|s| s.text.clone())
        .collect::<Vec<_>>()
        .join(" ");

    app.emit("transcription-progress", "Complete").ok();

    Ok(TranscriptionResult {
        segments,
        full_text,
        model_used: model_name,
    })
}
