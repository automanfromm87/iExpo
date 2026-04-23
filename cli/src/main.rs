mod paths;
mod util;
mod config;
mod project;
mod shell;
mod router;
mod metro;
mod build;
mod publish;

use clap::{Parser, Subcommand};
use std::fs;
use std::path::PathBuf;

use paths::{shell_dir, build_dir, apps_dir, RN_VERSION};
use util::{run_cmd, run_cmd_env};
use project::require_project_dir;
use shell::{ensure_shell, build_shell, install_app};
use metro::configure_metro;
use config::load_config;
use router::watch_pages;

#[derive(Parser)]
#[command(name = "iex", about = "iExpo — Instant React Native development")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Create a new project in apps/
    Init { name: String },
    /// Build shell + install + start dev server
    Run {
        #[arg(long)]
        no_build: bool,
    },
    /// Regenerate routes + metro config (while `iex run` is running)
    Sync,
    /// Add a native package (npm install + pod install + clear build cache)
    Add {
        /// Package names (e.g. expo-haptics expo-camera)
        packages: Vec<String>,
    },
    /// Bundle JS + compile Release .app / .ipa
    Build {
        #[arg(long, help = "Build for Simulator instead of device")]
        sim: bool,
    },
    /// Bundle JS and publish to OTA server
    Publish {
        #[arg(long, default_value = "http://localhost:3000", help = "Bundle server URL")]
        server: String,
        #[arg(long, default_value = "", help = "Release note")]
        note: String,
    },
}

fn cmd_init(name: &str) {
    let dir = apps_dir().join(name);
    if dir.exists() {
        eprintln!("❌ {} already exists", dir.display());
        std::process::exit(1);
    }

    println!("🚀 Creating project: {name}");
    fs::create_dir_all(&dir).expect("cannot create project dir");

    fs::write(dir.join("App.tsx"), include_str!("templates/App.tsx"))
        .expect("cannot write App.tsx");

    let pkg = serde_json::json!({
        "name": name,
        "version": "1.0.0",
        "main": "App.tsx",
        "devDependencies": {
            "@types/react": "^19.1.0",
            "react-native": RN_VERSION,
            "typescript": "^5.0.0"
        }
    });
    fs::write(dir.join("package.json"), serde_json::to_string_pretty(&pkg).unwrap())
        .expect("cannot write package.json");

    fs::write(dir.join("app.json"), format!(r#"{{ "name": "{name}", "displayName": "{name}" }}"#))
        .expect("cannot write app.json");

    fs::write(dir.join("iex.toml"), format!(
        "name = \"{name}\"\ndisplay_name = \"{name}\"\nbundle_id = \"com.iexpo.{name}\"\nport = 8081\n"
    )).expect("cannot write iex.toml");

    println!("📦 Installing type definitions...");
    run_cmd("npm", &["install"], &dir);

    println!("✅ Created {}", dir.display());
    println!("   cd apps/{name} && iex run");
}

fn setup_watchman_shim() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let bin_dir = PathBuf::from(&home).join(".iex").join("bin");
    fs::create_dir_all(&bin_dir).ok()?;

    let shim = bin_dir.join("watchman");
    let script = "#!/bin/bash\nexit 1\n";

    if fs::read_to_string(&shim).unwrap_or_default() != script {
        fs::write(&shim, script).ok()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&shim, fs::Permissions::from_mode(0o755)).ok()?;
        }
    }

    Some(bin_dir)
}

fn start_metro(cfg: &config::IexConfig) {
    println!();
    println!("🔥 Starting Metro dev server...");
    println!("   Edit any file → save → see changes instantly!");
    println!();

    let shell = shell_dir();
    let port = cfg.port.to_string();
    let mut env: Vec<(&str, String)> = Vec::new();

    if let Some(bin_dir) = setup_watchman_shim() {
        let path = format!("{}:{}", bin_dir.display(), std::env::var("PATH").unwrap_or_default());
        env.push(("PATH", path));
    }

    let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();
    run_cmd_env("npx", &["react-native", "start", "--port", &port], &shell, &env_refs);
}

fn cmd_add(packages: &[String]) {
    if packages.is_empty() {
        eprintln!("Usage: iex add <package> [package...]");
        std::process::exit(1);
    }

    let shell = shell_dir();
    let ios_dir = shell.join("ios");

    println!("📦 Installing {}...", packages.join(", "));
    let mut args: Vec<&str> = vec!["install"];
    args.extend(packages.iter().map(String::as_str));
    if !run_cmd("npm", &args, &shell) {
        eprintln!("❌ npm install failed");
        std::process::exit(1);
    }

    if ios_dir.join("Podfile").exists() {
        println!("📦 Running pod install...");
        if !run_cmd("pod", &["install"], &ios_dir) {
            eprintln!("❌ pod install failed");
            std::process::exit(1);
        }
    }

    let derived = build_dir().join("DerivedData");
    if derived.exists() {
        println!("🗑  Clearing build cache...");
        let _ = fs::remove_dir_all(&derived);
    }

    println!();
    println!("✅ Added: {}", packages.join(", "));
    println!("   Run `iex run` to rebuild with the new native modules.");
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Cmd::Init { name } => cmd_init(&name),
        Cmd::Run { no_build } => {
            let cwd = require_project_dir();
            let cfg = load_config(&cwd);

            println!();
            println!("🚀 iExpo Run");
            println!();

            ensure_shell(cfg);
            configure_metro(&cwd, cfg);

            if !no_build {
                match build_shell(cfg) {
                    Some(app_path) => install_app(&app_path, cfg),
                    None => std::process::exit(1),
                }
            }

            watch_pages(fs::canonicalize(&cwd).unwrap(), cfg.name.clone());
            start_metro(cfg);
        }
        Cmd::Sync => {
            let cwd = require_project_dir();
            let cfg = load_config(&cwd);
            configure_metro(&cwd, cfg);
            println!("✅ Synced — Metro will reload automatically");
        }
        Cmd::Add { packages } => cmd_add(&packages),
        Cmd::Build { sim } => build::cmd_build(sim),
        Cmd::Publish { server, note } => publish::cmd_publish(&server, &note),
    }
}
