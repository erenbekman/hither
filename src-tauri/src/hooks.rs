use std::fs;
use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Method, Response, Server};

pub const PORT: u16 = 47811;
const MAX_BODY: u64 = 8 * 1024 * 1024;

#[derive(Deserialize, Serialize, Clone)]
struct HookEvent {
    session_id: String,
    hook_event_name: String,
    cwd: Option<String>,
    notification_type: Option<String>,
    message: Option<String>,
    title: Option<String>,
    error: Option<String>,
    reason: Option<String>,
    source: Option<String>,
    session_title: Option<String>,
}

#[derive(Default)]
pub struct Listener {
    token: Arc<Mutex<String>>,
    running: Mutex<bool>,
}

fn serve(server: Server, token: Arc<Mutex<String>>, app: AppHandle) {
    for mut request in server.incoming_requests() {
        let expected = format!("Bearer {}", token.lock().unwrap());
        let authorized = request
            .headers()
            .iter()
            .any(|h| h.field.equiv("Authorization") && h.value.as_str() == expected);
        let status = if request.method() != &Method::Post || request.url() != "/hook" {
            404
        } else if !authorized {
            401
        } else {
            let mut body = Vec::new();
            let _ = request.as_reader().take(MAX_BODY).read_to_end(&mut body);
            match serde_json::from_slice::<HookEvent>(&body) {
                Ok(event) => {
                    let _ = app.emit("agent-event", event);
                    200
                }
                Err(_) => 400,
            }
        };
        let _ = request.respond(Response::empty(status));
    }
}

#[tauri::command]
pub fn start_hook_listener(app: AppHandle, listener: State<Listener>, token: String) -> Result<u16, String> {
    *listener.token.lock().unwrap() = token;
    let mut running = listener.running.lock().unwrap();
    if !*running {
        let server = Server::http(("127.0.0.1", PORT)).map_err(|e| format!("port {PORT} is busy: {e}"))?;
        let token = listener.token.clone();
        thread::spawn(move || serve(server, token, app));
        *running = true;
    }
    Ok(PORT)
}

fn settings_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(Path::new(&home).join(".claude/settings.json"))
}

fn write_with_backup(path: &Path, content: &str, stamp: u64) -> std::io::Result<Option<PathBuf>> {
    let mode = fs::metadata(path).map(|m| m.permissions().mode() & 0o600).unwrap_or(0o600);
    let backup = if path.exists() {
        let backup = path.with_file_name(format!("settings.json.hither-backup-{stamp}"));
        fs::copy(path, &backup)?;
        Some(backup)
    } else {
        if let Some(dir) = path.parent() {
            fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
        }
        None
    };
    let temp = path.with_file_name("settings.json.hither-tmp");
    let _ = fs::remove_file(&temp);
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&temp)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    fs::set_permissions(&temp, fs::Permissions::from_mode(mode))?;
    fs::rename(&temp, path)?;
    Ok(backup)
}

#[tauri::command]
pub fn claude_settings_read() -> Result<Option<String>, String> {
    match fs::read_to_string(settings_path()?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn claude_settings_write(content: String) -> Result<Option<String>, String> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    write_with_backup(&settings_path()?, &content, stamp)
        .map(|backup| backup.map(|p| p.display().to_string()))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hither-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(".claude/settings.json")
    }

    #[test]
    fn backs_up_before_replacing() {
        let path = scratch("backup");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{\"old\":true}").unwrap();
        let backup = write_with_backup(&path, "{\"new\":true}", 42).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{\"old\":true}");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"new\":true}");
        assert!(backup.ends_with("settings.json.hither-backup-42"));
    }

    #[test]
    fn creates_the_file_without_a_backup() {
        let path = scratch("create");
        assert_eq!(write_with_backup(&path, "{}", 1).unwrap(), None);
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(fs::metadata(path.parent().unwrap()).unwrap().permissions().mode() & 0o777, 0o700);
    }

    #[test]
    fn never_widens_permissions() {
        for (before, after) in [(0o600, 0o600), (0o644, 0o600), (0o400, 0o400)] {
            let path = scratch(&format!("mode-{before:o}"));
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, "{}").unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(before)).unwrap();
            write_with_backup(&path, "{\"a\":1}", 7).unwrap();
            assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, after);
        }
    }

    #[test]
    fn recovers_from_a_stale_temp_file() {
        let path = scratch("stale");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path.with_file_name("settings.json.hither-tmp"), "junk").unwrap();
        write_with_backup(&path, "{}", 3).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
    }

    #[test]
    fn keeps_only_the_fields_hither_uses() {
        let event: HookEvent = serde_json::from_str(
            r#"{"session_id":"s","hook_event_name":"UserPromptSubmit","cwd":"/x","prompt":"secret","tool_input":{"a":1}}"#,
        )
        .unwrap();
        let forwarded = serde_json::to_string(&event).unwrap();
        assert!(!forwarded.contains("secret"));
        assert!(!forwarded.contains("tool_input"));
    }
}
