use crate::database::DbState;
use rusqlite::types::Value;
use serde_json::json;
use tauri::State;

fn json_to_sqlite_value(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                Value::Null
            }
        }
        serde_json::Value::String(s) => Value::Text(s.clone()),
        _ => Value::Text(v.to_string()),
    }
}

#[tauri::command]
pub fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<serde_json::Value>,
    method: String,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let sqlite_params: Vec<Value> = params.iter().map(json_to_sqlite_value).collect();
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let column_count = stmt.column_count();
    let column_names: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    let rows: Vec<serde_json::Value> = stmt
        .query_map(params_refs.as_slice(), |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val: Value = row.get(i)?;
                let json_val = match val {
                    Value::Null => serde_json::Value::Null,
                    Value::Integer(n) => json!(n),
                    Value::Real(f) => json!(f),
                    Value::Text(s) => json!(s),
                    Value::Blob(b) => json!(b),
                };
                obj.insert(name.clone(), json_val);
            }
            Ok(serde_json::Value::Object(obj))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if method == "get" {
        Ok(rows.into_iter().next().unwrap_or(serde_json::Value::Null))
    } else {
        Ok(json!(rows))
    }
}

#[tauri::command]
pub fn db_run(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let sqlite_params: Vec<Value> = params.iter().map(json_to_sqlite_value).collect();
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    // For INSERT/UPDATE/DELETE that may have RETURNING clause, we need to
    // check if there are results to return
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_count = stmt.column_count();

    if column_count > 0 {
        // This is a statement with RETURNING clause — return the rows
        let column_names: Vec<String> = (0..column_count)
            .map(|i| stmt.column_name(i).unwrap_or("").to_string())
            .collect();

        let rows: Vec<serde_json::Value> = stmt
            .query_map(params_refs.as_slice(), |row| {
                let mut obj = serde_json::Map::new();
                for (i, name) in column_names.iter().enumerate() {
                    let val: Value = row.get(i)?;
                    let json_val = match val {
                        Value::Null => serde_json::Value::Null,
                        Value::Integer(n) => json!(n),
                        Value::Real(f) => json!(f),
                        Value::Text(s) => json!(s),
                        Value::Blob(b) => json!(b),
                    };
                    obj.insert(name.clone(), json_val);
                }
                Ok(serde_json::Value::Object(obj))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(json!(rows))
    } else {
        let changes = stmt
            .execute(params_refs.as_slice())
            .map_err(|e| e.to_string())?;
        Ok(json!({ "changes": changes }))
    }
}

#[tauri::command]
pub fn db_get_path(app: tauri::AppHandle) -> Result<String, String> {
    crate::database::get_db_path(&app)
}
