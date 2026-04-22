use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::manifest::AppState;

static STORAGE: OnceLock<PathBuf> = OnceLock::new();

pub fn storage_dir() -> &'static PathBuf {
    STORAGE.get_or_init(|| {
        let dir = PathBuf::from("./bundles");
        fs::create_dir_all(&dir).unwrap();
        dir
    })
}

pub fn state_file() -> PathBuf {
    storage_dir().join("state.json")
}

pub fn load_state() -> AppState {
    if let Ok(data) = fs::read_to_string(state_file()) {
        serde_json::from_str(&data).unwrap_or(AppState { versions: vec![] })
    } else {
        AppState { versions: vec![] }
    }
}

pub fn save_state(state: &AppState) {
    let json = serde_json::to_string_pretty(state).unwrap();
    fs::write(state_file(), json).unwrap();
}
