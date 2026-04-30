use std::fs;
use std::process::Command;

use crate::config::parse_config;
use crate::paths::{apps_dir, generated_dir, rn_version, shell_dir};
use crate::router::{render_routes_block, scan_pages, LayoutDedup};
use crate::util::{bundle_js_for_platform, js_string, write_if_changed};

pub fn cmd_publish_app(id: &str, server: &str, note: &str) {
    let app_root = apps_dir().join(id);
    let toml = app_root.join("iex.toml");
    let pages = app_root.join("pages");
    if !toml.exists() || !pages.is_dir() {
        eprintln!("❌ Not an iExpo app: apps/{id}/ (need iex.toml + pages/)");
        std::process::exit(1);
    }

    let cfg = parse_config(&toml);
    let app_canonical = fs::canonicalize(&app_root).expect("cannot resolve app path");
    let routes = scan_pages(&app_canonical.join("pages"), "", &[]);
    if routes.is_empty() {
        eprintln!("❌ apps/{id}/pages/ has no routable files");
        std::process::exit(1);
    }

    println!();
    println!("🚀 iex publish-app {id}");
    println!();
    println!("📂 {} routes:", routes.len());
    for r in &routes {
        println!("   {} → {}", r.path, r.file);
    }

    // Generate a standalone RN entry point. When the shell loads this bundle
    // (via __iex.switchBundle), AppRegistry.registerComponent('iExpoShell', ...)
    // hands the full screen to this app — same surface a normal RN app sees.
    let shell = shell_dir();
    let entry_dir = generated_dir().join("per-app").join(id);
    fs::create_dir_all(&entry_dir).expect("cannot create per-app entry dir");

    let mut dedup = LayoutDedup::new();
    let block = render_routes_block(&routes, "", &mut dedup);

    let icon = cfg.icon.clone().unwrap_or_default();
    let description = cfg.description.clone().unwrap_or_default();

    let app_config = serde_json::json!({
        "name": "iExpoShell",
        "displayName": cfg.display_name,
        "bundleId": cfg.bundle_id,
        "scheme": cfg.scheme,
        "rnVersion": cfg.rn_version,
        "icon": icon,
        "description": description,
        "isHub": false,
    });
    let build_info = serde_json::json!({ "iexVersion": env!("CARGO_PKG_VERSION") });
    let constants = format!(
        "globalThis.__IEX_APP_CONFIG__ = {};\n\
         globalThis.__IEX_BUILD_INFO__ = {};\n",
        serde_json::to_string_pretty(&app_config).unwrap(),
        serde_json::to_string_pretty(&build_info).unwrap(),
    );
    write_if_changed(&entry_dir.join("constants.generated.js"), &constants);

    let entry = format!(
        "import './constants.generated';\n\
         import {{ AppRegistry }} from 'react-native';\n\
         import {{ Router }} from 'iex/router';\n\
         {layout_imports}{imports}\n\
         const routes = [\n{entries}];\n\n\
         function App() {{ return <Router routes={{routes}} brand={{{brand_q}}} />; }}\n\n\
         AppRegistry.registerComponent({module_q}, () => App);\n",
        layout_imports = block.layout_imports,
        imports = block.imports,
        entries = block.entries,
        brand_q = js_string(&cfg.display_name),
        module_q = js_string("iExpoShell"),
    );
    let entry_file = entry_dir.join("entry.js");
    write_if_changed(&entry_file, &entry);

    let entry_rel = entry_file
        .strip_prefix(&shell)
        .expect("per-app entry must live under shell dir")
        .to_string_lossy()
        .into_owned();

    println!();
    println!("📦 Bundling {id}...");
    let bundle_path = bundle_js_for_platform(
        &shell,
        &format!("apps-{id}.jsbundle"),
        None,
        "macos",
        &entry_rel,
    );

    let bundle_size = fs::metadata(&bundle_path).map(|m| m.len()).unwrap_or(0);
    println!("   ✅ Bundle ready ({:.1} KB)", bundle_size as f64 / 1024.0);

    println!();
    println!("⬆️  Uploading to {server}...");
    let url = build_publish_url(server, id, &cfg.display_name, &icon, &description, note, &rn_version());

    let result = Command::new("curl")
        .args([
            "-s", "-X", "POST",
            "--data-binary", &format!("@{}", bundle_path.display()),
            "-H", "Content-Type: application/octet-stream",
            &url,
        ])
        .output();

    let _ = fs::remove_file(&bundle_path);

    match result {
        Ok(o) if o.status.success() => {
            let body = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<serde_json::Value>(&body) {
                Ok(json) => {
                    let version = json.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
                    let bundle_url = json.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    println!();
                    println!("✅ Published {id} v{version}");
                    println!("   Size: {:.1} KB", bundle_size as f64 / 1024.0);
                    println!("   URL:  {server}{bundle_url}");
                }
                Err(_) => {
                    println!("   Response: {body}");
                }
            }
        }
        Ok(o) => {
            eprintln!("❌ Upload failed: {}", String::from_utf8_lossy(&o.stderr));
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("❌ Cannot reach server: {e}");
            eprintln!("   Is bundled running? `cargo run --release --bin bundled` in another terminal.");
            std::process::exit(1);
        }
    }
}

fn build_publish_url(
    server: &str,
    id: &str,
    display_name: &str,
    icon: &str,
    description: &str,
    note: &str,
    runtime_version: &str,
) -> String {
    let mut params = vec![
        ("display_name", display_name),
        ("runtime_version", runtime_version),
    ];
    if !icon.is_empty() { params.push(("icon", icon)); }
    if !description.is_empty() { params.push(("description", description)); }
    if !note.is_empty() { params.push(("note", note)); }

    let qs: String = params.iter()
        .map(|(k, v)| format!("{k}={}", url_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{server}/apps/{id}/publish?{qs}")
}

/// Minimal percent-encoding for URL query values — handles the spaces, emoji
/// and unicode that show up in display_name / icon / description.
fn url_encode(s: &str) -> String {
    const SAFE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        if SAFE.contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}
