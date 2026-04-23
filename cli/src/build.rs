use std::fs;

use crate::config::load_config;
use crate::paths::{shell_dir, build_dir};
use crate::util::{run_cmd, bundle_js};
use crate::project::{require_project_dir, copy_dir_all};
use crate::shell::{ensure_shell, find_app};
use crate::metro::configure_metro;

pub fn cmd_build(sim: bool) {
    let cwd = require_project_dir();
    let cfg = load_config(&cwd);
    let name = &cfg.name;

    println!();
    println!("📦 iExpo Build");
    println!();

    ensure_shell(cfg);
    configure_metro(&cwd, cfg);

    let shell = shell_dir();
    let build = build_dir();
    let output_dir = cwd.join("build");
    fs::create_dir_all(&output_dir).unwrap();

    println!("1/4 Bundling JavaScript...");
    let assets_dir = shell.join("assets");
    let bundle_path = bundle_js(&shell, "main.jsbundle", Some(&assets_dir));
    println!("   ✅ Bundle created");

    println!("2/4 Embedding bundle into app...");
    let ios_resources = shell.join(format!("ios/{name}"));
    fs::copy(&bundle_path, ios_resources.join("main.jsbundle")).expect("cannot copy jsbundle");
    if assets_dir.exists() {
        let dest_assets = ios_resources.join("assets");
        if dest_assets.exists() { let _ = fs::remove_dir_all(&dest_assets); }
        let _ = copy_dir_all(&assets_dir, &dest_assets);
    }
    println!("   ✅ Bundle embedded");

    println!("3/4 Compiling Release build...");
    let derived = build.join("DerivedData-Release");
    fs::create_dir_all(&derived).unwrap();

    let (destination, config_suffix) = if sim {
        ("platform=iOS Simulator,name=iPhone 17 Pro", "iphonesimulator")
    } else {
        ("generic/platform=iOS", "iphoneos")
    };

    let workspace = shell.join(format!("ios/{name}.xcworkspace"));
    let build_ok = run_cmd("xcodebuild", &[
        "-workspace", workspace.to_str().unwrap(),
        "-scheme", name,
        "-configuration", "Release",
        "-destination", destination,
        "-derivedDataPath", derived.to_str().unwrap(),
        "build",
    ], &shell);

    if !build_ok {
        eprintln!("❌ Release build failed");
        std::process::exit(1);
    }

    println!("4/4 Packaging...");
    let search_dir = format!("Release-{config_suffix}");
    let app_name = format!("{name}.app");
    match find_app(&derived, &search_dir, name) {
        Some(ref app) => {
            let dest_app = output_dir.join(&app_name);
            if dest_app.exists() { let _ = fs::remove_dir_all(&dest_app); }
            copy_dir_all(app, &dest_app).unwrap();

            println!();
            println!("✅ Build complete!");
            println!("   {}", dest_app.display());
            if sim {
                println!();
                println!("   Install on simulator:");
                println!("   xcrun simctl install booted build/{app_name}");
            }
        }
        None => {
            eprintln!("❌ Cannot find built .app");
            std::process::exit(1);
        }
    }

    let _ = fs::remove_file(ios_resources.join("main.jsbundle"));
    let _ = fs::remove_dir_all(ios_resources.join("assets"));
}
