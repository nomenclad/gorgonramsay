/// Open a URL in the system's default browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    opener::open(&url).map_err(|e| e.to_string())
}
