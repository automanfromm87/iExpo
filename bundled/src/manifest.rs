use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

fn default_channel() -> String { "production".to_string() }
fn default_runtime() -> String { "unknown".to_string() }

// ─── Legacy single-channel OTA model ────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
pub struct Release {
    #[serde(default)]
    pub id: String,
    pub version: u64,
    #[serde(default = "default_runtime")]
    pub runtime_version: String,
    pub hash: String,
    pub size: u64,
    #[serde(default = "default_channel")]
    pub channel: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AppState {
    pub versions: Vec<Release>,
}

pub type SharedState = Arc<RwLock<AppState>>;

// ─── Multi-app catalog (Hub mode) ───────────────────────────────────

/// One historical version of a single hub app's bundle.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub version: u64,
    pub hash: String,
    pub size: u64,
    #[serde(default = "default_runtime")]
    pub runtime_version: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created_at: String,
}

/// Persistent metadata for one hub app — display info plus its full version
/// history. Stored at `<storage>/apps/<id>/manifest.json` and rewritten on
/// every publish.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppManifest {
    pub id: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub description: String,
    pub latest_version: u64,
    #[serde(default)]
    pub versions: Vec<AppVersion>,
}
