use std::env;
use std::path::PathBuf;
use std::sync::OnceLock;

static ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn iexpo_root() -> &'static PathBuf {
    ROOT.get_or_init(|| {
        let exe = env::current_exe().expect("cannot resolve exe path");
        exe.ancestors().nth(4).unwrap_or_else(|| exe.parent().unwrap()).to_path_buf()
    })
}

pub fn shell_dir() -> PathBuf { iexpo_root().join("runtime").join("shell") }
pub fn build_dir() -> PathBuf { iexpo_root().join("runtime").join("build") }
pub fn apps_dir() -> PathBuf { iexpo_root().join("apps") }
pub fn packages_dir() -> PathBuf { iexpo_root().join("packages") }
pub fn generated_dir() -> PathBuf { shell_dir().join(".iex-generated") }
