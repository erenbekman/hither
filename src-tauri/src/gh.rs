use std::process::Command;
use std::time::Duration;

use serde::Serialize;

use crate::process::{is_executable, locate, run, RunError};

const WATCHDOG: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GhError {
    GhNotFound,
    GhNotAuthenticated,
    GhTimeout,
}

fn token_from(command: Command) -> Result<String, GhError> {
    let output = run(command, None, WATCHDOG).map_err(|e| match e {
        RunError::Spawn => GhError::GhNotFound,
        RunError::Timeout => GhError::GhTimeout,
    })?;
    let token = output.stdout.trim().to_string();
    if !output.success || token.is_empty() {
        return Err(GhError::GhNotAuthenticated);
    }
    Ok(token)
}

pub fn gh_path() -> Option<String> {
    let known = ["/opt/homebrew/bin/gh".to_string(), "/usr/local/bin/gh".to_string()];
    let path_env = std::env::var("PATH").ok();
    locate("gh", &known, is_executable, path_env.as_deref())
}

fn read_token() -> Result<String, GhError> {
    let mut command = Command::new(gh_path().ok_or(GhError::GhNotFound)?);
    command.args(["auth", "token", "--hostname", "github.com"]);
    token_from(command)
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
    fn trims_token_on_success() {
        let mut command = Command::new("/bin/echo");
        command.arg("  gho_test  ");
        assert_eq!(token_from(command), Ok("gho_test".to_string()));
    }

    #[test]
    fn non_zero_exit_is_not_authenticated() {
        assert_eq!(token_from(Command::new("/usr/bin/false")), Err(GhError::GhNotAuthenticated));
    }

    #[test]
    fn empty_output_is_not_authenticated() {
        assert_eq!(token_from(Command::new("/usr/bin/true")), Err(GhError::GhNotAuthenticated));
    }
}
