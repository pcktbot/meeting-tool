use reqwest::Client;
use serde::Serialize;

const VOICE_SERVICE_URL: &str = "http://127.0.0.1:8000";

#[derive(Serialize)]
struct TtsRequest {
    text: String,
    voice_id: String,
}

#[tauri::command]
pub async fn generate_tts(text: String, voice_id: String) -> Result<Vec<u8>, String> {
    let client = Client::new();
    let response = client
        .post(format!("{VOICE_SERVICE_URL}/tts"))
        .json(&TtsRequest { text, voice_id: voice_id.clone() })
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Voice service not running. Start vanity-voice-reader.".to_string()
            } else {
                e.to_string()
            }
        })?;

    match response.status().as_u16() {
        200 => response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| e.to_string()),
        404 => Err(format!("Voice '{voice_id}' not found")),
        503 => Err("Voice service model is still loading, try again shortly".to_string()),
        status => Err(format!("Voice service returned {status}")),
    }
}

#[tauri::command]
pub async fn get_tts_status() -> Result<serde_json::Value, String> {
    let client = Client::new();
    let response = client
        .get(format!("{VOICE_SERVICE_URL}/status"))
        .send()
        .await
        .map_err(|_| "Voice service not running".to_string())?;

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
