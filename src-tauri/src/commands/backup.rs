use crate::database::DbState;
use rusqlite::Connection;
use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager, State};

const BACKUP_DIR_NAME: &str = "backups/text";
const BACKUP_FILE_PREFIX: &str = "text-backup-";
const BACKUP_FILE_SUFFIX: &str = ".csv";
const BACKUP_RETENTION_DAYS: u64 = 14;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextBackupResult {
    backup_date: String,
    backup_dir: String,
    backup_path: String,
    pruned_count: usize,
    row_count: usize,
}

#[tauri::command]
pub fn get_text_backup_directory(app: AppHandle) -> Result<String, String> {
    let dir = ensure_backup_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_text_backup_directory(app: AppHandle) -> Result<(), String> {
    let dir = ensure_backup_dir(&app)?;
    open_path_in_file_manager(&dir)
}

#[tauri::command]
pub fn export_text_backup(
    app: AppHandle,
    state: State<'_, DbState>,
    backup_date: String,
) -> Result<TextBackupResult, String> {
    let backup_dir = ensure_backup_dir(&app)?;
    let backup_date = sanitize_backup_date(&backup_date);
    let backup_path = backup_dir.join(format!(
        "{}{}{}",
        BACKUP_FILE_PREFIX, backup_date, BACKUP_FILE_SUFFIX
    ));

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (csv, row_count) = build_backup_csv(&conn)?;
    drop(conn);

    let mut file = File::create(&backup_path).map_err(|e| e.to_string())?;
    file.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;
    let pruned_count = prune_old_backups(&backup_dir)?;

    Ok(TextBackupResult {
        backup_date,
        backup_dir: backup_dir.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        pruned_count,
        row_count,
    })
}

fn ensure_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(BACKUP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn sanitize_backup_date(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .filter(|ch| ch.is_ascii_digit() || *ch == '-')
        .collect();

    if sanitized.is_empty() {
        "backup".to_string()
    } else {
        sanitized
    }
}

fn open_path_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(path);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(path);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(path);
        cmd
    };

    let status = command.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to open backup folder: {}", status))
    }
}

fn build_backup_csv(conn: &Connection) -> Result<(String, usize), String> {
    let mut csv = String::from(
        "record_type,id,meeting_id,meeting_title,audio_file_id,transcription_id,title,content,content_format,section,color,from_pos,to_pos,entry_date,date_from,date_to,entry_ids,model_used,prompt_used,created_at,updated_at\n",
    );
    let mut row_count = 0usize;

    {
        let mut stmt = conn
            .prepare("SELECT id, title, created_at, updated_at FROM meetings ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, title, created_at, updated_at) = row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "meeting".to_string(),
                    id,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    title,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    optional_i64_to_string(created_at),
                    optional_i64_to_string(updated_at),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.meeting_id, m.title, t.audio_file_id, t.content, t.content_format, t.model_used, t.created_at
                 FROM transcriptions t
                 JOIN meetings m ON m.id = t.meeting_id
                 ORDER BY t.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, meeting_id, meeting_title, audio_file_id, content, content_format, model_used, created_at) =
                row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "transcription".to_string(),
                    id,
                    meeting_id,
                    meeting_title,
                    audio_file_id,
                    String::new(),
                    String::new(),
                    content,
                    content_format,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    model_used,
                    String::new(),
                    optional_i64_to_string(created_at),
                    String::new(),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.meeting_id, m.title, s.transcription_id, s.content, s.content_format, s.model_used, s.prompt_used, s.created_at
                 FROM summaries s
                 JOIN meetings m ON m.id = s.meeting_id
                 ORDER BY s.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (
                id,
                meeting_id,
                meeting_title,
                transcription_id,
                content,
                content_format,
                model_used,
                prompt_used,
                created_at,
            ) = row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "summary".to_string(),
                    id,
                    meeting_id,
                    meeting_title,
                    String::new(),
                    transcription_id,
                    String::new(),
                    content,
                    content_format,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    model_used,
                    prompt_used,
                    optional_i64_to_string(created_at),
                    String::new(),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT h.id, h.meeting_id, m.title, h.section, h.color, h.text_content, h.from_pos, h.to_pos, h.created_at
                 FROM highlights h
                 JOIN meetings m ON m.id = h.meeting_id
                 ORDER BY h.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, meeting_id, meeting_title, section, color, content, from_pos, to_pos, created_at) =
                row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "highlight".to_string(),
                    id,
                    meeting_id,
                    meeting_title,
                    String::new(),
                    String::new(),
                    String::new(),
                    content,
                    String::new(),
                    section,
                    color,
                    from_pos.to_string(),
                    to_pos.to_string(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    optional_i64_to_string(created_at),
                    String::new(),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, content_format, entry_date, created_at, updated_at
                 FROM contribution_entries
                 ORDER BY entry_date DESC, created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, content, content_format, entry_date, created_at, updated_at) =
                row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "contribution_entry".to_string(),
                    id,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    content,
                    content_format,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    entry_date,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    optional_i64_to_string(created_at),
                    optional_i64_to_string(updated_at),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, date_from, date_to, entry_ids, created_at, updated_at
                 FROM contribution_summaries
                 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, content, date_from, date_to, entry_ids, created_at, updated_at) =
                row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "contribution_summary".to_string(),
                    id,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    content,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    date_from,
                    date_to,
                    entry_ids,
                    String::new(),
                    String::new(),
                    optional_i64_to_string(created_at),
                    optional_i64_to_string(updated_at),
                ],
            );
            row_count += 1;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, content_format, date_from, date_to, entry_ids, created_at, updated_at
                 FROM contribution_todos
                 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (id, content, content_format, date_from, date_to, entry_ids, created_at, updated_at) =
                row.map_err(|e| e.to_string())?;
            append_csv_row(
                &mut csv,
                &[
                    "contribution_todo".to_string(),
                    id,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    content,
                    content_format,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    date_from,
                    date_to,
                    entry_ids,
                    String::new(),
                    String::new(),
                    optional_i64_to_string(created_at),
                    optional_i64_to_string(updated_at),
                ],
            );
            row_count += 1;
        }
    }

    Ok((csv, row_count))
}

fn prune_old_backups(dir: &Path) -> Result<usize, String> {
    let now = SystemTime::now();
    let max_age = Duration::from_secs(BACKUP_RETENTION_DAYS * 24 * 60 * 60);
    let mut pruned_count = 0usize;

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !matches_backup_file(&path) {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified_at = metadata
            .modified()
            .or_else(|_| metadata.created())
            .unwrap_or(now);

        if now.duration_since(modified_at).unwrap_or_default() > max_age {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
            pruned_count += 1;
        }
    }

    Ok(pruned_count)
}

fn matches_backup_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.starts_with(BACKUP_FILE_PREFIX) && name.ends_with(BACKUP_FILE_SUFFIX)
        })
        .unwrap_or(false)
}

fn append_csv_row(csv: &mut String, values: &[String]) {
    let escaped = values.iter().map(|value| csv_escape(value)).collect::<Vec<_>>();
    csv.push_str(&escaped.join(","));
    csv.push('\n');
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn optional_i64_to_string(value: Option<i64>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}
