mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::detect_pg_path,
            commands::filesystem::list_report_files,
            commands::filesystem::read_file_content,
            commands::filesystem::get_cdn_data_path,
            commands::cdn::get_cdn_url,
            commands::cdn::fetch_cdn_version,
            commands::cdn::fetch_cdn_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
