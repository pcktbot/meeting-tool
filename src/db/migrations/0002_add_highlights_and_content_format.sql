ALTER TABLE transcriptions ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain';

CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  source_id UUID NOT NULL,
  color TEXT NOT NULL,
  text_content TEXT NOT NULL,
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_highlights_meeting_id ON highlights(meeting_id);
CREATE INDEX IF NOT EXISTS idx_highlights_source_id ON highlights(source_id);
