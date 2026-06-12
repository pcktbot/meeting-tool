use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

// The MSAL token cache lives in the app-data dir, not the repo.
fn cache_path(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ms-auth-cache.json").to_string_lossy().to_string())
}

async fn run_sidecar(app: &AppHandle, mut args: Vec<String>) -> Result<String, String> {
    args.push("--cache".into());
    args.push(cache_path(app)?);

    let output = app
        .shell()
        .sidecar("ms-auth")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // The sidecar prints a JSON body even on a non-zero exit (e.g.
    // interaction_required). Return it so the frontend can branch on `.error`.
    if !stdout.is_empty() {
        Ok(stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub async fn ms_auth_token(app: AppHandle) -> Result<String, String> {
    run_sidecar(&app, vec!["token".into()]).await
}

#[tauri::command]
pub async fn ms_auth_login(app: AppHandle, device_code: bool) -> Result<String, String> {
    let mut args = vec!["login".into()];
    if device_code {
        args.push("--device-code".into());
    }
    run_sidecar(&app, args).await
}

#[tauri::command]
pub async fn ms_auth_status(app: AppHandle) -> Result<String, String> {
    run_sidecar(&app, vec!["status".into()]).await
}
