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
}

fn default_name() -> String { "iExpoShell".to_string() }
fn default_display_name() -> String { "iExpo".to_string() }
fn default_bundle_id() -> String { "org.reactjs.native.example.iExpoShell".to_string() }
fn default_scheme() -> String { "iExpoShell".to_string() }
fn default_port() -> u16 { 8081 }
fn default_rn_version() -> String { RN_VERSION.to_string() }

impl Default for IexConfig {
    fn default() -> Self {
        Self {
            name: default_name(),
            display_name: default_display_name(),
            bundle_id: default_bundle_id(),
            scheme: default_scheme(),
            port: default_port(),
            rn_version: default_rn_version(),
        }
    }
}

pub fn load_config(project_dir: &Path) -> &'static IexConfig {
    CONFIG.get_or_init(|| {
        let config_path = project_dir.join("iex.toml");
        if config_path.exists() {
            let content = fs::read_to_string(&config_path).expect("cannot read iex.toml");
            toml::from_str(&content).expect("invalid iex.toml")
        } else {
            IexConfig::default()
        }
    })
}
