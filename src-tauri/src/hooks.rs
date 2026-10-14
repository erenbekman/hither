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
    tool_name: Option<String>,
    #[serde(skip_deserializing)]
    agent: Option<String>,
    #[serde(skip_deserializing)]
    terminal: Option<String>,
    #[serde(skip_deserializing)]
    terminal_session: Option<String>,
}

#[derive(Default)]
pub struct Listener {
    token: Arc<Mutex<String>>,
    running: Mutex<bool>,
}

fn plain(value: &str, extra: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.len() <= 64 && value.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c) || extra.contains(c)))
        .then(|| value.to_string())
}

fn terminal_name(value: &str) -> Option<String> {
    plain(value, "")
}

fn header(request: &tiny_http::Request, name: &'static str) -> Option<String> {
    request.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str().to_string())
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
                Ok(mut event) => {
                    event.terminal = header(&request, "X-Hither-Terminal").and_then(|v| terminal_name(&v));
                    event.terminal_session = header(&request, "X-Hither-Terminal-Session").and_then(|v| plain(&v, ":"));
                    event.agent = header(&request, "X-Hither-Agent").filter(|v| v == "codex");
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

fn config_path(agent: &str) -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    match agent {
        "claude" => Ok(Path::new(&home).join(".claude/settings.json")),
        "codex" => {
            let dir = Path::new(&home).join(".codex");
            dir.is_dir().then(|| dir.join("hooks.json")).ok_or_else(|| "Codex is not installed".to_string())
        }
        _ => Err(format!("unknown agent {agent}")),
    }
}

fn write_with_backup(path: &Path, content: &str, stamp: u64) -> std::io::Result<Option<PathBuf>> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mode = fs::metadata(path).map(|m| m.permissions().mode() & 0o600).unwrap_or(0o600);
    let backup = if path.exists() {
        let backup = path.with_file_name(format!("{name}.hither-backup-{stamp}"));
        fs::copy(path, &backup)?;
        Some(backup)
    } else {
        if let Some(dir) = path.parent() {
            fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
        }
        None
    };
    let temp = path.with_file_name(format!("{name}.hither-tmp"));
    let _ = fs::remove_file(&temp);
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&temp)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    fs::set_permissions(&temp, fs::Permissions::from_mode(mode))?;
    fs::rename(&temp, path)?;
    Ok(backup)
}

#[tauri::command]
pub fn agent_config_read(agent: String) -> Result<Option<String>, String> {
    match fs::read_to_string(config_path(&agent)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn agent_config_write(agent: String, content: String) -> Result<Option<String>, String> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    write_with_backup(&config_path(&agent)?, &content, stamp)
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
    fn keeps_iterm_session_ids_and_names_backups_after_the_file() {
        assert_eq!(plain("w0t1p0:9A6B1C2D-0000-4000-8000-ABCDEFABCDEF", ":").as_deref(), Some("w0t1p0:9A6B1C2D-0000-4000-8000-ABCDEFABCDEF"));
        assert_eq!(plain("w0t1p0:x; rm", ":"), None);
        let dir = std::env::temp_dir().join(format!("hither-test-codex-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hooks.json");
        fs::write(&path, "{}").unwrap();
        let backup = write_with_backup(&path, "{\"hooks\":{}}", 7).unwrap().unwrap();
        assert!(backup.ends_with("hooks.json.hither-backup-7"));
    }

    #[test]
    fn keeps_only_plain_terminal_names() {
        assert_eq!(terminal_name(" iTerm.app "), Some("iTerm.app".to_string()));
        assert_eq!(terminal_name("Apple_Terminal"), Some("Apple_Terminal".to_string()));
        assert_eq!(terminal_name(""), None);
        assert_eq!(terminal_name("$TERM_PROGRAM"), None);
        assert_eq!(terminal_name("a b"), None);
        assert_eq!(terminal_name(&"x".repeat(65)), None);
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
