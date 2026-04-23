use std::env;
use std::path::PathBuf;
use std::sync::OnceLock;

pub const RN_VERSION: &str = "0.85.2";

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

pub fn rn_version() -> String {
    let pkg = shell_dir().join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(v) = json["dependencies"]["react-native"].as_str() {
                return v.trim_start_matches('^').trim_start_matches('~').to_string();
            }
        }
    }
    RN_VERSION.to_string()
}
