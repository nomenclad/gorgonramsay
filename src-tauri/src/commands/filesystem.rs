use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct ReportFile {
    pub filename: String,
    pub path: String,
    pub modified_timestamp: u64,
    pub file_type: String, // "character" or "inventory"
}

/// Auto-detect the Project Gorgon Reports folder based on the current OS.
#[tauri::command]
pub fn detect_pg_path() -> Result<Option<String>, String> {
    let reports_path = get_platform_reports_path();

    match reports_path {
        Some(path) if path.exists() && path.is_dir() => {
            Ok(Some(path.to_string_lossy().to_string()))
        }
        _ => Ok(None),
    }
}

/// List all JSON report files in the given Reports directory.
/// Returns files sorted by modified time descending (newest first).
/// Character files match `Character_*.json`, inventory files match `*_items_*.json`.
#[tauri::command]
pub fn list_report_files(reports_path: String) -> Result<Vec<ReportFile>, String> {
    let dir = PathBuf::from(&reports_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Reports directory does not exist: {}", reports_path));
    }

    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<ReportFile> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let filename = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };

        if !filename.ends_with(".json") {
            continue;
        }

        let file_type = classify_file(&filename);
        if file_type.is_none() {
            continue;
        }

        let metadata = fs::metadata(&path)
            .map_err(|e| format!("Failed to read metadata for {}: {}", filename, e))?;

        let modified_timestamp = metadata
            .modified()
            .map_err(|e| format!("Failed to get modified time: {}", e))?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs();

        files.push(ReportFile {
            filename,
            path: path.to_string_lossy().to_string(),
            modified_timestamp,
            file_type: file_type.unwrap().to_string(),
        });
    }

    // Sort by modified time descending (newest first)
    files.sort_by(|a, b| b.modified_timestamp.cmp(&a.modified_timestamp));

    Ok(files)
}

/// Read a file and return its contents as a String.
#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file {}: {}", path, e))
}

/// Return the path to a local CDN data directory if it exists.
/// Checks common locations like `~/Documents/gorgon jsons/`.
#[tauri::command]
pub fn get_cdn_data_path() -> Result<Option<String>, String> {
    if let Some(docs_dir) = dirs::document_dir() {
        let candidates = [
            docs_dir.join("gorgon jsons"),
            docs_dir.join("gorgon-jsons"),
            docs_dir.join("ProjectGorgon"),
        ];

        for candidate in &candidates {
            if candidate.exists() && candidate.is_dir() {
                return Ok(Some(candidate.to_string_lossy().to_string()));
            }
        }
    }

    Ok(None)
}

/// Classify a filename as "character" or "inventory", or None if it doesn't match.
fn classify_file(filename: &str) -> Option<&'static str> {
    if filename.starts_with("Character_") && filename.ends_with(".json") {
        Some("character")
    } else if filename.contains("_items_") && filename.ends_with(".json") {
        Some("inventory")
    } else {
        None
    }
}

/// Get the platform-specific path for PG Reports.
fn get_platform_reports_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|home| {
            home.join("Library")
                .join("Application Support")
                .join("unity.Elder Game.Project Gorgon")
                .join("Reports")
        })
    }

    #[cfg(target_os = "windows")]
    {
        // AppData\LocalLow is not directly available via dirs crate.
        // It is typically at C:\Users\{user}\AppData\LocalLow.
        // We derive it from the home directory.
        dirs::home_dir().map(|home| {
            home.join("AppData")
                .join("LocalLow")
                .join("Elder Game")
                .join("Project Gorgon")
                .join("Reports")
        })
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}
