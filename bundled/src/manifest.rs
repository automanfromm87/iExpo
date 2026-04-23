use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

fn default_channel() -> String { "production".to_string() }
fn default_runtime() -> String { "unknown".to_string() }

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
