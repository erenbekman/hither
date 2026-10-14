use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, PartialEq)]
pub enum RunError {
    Spawn,
    Timeout,
}

pub struct Output {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

pub fn is_executable(path: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    Path::new(path)
        .metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

pub fn locate(name: &str, known: &[String], is_executable: impl Fn(&str) -> bool, path_env: Option<&str>) -> Option<String> {
    if let Some(found) = known.iter().find(|p| is_executable(p)) {
        return Some(found.clone());
    }
    path_env?
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| format!("{dir}/{name}"))
        .find(|candidate| is_executable(candidate))
}

pub fn run(mut command: Command, input: Option<String>, watchdog: Duration) -> Result<Output, RunError> {
    let mut child = command
        .stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| RunError::Spawn)?;

    if let (Some(text), Some(mut stdin)) = (input, child.stdin.take()) {
        thread::spawn(move || {
            let _ = stdin.write_all(text.as_bytes());
        });
    }
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        buf
    });
    let err = thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    let started = Instant::now();
    let status = loop {
        if let Ok(Some(status)) = child.try_wait() {
            break status;
        }
        if started.elapsed() >= watchdog {
            let _ = child.kill();
            let _ = child.wait();
            return Err(RunError::Timeout);
        }
        thread::sleep(Duration::from_millis(50));
    };

    Ok(Output {
        success: status.success(),
        stdout: out.join().unwrap_or_default(),
        stderr: err.join().unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const KNOWN: [&str; 2] = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
    fn known() -> Vec<String> {
        KNOWN.iter().map(|p| p.to_string()).collect()
    }

    #[test]
    fn prefers_known_paths_over_path() {
        let found = locate("gh", &known(), |p| p == "/usr/local/bin/gh" || p == "/x/gh", Some("/x"));
        assert_eq!(found.as_deref(), Some("/usr/local/bin/gh"));
    }

    #[test]
    fn falls_back_to_path() {
        let found = locate("gh", &known(), |p| p == "/custom/bin/gh", Some("/usr/bin:/custom/bin"));
        assert_eq!(found.as_deref(), Some("/custom/bin/gh"));
    }

    #[test]
    fn none_when_missing() {
        assert_eq!(locate("gh", &known(), |_| false, Some("/usr/bin:/bin")), None);
        assert_eq!(locate("gh", &known(), |_| false, None), None);
    }

    #[test]
    fn passes_input_and_reads_output() {
        let output = run(Command::new("/bin/cat"), Some("hello".into()), Duration::from_secs(5)).unwrap();
        assert!(output.success);
        assert_eq!(output.stdout, "hello");
    }

    #[test]
    fn watchdog_kills_a_hanging_process() {
        let mut command = Command::new("/bin/sleep");
        command.arg("10");
        let started = Instant::now();
        assert!(matches!(run(command, None, Duration::from_millis(200)), Err(RunError::Timeout)));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
