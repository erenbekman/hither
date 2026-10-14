use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::process::{is_executable, locate, run, RunError};

const TERMINALS: [&str; 4] = ["iTerm", "Terminal", "Ghostty", "Warp"];
const PRINT_TIMEOUT: Duration = Duration::from_secs(120);
const READ_ONLY_TOOLS: [&str; 6] = ["Read", "Grep", "Glob", "Bash(gh pr view:*)", "Bash(gh pr diff:*)", "Bash(gh run view:*)"];

fn terminal_app(name: &str) -> Result<&'static str, String> {
    TERMINALS.into_iter().find(|t| *t == name).ok_or_else(|| format!("{name} is not a supported terminal"))
}

fn home() -> Result<String, String> {
    std::env::var("HOME").map_err(|_| "HOME is not set".to_string())
}

fn child_path(home: &str) -> String {
    format!("{home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")
}

fn claude_path() -> Result<String, String> {
    let home = home()?;
    let known = [
        format!("{home}/.local/bin/claude"),
        format!("{home}/.claude/local/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ];
    let path_env = std::env::var("PATH").ok();
    locate("claude", &known, is_executable, path_env.as_deref()).ok_or_else(|| "Claude Code CLI not found".to_string())
}

fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

fn private_file(path: &Path, content: &str, mode: u32) -> std::io::Result<()> {
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(mode).open(path)?;
    file.write_all(content.as_bytes())
}

fn launcher(folder: &str, claude: &str, prompt: &Path, script: &Path) -> String {
    let prompt = quote(&prompt.display().to_string());
    let script = quote(&script.display().to_string());
    format!(
        "#!/bin/zsh -l\ncd -- {} || exit 1\nprompt=\"$(cat -- {prompt})\"\nrm -f -- {prompt} {script}\nexec {} \"$prompt\"\n",
        quote(folder),
        quote(claude)
    )
}

#[derive(Serialize)]
pub struct GitRepo {
    root: String,
    remote: String,
}

fn git(path: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new("/usr/bin/git");
    command.arg("-C").arg(path).args(args);
    let output = run(command, None, Duration::from_secs(5)).ok()?;
    let text = output.stdout.trim().to_string();
    (output.success && !text.is_empty()).then_some(text)
}

#[tauri::command]
pub async fn git_repo(path: String) -> Option<GitRepo> {
    tauri::async_runtime::spawn_blocking(move || {
        Some(GitRepo {
            root: git(&path, &["rev-parse", "--show-toplevel"])?,
            remote: git(&path, &["remote", "get-url", "origin"])?,
        })
    })
    .await
    .ok()
    .flatten()
}

fn check_folder(folder: &str) -> Result<(), String> {
    (Path::new(folder).is_absolute() && Path::new(folder).is_dir()).then_some(()).ok_or_else(|| format!("{folder} is not a folder"))
}

fn scratch_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("hither");
    fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn open_script(terminal: &str, script: &Path, text: &str) -> Result<(), String> {
    private_file(script, text, 0o700).map_err(|e| e.to_string())?;
    let status = Command::new("/usr/bin/open").args(["-a", terminal]).arg(script).status().map_err(|e| e.to_string())?;
    status.success().then_some(()).ok_or_else(|| format!("{terminal} could not be opened"))
}

fn checkout_script(folder: &str, gh: &str, number: u32, script: &Path) -> String {
    format!(
        "#!/bin/zsh -l\ncd -- {} || exit 1\nrm -f -- {}\n{} pr checkout {number}\nexec \"${{SHELL:-/bin/zsh}}\" -l\n",
        quote(folder),
        quote(&script.display().to_string()),
        quote(gh)
    )
}

#[tauri::command]
pub fn checkout_pr(folder: String, number: u32, terminal: String) -> Result<(), String> {
    let terminal = terminal_app(&terminal)?;
    check_folder(&folder)?;
    let gh = crate::gh::gh_path().ok_or_else(|| "GitHub CLI not found".to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let script = scratch_dir()?.join(format!("checkout-{stamp}.command"));
    open_script(terminal, &script, &checkout_script(&folder, &gh, number, &script))
}

#[tauri::command]
pub fn launch_claude(folder: String, prompt: String, attachment: Option<String>, terminal: String) -> Result<(), String> {
    let terminal = terminal_app(&terminal)?;
    check_folder(&folder)?;
    let claude = claude_path()?;
    let dir = scratch_dir()?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let prompt = match attachment {
        Some(text) => {
            let file = dir.join(format!("attachment-{stamp}.txt"));
            private_file(&file, &text, 0o600).map_err(|e| e.to_string())?;
            prompt.replace("{{attachment}}", &file.display().to_string())
        }
        None => prompt,
    };
    let prompt_file = dir.join(format!("prompt-{stamp}.md"));
    let script = dir.join(format!("launch-{stamp}.command"));
    private_file(&prompt_file, &prompt, 0o600).map_err(|e| e.to_string())?;
    open_script(terminal, &script, &launcher(&folder, &claude, &prompt_file, &script))
}

#[tauri::command]
pub async fn claude_print(folder: Option<String>, prompt: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = home()?;
        let mut command = Command::new(claude_path()?);
        command
            .args(["-p", "--output-format", "text", "--allowedTools"])
            .args(READ_ONLY_TOOLS)
            .current_dir(folder.filter(|f| Path::new(f).is_dir()).unwrap_or_else(|| std::env::temp_dir().display().to_string()))
            .env("PATH", child_path(&home));
        match run(command, Some(prompt), PRINT_TIMEOUT) {
            Ok(output) if output.success => Ok(output.stdout.trim().to_string()),
            Ok(output) => Err(output.stderr.lines().last().unwrap_or("claude -p failed").to_string()),
            Err(RunError::Timeout) => Err("Claude did not answer within 2 minutes".to_string()),
            Err(RunError::Spawn) => Err("Claude Code CLI could not start".to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

const ITERM_FOCUS: &str = r#"on run argv
  set target to item 1 of argv
  tell application id "com.googlecode.iterm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if unique id of s is target then
            select w
            tell t to select
            tell s to select
            activate
            return
          end if
        end repeat
      end repeat
    end repeat
  end tell
  error "no such session"
end run"#;

const GHOSTTY_FOCUS: &str = r#"on run argv
  set target to item 1 of argv
  tell application id "com.mitchellh.ghostty"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with term in terminals of t
          if working directory of term is target then
            focus term
            activate
            return
          end if
        end repeat
      end repeat
    end repeat
  end tell
  error "no such terminal"
end run"#;

fn iterm_session(value: &str) -> Option<String> {
    let id = value.rsplit(':').next()?;
    (id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')).then(|| id.to_string())
}

fn focus_script(terminal: &str, session: Option<&str>, folder: Option<&str>) -> Option<(&'static str, String)> {
    match terminal {
        "iTerm" => session.and_then(iterm_session).map(|id| (ITERM_FOCUS, id)),
        "Ghostty" => folder.filter(|f| Path::new(f).is_absolute()).map(|f| (GHOSTTY_FOCUS, f.trim_end_matches('/').to_string())),
        _ => None,
    }
}

#[tauri::command]
pub async fn focus_terminal(terminal: String, session: Option<String>, folder: Option<String>) -> Result<(), String> {
    let terminal = terminal_app(&terminal)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some((script, target)) = focus_script(terminal, session.as_deref(), folder.as_deref()) {
            let mut command = Command::new("/usr/bin/osascript");
            command.arg("-e").arg(script).arg(target);
            if matches!(run(command, None, Duration::from_secs(5)), Ok(output) if output.success) {
                return Ok(());
            }
        }
        Command::new("/usr/bin/open").args(["-a", terminal]).status().map(|_| ()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("templates");
    fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn sync_templates(app: AppHandle, defaults: HashMap<String, String>) -> Result<HashMap<String, String>, String> {
    let dir = templates_dir(&app)?;
    let mut templates = HashMap::new();
    for (name, text) in defaults {
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
            return Err(format!("bad template name {name}"));
        }
        let path = dir.join(format!("{name}.md"));
        if !path.exists() {
            fs::write(&path, &text).map_err(|e| e.to_string())?;
        }
        templates.insert(name, fs::read_to_string(&path).map_err(|e| e.to_string())?);
    }
    Ok(templates)
}

#[tauri::command]
pub fn open_templates(app: AppHandle) -> Result<(), String> {
    let dir = templates_dir(&app)?;
    Command::new("/usr/bin/open").arg(dir).status().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_single_quotes_for_the_shell() {
        assert_eq!(quote("/a b/it's"), r"'/a b/it'\''s'");
    }

    #[test]
    fn picks_the_tab_script_only_with_a_usable_target() {
        let id = "9A6B1C2D-0000-4000-8000-ABCDEFABCDEF";
        assert_eq!(focus_script("iTerm", Some(&format!("w0t1p0:{id}")), None), Some((ITERM_FOCUS, id.to_string())));
        assert_eq!(focus_script("iTerm", Some("w0t1p0:not-a-uuid"), None), None);
        assert_eq!(focus_script("Ghostty", None, Some("/code/hither/")), Some((GHOSTTY_FOCUS, "/code/hither".to_string())));
        assert_eq!(focus_script("Ghostty", None, Some("relative")), None);
        assert_eq!(focus_script("Terminal", Some(&format!("w0t1p0:{id}")), Some("/code")), None);
    }

    #[test]
    fn accepts_only_known_terminals() {
        assert_eq!(terminal_app("Ghostty"), Ok("Ghostty"));
        assert!(terminal_app("Calculator").is_err());
        assert!(terminal_app("/Applications/iTerm.app").is_err());
    }

    #[test]
    fn checkout_script_runs_gh_in_the_folder_and_removes_itself() {
        let dir = std::env::temp_dir().join(format!("hither-checkout-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("checkout.command");
        let fake_gh = dir.join("fake-gh");
        fs::write(&fake_gh, "#!/bin/sh\nprintf '%s ' \"$@\" > \"$PWD/received\"\n").unwrap();
        fs::set_permissions(&fake_gh, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        fs::write(&script, checkout_script(dir.to_str().unwrap(), fake_gh.to_str().unwrap(), 42, &script)).unwrap();
        let status = Command::new("/bin/zsh").arg("-f").arg(&script).env("SHELL", "/usr/bin/true").status().unwrap();
        assert!(status.success());
        assert_eq!(fs::read_to_string(dir.join("received")).unwrap(), "pr checkout 42 ");
        assert!(!script.exists());
    }

    #[test]
    fn launcher_runs_claude_with_the_prompt_file_and_cleans_up() {
        let dir = std::env::temp_dir().join(format!("hither-launch-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let prompt = dir.join("prompt.md");
        let script = dir.join("launch.command");
        fs::write(&prompt, "Fix #42; $(rm -rf ~) `echo hi` 'quoted'").unwrap();
        let fake_claude = dir.join("fake-claude");
        fs::write(&fake_claude, "#!/bin/sh\nprintf '%s' \"$1\" > \"$(dirname \"$0\")/received\"\n").unwrap();
        fs::set_permissions(&fake_claude, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        let text = launcher(dir.to_str().unwrap(), fake_claude.to_str().unwrap(), &prompt, &script);
        fs::write(&script, &text).unwrap();
        let status = Command::new("/bin/zsh").arg("-f").arg(&script).status().unwrap();
        assert!(status.success());
        assert_eq!(fs::read_to_string(dir.join("received")).unwrap(), "Fix #42; $(rm -rf ~) `echo hi` 'quoted'");
        assert!(!prompt.exists());
        assert!(!script.exists());
    }
}
