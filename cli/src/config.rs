use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use crate::paths::RN_VERSION;

static CONFIG: OnceLock<IexConfig> = OnceLock::new();

#[derive(Deserialize, Clone)]
pub struct IexConfig {
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "default_display_name")]
    pub display_name: String,
    #[serde(default = "default_bundle_id")]
    pub bundle_id: String,
    #[serde(default = "default_scheme")]
    pub scheme: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_rn_version")]
    pub rn_version: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

fn default_name() -> String { "iExpoShell".to_string() }
fn default_display_name() -> String { "iExpo".to_string() }
fn default_bundle_id() -> String { "org.reactjs.native.example.iExpoShell".to_string() }
fn default_scheme() -> String { "iExpoShell".to_string() }
fn default_port() -> u16 { 8081 }
fn default_rn_version() -> String { RN_VERSION.to_string() }
fn default_version() -> String { "1.0.0".to_string() }

impl Default for IexConfig {
    fn default() -> Self {
        Self {
            name: default_name(),
            display_name: default_display_name(),
            bundle_id: default_bundle_id(),
            scheme: default_scheme(),
            port: default_port(),
            rn_version: default_rn_version(),
            version: default_version(),
            icon: None,
            description: None,
        }
    }
}

pub fn parse_config(path: &Path) -> IexConfig {
    match fs::read_to_string(path) {
        Ok(content) => toml::from_str(&content).expect("invalid iex.toml"),
        Err(_) => IexConfig::default(),
    }
}

pub fn load_config(project_dir: &Path) -> &'static IexConfig {
    CONFIG.get_or_init(|| parse_config(&project_dir.join("iex.toml")))
}
