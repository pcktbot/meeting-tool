import { invoke } from "@tauri-apps/api/core";

export async function initializeSchema(): Promise<void> {
  // Schema is initialized by the Rust backend on app startup.
  // This call verifies the database is ready.
  await invoke("db_get_path");
}
