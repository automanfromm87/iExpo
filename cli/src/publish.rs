use std::fs;
use std::process::Command;

use crate::config::load_config;
use crate::paths::{shell_dir, rn_version};
use crate::util::bundle_js;
use crate::project::require_project_dir;
use crate::shell::ensure_shell;
use crate::metro::configure_metro;

pub fn cmd_publish(server: &str, note: &str) {
    let cwd = require_project_dir();
    let cfg = load_config(&cwd);

    println!();
    println!("🚀 iExpo Publish");
    println!();

    ensure_shell(cfg);
    configure_metro(&cwd, cfg);

    let shell = shell_dir();

    println!("1/2 Bundling JavaScript...");
    let bundle_path = bundle_js(&shell, "ota-bundle.jsbundle", None);

    let bundle_size = fs::metadata(&bundle_path).map(|m| m.len()).unwrap_or(0);
    println!("   ✅ Bundle created ({:.1} KB)", bundle_size as f64 / 1024.0);

    println!("2/2 Publishing to {}...", server);

    let rv = rn_version();
    let url = if note.is_empty() {
        format!("{}/publish?channel=production&runtime_version={}", server, rv)
    } else {
        format!("{}/publish?channel=production&runtime_version={}&note={}", server, rv, note.replace(' ', "+"))
    };

    let output = Command::new("curl")
        .args([
            "-s", "-X", "POST",
            "--data-binary", &format!("@{}", bundle_path.display()),
            "-H", "Content-Type: application/octet-stream",
            &url,
        ])
        .output();

    let _ = fs::remove_file(&bundle_path);

    match output {
        Ok(o) if o.status.success() => {
            let body = String::from_utf8_lossy(&o.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                let version = json.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
                let hash = json.get("hash").and_then(|v| v.as_str()).unwrap_or("");
                let channel = json.get("channel").and_then(|v| v.as_str()).unwrap_or("production");
                println!();
                println!("✅ Published v{} ({})", version, channel);
                println!("   Hash: {}...", &hash[..12.min(hash.len())]);
                println!("   Size: {:.1} KB", bundle_size as f64 / 1024.0);
                println!("   URL:  {}/bundles/v{}/main.jsbundle", server, version);
            } else {
                println!("   Response: {}", body);
            }
        }
        Ok(o) => {
            eprintln!("❌ Upload failed: {}", String::from_utf8_lossy(&o.stderr));
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("❌ Cannot reach server: {}", e);
            eprintln!("   Is bundled running? Start it with: bundled");
            std::process::exit(1);
        }
    }
}
