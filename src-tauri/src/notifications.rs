use std::process::Command;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2_foundation::NSBundle;
use objc2_user_notifications::{UNAuthorizationStatus, UNNotificationSettings, UNUserNotificationCenter};
use tauri::AppHandle;

fn permission() -> &'static str {
    if !NSBundle::mainBundle().bundlePath().to_string().ends_with(".app") {
        return "unknown";
    }
    let (tx, rx) = mpsc::channel();
    let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let _ = tx.send(unsafe { settings.as_ref() }.authorizationStatus());
    });
    UNUserNotificationCenter::currentNotificationCenter().getNotificationSettingsWithCompletionHandler(&handler);
    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok(status) if status == UNAuthorizationStatus::Denied => "denied",
        Ok(status) if status == UNAuthorizationStatus::NotDetermined => "not-determined",
        Ok(_) => "allowed",
        Err(_) => "unknown",
    }
}

#[tauri::command]
pub async fn notification_permission() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| permission().to_string())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_notification_settings(app: AppHandle) -> Result<(), String> {
    let url = format!("x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={}", app.config().identifier);
    tauri::async_runtime::spawn_blocking(move || Command::new("/usr/bin/open").arg(url).status())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
        .map(|_| ())
}
