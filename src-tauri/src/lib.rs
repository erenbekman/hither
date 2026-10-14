mod gh;
mod process;
mod hooks;
mod instance;
mod launch;
mod login;
mod secret;

use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

const PANEL: &str = "panel";
const SETTINGS: &str = "settings";
const TRAY: &str = "main";
const REOPEN_GUARD: Duration = Duration::from_millis(250);

struct LastHidden(Mutex<Option<Instant>>);

fn toggle_panel(app: &AppHandle) {
    let Some(panel) = app.get_webview_window(PANEL) else { return };
    if panel.is_visible().unwrap_or(false) {
        let _ = panel.hide();
        return;
    }
    let just_hidden = app
        .state::<LastHidden>()
        .0
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < REOPEN_GUARD);
    if !just_hidden {
        show_panel(app);
    }
}

fn show_panel(app: &AppHandle) {
    let Some(panel) = app.get_webview_window(PANEL) else { return };
    let _ = panel.move_window_constrained(Position::TrayBottomCenter);
    let _ = panel.show();
    let _ = panel.set_focus();
}

#[tauri::command]
fn reveal_panel(app: AppHandle) {
    show_panel(&app);
}

#[tauri::command]
fn open_settings_window(app: AppHandle) {
    open_settings(&app);
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
fn set_badge(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id(TRAY) {
        let _ = tray.set_title((count > 0).then(|| format!(" {count}")));
    }
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refusing to open {url}"));
    }
    tauri::async_runtime::spawn_blocking(move || Command::new("/usr/bin/open").arg(url).status())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
        .map(|_| ())
}

fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::default())
        .title("Hither Settings")
        .inner_size(520.0, 480.0)
        .min_inner_size(520.0, 360.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .focused(true)
        .build();
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("Cmd+,"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hither", true, Some("Cmd+Q"))?;
    let menu = Menu::with_items(app, &[&settings, &quit])?;

    TrayIconBuilder::with_id(TRAY)
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template@2x.png"))?)
        .icon_as_template(true)
        .tooltip("Hither")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            tauri_plugin_positioner::on_tray_event(app, &event);
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_panel(app);
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(LastHidden(Mutex::new(None)))
        .manage(hooks::Listener::default())
        .invoke_handler(tauri::generate_handler![
            gh::gh_token,
            secret::secret_get,
            secret::secret_set,
            secret::secret_delete,
            reveal_panel,
            set_badge,
            restart_app,
            open_settings_window,
            open_url,
            hooks::start_hook_listener,
            hooks::claude_settings_read,
            hooks::claude_settings_write,
            launch::git_repo,
            launch::launch_claude,
            launch::claude_print,
            launch::focus_terminal,
            launch::sync_templates,
            launch::open_templates,
            login::launch_at_login,
            login::set_launch_at_login,
        ])
        .setup(|app| {
            match instance::acquire(&app.path().app_data_dir()?)? {
                Some(lock) => {
                    app.manage(lock);
                }
                None => std::process::exit(0),
            }
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            setup_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != PANEL {
                return;
            }
            match event {
                WindowEvent::Focused(false) => {
                    let _ = window.hide();
                    *window.state::<LastHidden>().0.lock().unwrap() = Some(Instant::now());
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Hither");
}
