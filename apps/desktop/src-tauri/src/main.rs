#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// OPTIONAL SCAFFOLD: native code has not been compiled or tested on this host.
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder, Manager};

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![quit])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Mochi / restore interaction", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Mochi", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Mochi", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            // Tray creation is required before the UI can hide or ignore mouse events.
            let tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Mochi desktop scaffold - untested native prototype")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" { app.exit(0); return; }
                    if let Some(window) = app.get_webview_window("main") {
                        let result = match event.id.as_ref() {
                            "show" => window.set_ignore_cursor_events(false)
                                .and_then(|_| window.show())
                                .and_then(|_| window.set_focus()),
                            "hide" => window.hide(),
                            _ => Ok(()),
                        };
                        if let Err(error) = result { eprintln!("Mochi window action failed: {error}"); }
                    }
                })
                .build(app)?;
            // TrayIcon is reference-counted: keep one handle alive for the entire application.
            app.manage(tray);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Mochi desktop scaffold could not start; check native prerequisites");
}
