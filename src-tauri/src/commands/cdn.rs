/// Construct the full CDN URL for a given version and filename.
///
/// Example: `get_cdn_url(500, "items.json")` returns
/// `"https://cdn.projectgorgon.com/v500/items.json"`.
#[tauri::command]
pub fn get_cdn_url(version: u32, filename: String) -> Result<String, String> {
    if filename.is_empty() {
        return Err("Filename must not be empty".to_string());
    }
    Ok(format!(
        "https://cdn.projectgorgon.com/v{}/{}",
        version, filename
    ))
}
