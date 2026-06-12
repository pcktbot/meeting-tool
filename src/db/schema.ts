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
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
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

export const contributionEntries = sqliteTable("contribution_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  audioFilePath: text("audio_file_path"),
  audioDuration: integer("audio_duration"),
  audioSizeBytes: integer("audio_size_bytes"),
  audioExpiresAt: integer("audio_expires_at", { mode: "timestamp" }),
  audioDeletedAt: integer("audio_deleted_at", { mode: "timestamp" }),
  ttsAudioFilePath: text("tts_audio_file_path"),
  entryDate: text("entry_date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const contributionHighlights = sqliteTable("contribution_highlights", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contributionEntryId: text("contribution_entry_id")
    .notNull()
    .references(() => contributionEntries.id, { onDelete: "cascade" }),
  color: text("color").notNull(),
  textContent: text("text_content").notNull(),
  fromPos: integer("from_pos").notNull(),
  toPos: integer("to_pos").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const contributionSummaries = sqliteTable("contribution_summaries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  content: text("content").notNull(),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  entryIds: text("entry_ids").notNull().default("[]"),
  ttsAudioFilePath: text("tts_audio_file_path"),
  ttsAudioDuration: integer("tts_audio_duration"),
  ttsAudioSizeBytes: integer("tts_audio_size_bytes"),
  ttsAudioExpiresAt: integer("tts_audio_expires_at", { mode: "timestamp" }),
  ttsAudioDeletedAt: integer("tts_audio_deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const contributionTodos = sqliteTable("contribution_todos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  entryIds: text("entry_ids").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const teamsChatMessages = sqliteTable("teams_chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  graphMessageId: text("graph_message_id").notNull(),
  chatId: text("chat_id").notNull(),
  chatType: text("chat_type").notNull(),
  chatTopic: text("chat_topic"),
  chatWebUrl: text("chat_web_url"),
  messageWebUrl: text("message_web_url"),
  fromUserId: text("from_user_id"),
  fromDisplayName: text("from_display_name"),
  bodyText: text("body_text").notNull(),
  bodyHtml: text("body_html"),
  createdDateTime: text("created_date_time").notNull(),
  importedAt: integer("imported_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  contributionEntryId: text("contribution_entry_id").references(
    () => contributionEntries.id,
    { onDelete: "set null" },
  ),
});
