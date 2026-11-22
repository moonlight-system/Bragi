// the transfer server only exists on desktop: the phone is always the client
#[cfg(desktop)]
mod transfer_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    let builder = builder
        .manage(transfer_server::TransferState::default())
        .invoke_handler(tauri::generate_handler![
            transfer_server::transfer_start,
            transfer_server::transfer_stop,
            transfer_server::transfer_clear_incoming,
        ]);

    builder
        .setup(|app| {
            // the updater only exists on desktop: phones update through the store
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}