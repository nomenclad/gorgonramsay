const VERSION_URL: &str = "http://client.projectgorgon.com/fileversion.txt";
const CDN_BASE: &str = "https://cdn.projectgorgon.com";

/// Fetch the current game data version number from the Project Gorgon version server.
/// Returns the integer version (e.g. 465).
#[tauri::command]
pub async fn fetch_cdn_version() -> Result<u32, String> {
    let response = reqwest::get(VERSION_URL)
        .await
        .map_err(|e| format!("Failed to reach version server: {}", e))?;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read version response: {}", e))?;

    text.trim()
        .parse::<u32>()
        .map_err(|_| format!("Could not parse version number: '{}'", text.trim()))
}

/// Download a single CDN data file for the given version.
/// Returns the raw JSON string.
///
/// Example: `fetch_cdn_file(465, "items.json")` downloads
/// `https://cdn.projectgorgon.com/v465/data/items.json`
#[tauri::command]
pub async fn fetch_cdn_file(version: u32, filename: String) -> Result<String, String> {
    if filename.is_empty() {
        return Err("Filename must not be empty".to_string());
    }

    let url = format!("{}/v{}/data/{}", CDN_BASE, version, filename);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", filename, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} when downloading {} from {}",
            response.status(),
            filename,
            url
        ));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read {} content: {}", filename, e))
}

/// Construct the full CDN URL for a given version and filename (utility, kept for compatibility).
#[tauri::command]
pub fn get_cdn_url(version: u32, filename: String) -> Result<String, String> {
    if filename.is_empty() {
        return Err("Filename must not be empty".to_string());
    }
    Ok(format!("{}/v{}/data/{}", CDN_BASE, version, filename))
}
