import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("Untitled Meeting"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  duration: integer("duration"),
});

export const audioFiles = pgTable("audio_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  format: text("format").notNull(),
  duration: integer("duration"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  waveformPeaks: text("waveform_peaks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transcriptions = pgTable("transcriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  audioFileId: uuid("audio_file_id")
    .notNull()
    .references(() => audioFiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const summaries = pgTable("summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  transcriptionId: uuid("transcription_id")
    .notNull()
    .references(() => transcriptions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plain"),
  modelUsed: text("model_used").notNull(),
  promptUsed: text("prompt_used").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const highlights = pgTable("highlights", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  sourceId: uuid("source_id").notNull(),
  color: text("color").notNull(),
  textContent: text("text_content").notNull(),
  fromPos: integer("from_pos").notNull(),
  toPos: integer("to_pos").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
