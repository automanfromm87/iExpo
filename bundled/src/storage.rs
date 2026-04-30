use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::manifest::{AppManifest, AppState};

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

// ─── Multi-app storage ──────────────────────────────────────────────

pub fn apps_root() -> PathBuf {
    let dir = storage_dir().join("apps");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn app_dir(id: &str) -> PathBuf {
    apps_root().join(id)
}

pub fn app_manifest_path(id: &str) -> PathBuf {
    app_dir(id).join("manifest.json")
}

pub fn app_bundle_path(id: &str, version: u64) -> PathBuf {
    app_dir(id).join(format!("v{version}")).join("main.jsbundle")
}

pub fn load_app_manifest(id: &str) -> Option<AppManifest> {
    let data = fs::read_to_string(app_manifest_path(id)).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn save_app_manifest(manifest: &AppManifest) {
    let dir = app_dir(&manifest.id);
    let _ = fs::create_dir_all(&dir);
    let path = app_manifest_path(&manifest.id);
    let json = serde_json::to_string_pretty(manifest).unwrap();
    fs::write(path, json).unwrap();
}

pub fn list_app_ids() -> Vec<String> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(apps_root()) else { return out };
    for entry in entries.flatten() {
        if !entry.path().is_dir() { continue; }
        if !entry.path().join("manifest.json").exists() { continue; }
        if let Some(name) = entry.file_name().to_str() {
            out.push(name.to_string());
        }
    }
    out.sort();
    out
}
