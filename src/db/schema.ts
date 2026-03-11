import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const meetings = sqliteTable("meetings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull().default("Untitled Meeting"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  duration: integer("duration"),
});

export const audioFiles = sqliteTable("audio_files", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  format: text("format").notNull(),
  duration: integer("duration"),
  sizeBytes: integer("size_bytes"),
  waveformPeaks: text("waveform_peaks"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const transcriptions = sqliteTable("transcriptions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  audioFileId: text("audio_file_id")
    .notNull()
    .references(() => audioFiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  modelUsed: text("model_used").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const summaries = sqliteTable("summaries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  transcriptionId: text("transcription_id")
    .notNull()
    .references(() => transcriptions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  modelUsed: text("model_used").notNull(),
  promptUsed: text("prompt_used").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const highlights = sqliteTable("highlights", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  sourceId: text("source_id").notNull(),
  color: text("color").notNull(),
  textContent: text("text_content").notNull(),
  fromPos: integer("from_pos").notNull(),
  toPos: integer("to_pos").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});
