use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperEngine {
    context: Option<WhisperContext>,
    model_name: String,
}

impl WhisperEngine {
    pub fn new() -> Self {
        Self {
            context: None,
            model_name: String::new(),
        }
    }

    pub fn load_model(&mut self, model_path: PathBuf, model_name: String) -> Result<(), String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path")?,
            params,
        )
        .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        self.context = Some(ctx);
        self.model_name = model_name;
        Ok(())
    }

    pub fn transcribe(&self, audio_data: &[f32]) -> Result<Vec<Segment>, String> {
        let ctx = self.context.as_ref().ok_or("Whisper model not loaded")?;

        let mut state = ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(true);
        params.set_n_threads(4);

        state
            .full(params, audio_data)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        let num_segments = state.full_n_segments();

        let mut segments = Vec::new();
        for i in 0..num_segments {
            let seg = state
                .get_segment(i)
                .ok_or_else(|| format!("Failed to get segment {}", i))?;

            let start = seg.start_timestamp();
            let end = seg.end_timestamp();
            let text = seg
                .to_str_lossy()
                .map_err(|e| format!("Failed to get segment text: {}", e))?;

            segments.push(Segment {
                start_ms: start * 10,
                end_ms: end * 10,
                text: text.trim().to_string(),
            });
        }

        Ok(segments)
    }

    pub fn is_loaded(&self) -> bool {
        self.context.is_some()
    }

    pub fn model_name(&self) -> &str {
        &self.model_name
    }
}

#[derive(serde::Serialize, Clone)]
pub struct Segment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}
