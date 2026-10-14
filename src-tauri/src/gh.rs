use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

const KNOWN_PATHS: [&str; 2] = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
const WATCHDOG: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GhError {
    GhNotFound,
    GhNotAuthenticated,
    GhTimeout,
}

fn locate(is_executable: impl Fn(&str) -> bool, path_env: Option<&str>) -> Option<String> {
    if let Some(known) = KNOWN_PATHS.iter().find(|p| is_executable(p)) {
        return Some(known.to_string());
    }
    path_env?
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| format!("{dir}/gh"))
        .find(|candidate| is_executable(candidate))
}

fn is_executable(path: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    Path::new(path)
        .metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

fn read_token() -> Result<String, GhError> {
    let path_env = std::env::var("PATH").ok();
    let executable = locate(is_executable, path_env.as_deref()).ok_or(GhError::GhNotFound)?;
    let mut command = Command::new(executable);
    command.args(["auth", "token", "--hostname", "github.com"]);
    run(command, WATCHDOG)
}

fn run(mut command: Command, watchdog: Duration) -> Result<String, GhError> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| GhError::GhNotFound)?;

    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        buf
    });
    thread::spawn(move || {
        let _ = std::io::copy(&mut stderr, &mut std::io::sink());
    });

    let started = Instant::now();
    let status = loop {
        if let Ok(Some(status)) = child.try_wait() {
            break status;
        }
        if started.elapsed() >= watchdog {
            let _ = child.kill();
            let _ = child.wait();
            return Err(GhError::GhTimeout);
        }
        thread::sleep(Duration::from_millis(50));
    };

    let token = out.join().unwrap_or_default().trim().to_string();
    if !status.success() || token.is_empty() {
        return Err(GhError::GhNotAuthenticated);
    }
    Ok(token)
}

#[tauri::command]
pub async fn gh_token() -> Result<String, GhError> {
    tauri::async_runtime::spawn_blocking(read_token)
        .await
        .unwrap_or(Err(GhError::GhNotFound))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_known_paths_over_path() {
        let found = locate(|p| p == "/usr/local/bin/gh" || p == "/x/gh", Some("/x"));
        assert_eq!(found.as_deref(), Some("/usr/local/bin/gh"));
    }

    #[test]
    fn falls_back_to_path() {
        let found = locate(|p| p == "/custom/bin/gh", Some("/usr/bin:/custom/bin"));
        assert_eq!(found.as_deref(), Some("/custom/bin/gh"));
    }

    #[test]
    fn none_when_missing() {
        assert_eq!(locate(|_| false, Some("/usr/bin:/bin")), None);
        assert_eq!(locate(|_| false, None), None);
    }

    #[test]
    fn trims_token_on_success() {
        let mut command = Command::new("/bin/echo");
        command.arg("  gho_test  ");
        assert_eq!(run(command, WATCHDOG), Ok("gho_test".to_string()));
    }

    #[test]
    fn non_zero_exit_is_not_authenticated() {
        assert_eq!(run(Command::new("/usr/bin/false"), WATCHDOG), Err(GhError::GhNotAuthenticated));
    }

    #[test]
    fn empty_output_is_not_authenticated() {
        assert_eq!(run(Command::new("/usr/bin/true"), WATCHDOG), Err(GhError::GhNotAuthenticated));
    }

    #[test]
    fn watchdog_kills_a_hanging_gh() {
        let mut command = Command::new("/bin/sleep");
        command.arg("10");
        let started = Instant::now();
        assert_eq!(run(command, Duration::from_millis(200)), Err(GhError::GhTimeout));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
