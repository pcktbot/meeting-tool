use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

const MEETING_SUMMARY_PROMPT: &str = "You are a meeting summarization assistant. Given the following meeting transcription, produce a structured summary with these sections:\n\n## Key Points\n- List the main topics discussed and decisions made\n\n## Action Items\n- List any action items, tasks, or follow-ups mentioned, with assignees if stated\n\n## Summary\nA concise 2-3 paragraph summary of the meeting content.\n\n## Participants\nList any participants mentioned by name.\n\nTranscription:\n";

const TRANSCRIPT_CLEANUP_PROMPT: &str = "You are editing a raw meeting transcript for readability.\n\nRules:\n- Preserve meaning.\n- Do not summarize.\n- Do not remove important details.\n- Remove spoken formatting commands like \"paragraph break\" or \"new paragraph\".\n- Improve punctuation and paragraph breaks.\n- Keep uncertain or messy wording if the meaning is unclear rather than inventing details.\n- Return only the cleaned transcript text.\n\nTranscript:\n";

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct StreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<Delta>,
}

#[derive(Deserialize)]
struct Delta {
    #[serde(rename = "type")]
    delta_type: String,
    text: Option<String>,
}

async fn post_anthropic(
    api_key: &str,
    model: &str,
    system: Option<String>,
    user_content: String,
    max_tokens: u32,
) -> Result<String, String> {
    let client = Client::new();

    let request = AnthropicRequest {
        model: model.to_string(),
        max_tokens,
        messages: vec![Message {
            role: "user".to_string(),
            content: user_content,
        }],
        system,
        stream: None,
    };

    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let error_text = response.text().await.map_err(|e| e.to_string())?;
        return Err(format!("Anthropic API error: {}", error_text));
    }

    let body: AnthropicResponse = response.json().await.map_err(|e| e.to_string())?;

    body.content
        .into_iter()
        .find(|b| b.block_type == "text")
        .and_then(|b| b.text)
        .ok_or_else(|| "No text content in Anthropic response".to_string())
}

#[tauri::command]
pub async fn clean_transcript(
    api_key: String,
    transcript_text: String,
    style_prompt: String,
    model: String,
) -> Result<String, String> {
    let system = if !style_prompt.trim().is_empty() {
        Some(format!(
            "Apply these style preferences while cleaning the transcript:\n{}",
            style_prompt.trim()
        ))
    } else {
        None
    };

    let content = format!("{}{}", TRANSCRIPT_CLEANUP_PROMPT, transcript_text);
    post_anthropic(&api_key, &model, system, content, 4096).await
}

#[tauri::command]
pub async fn claude_complete(
    api_key: String,
    user_content: String,
    system: Option<String>,
    model: String,
) -> Result<String, String> {
    post_anthropic(&api_key, &model, system, user_content, 4096).await
}

#[tauri::command]
pub async fn summarize_meeting(
    api_key: String,
    transcript_text: String,
    model: String,
) -> Result<String, String> {
    let content = format!("{}{}", MEETING_SUMMARY_PROMPT, transcript_text);
    post_anthropic(&api_key, &model, None, content, 4096).await
}

#[tauri::command]
pub async fn summarize_with_streaming(
    api_key: String,
    transcript_text: String,
    model: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let client = Client::new();

    let content = format!("{}{}", MEETING_SUMMARY_PROMPT, transcript_text);

    let request = AnthropicRequest {
        model,
        max_tokens: 4096,
        messages: vec![Message {
            role: "user".to_string(),
            content,
        }],
        system: None,
        stream: Some(true),
    };

    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", &api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let error_text = response.text().await.map_err(|e| e.to_string())?;
        return Err(format!("Anthropic API error: {}", error_text));
    }

    let mut byte_stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = byte_stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                    if event.event_type == "content_block_delta" {
                        if let Some(delta) = event.delta {
                            if delta.delta_type == "text_delta" {
                                if let Some(text) = delta.text {
                                    full_text.push_str(&text);
                                    app_handle
                                        .emit("anthropic-stream-chunk", &text)
                                        .map_err(|e| e.to_string())?;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}
