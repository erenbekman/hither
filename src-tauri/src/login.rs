use std::fs;
use std::path::{Path, PathBuf};

const LABEL: &str = "dev.hither.app";

const AGENT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.hither.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-b</string>
    <string>dev.hither.app</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#;

fn agent_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(Path::new(&home).join("Library/LaunchAgents").join(format!("{LABEL}.plist")))
}

fn set(path: &Path, enabled: bool) -> std::io::Result<()> {
    if enabled {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(path, AGENT)
    } else if path.exists() {
        fs::remove_file(path)
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn launch_at_login() -> Result<bool, String> {
    Ok(agent_path()?.exists())
}

#[tauri::command]
pub fn set_launch_at_login(enabled: bool) -> Result<(), String> {
    set(&agent_path()?, enabled).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_removes_the_launch_agent() {
        let dir = std::env::temp_dir().join(format!("hither-login-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("Library/LaunchAgents/dev.hither.app.plist");
        set(&path, true).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("<string>-b</string>"));
        assert!(text.contains("<key>RunAtLoad</key>"));
        set(&path, false).unwrap();
        assert!(!path.exists());
        set(&path, false).unwrap();
    }
}
