use std::fs::{self, File, TryLockError};
use std::path::Path;

pub struct InstanceLock {
    _file: File,
}

pub fn acquire(dir: &Path) -> std::io::Result<Option<InstanceLock>> {
    fs::create_dir_all(dir)?;
    let file = File::options().create(true).truncate(false).write(true).open(dir.join("hither.lock"))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(InstanceLock { _file: file })),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(e)) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_first_instance_gets_the_lock() {
        let dir = std::env::temp_dir().join(format!("hither-lock-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let first = acquire(&dir).unwrap();
        assert!(first.is_some());
        assert!(acquire(&dir).unwrap().is_none());
        drop(first);
        assert!(acquire(&dir).unwrap().is_some());
    }
}
