CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Meeting',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  duration INTEGER
);

CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  format TEXT NOT NULL,
  duration INTEGER,
  size_bytes INTEGER,
  waveform_peaks TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  audio_file_id TEXT NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'plain',
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  transcription_id TEXT NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'plain',
  model_used TEXT NOT NULL,
  prompt_used TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  source_id TEXT NOT NULL,
  color TEXT NOT NULL,
  text_content TEXT NOT NULL,
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_meeting_id ON highlights(meeting_id);
CREATE INDEX IF NOT EXISTS idx_highlights_source_id ON highlights(source_id);
