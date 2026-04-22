mod paths;
mod util;
mod project;
mod shell;
mod router;
mod metro;
mod build;
mod publish;

use clap::{Parser, Subcommand};
use std::fs;

use paths::{shell_dir, apps_dir};
use util::run_cmd;
use project::require_project_dir;
use shell::{ensure_shell, build_shell, install_app};
use metro::configure_metro;
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
            "@types/react": "^18.3.0",
            "react-native": "0.76.9",
            "typescript": "^5.0.0"
        }
    });
    fs::write(dir.join("package.json"), serde_json::to_string_pretty(&pkg).unwrap())
        .expect("cannot write package.json");

    fs::write(dir.join("app.json"), format!(r#"{{ "name": "{name}", "displayName": "{name}" }}"#))
        .expect("cannot write app.json");

    println!("📦 Installing type definitions...");
    run_cmd("npm", &["install"], &dir);

    println!("✅ Created {}", dir.display());
    println!("   cd apps/{name} && iex run");
}

fn start_metro() {
    println!();
    println!("🔥 Starting Metro dev server...");
    println!("   Edit any file → save → see changes instantly!");
    println!();

    let shell = shell_dir();
    run_cmd("npx", &["react-native", "start", "--port", "8081"], &shell);
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Cmd::Init { name } => cmd_init(&name),
        Cmd::Run { no_build } => {
            let cwd = require_project_dir();

            println!();
            println!("🚀 iExpo Run");
            println!();

            ensure_shell();
            configure_metro(&cwd);

            if !no_build {
                match build_shell() {
                    Some(app_path) => install_app(&app_path),
                    None => std::process::exit(1),
                }
            }

            watch_pages(fs::canonicalize(&cwd).unwrap());
            start_metro();
        }
        Cmd::Build { sim } => build::cmd_build(sim),
        Cmd::Publish { server, note } => publish::cmd_publish(&server, &note),
    }
}
