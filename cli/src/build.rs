use std::fs;
use std::path::{Path, PathBuf};

use crate::config::{load_config, IexConfig};
use crate::paths::{shell_dir, build_dir};
use crate::util::{run_cmd, bundle_js, bundle_js_for_platform};
use crate::project::{require_project_dir, copy_dir_all};
use crate::shell::{ensure_shell, find_app};
use crate::shell_macos::compile_macos_app;
use crate::metro::configure_metro;
use crate::platform::Platform;

pub fn cmd_build(platform: Platform, sim: bool) {
    match platform {
        Platform::Ios => cmd_build_ios(sim),
        Platform::Macos => cmd_build_macos(),
    }
}

fn cmd_build_ios(sim: bool) {
    let cwd = require_project_dir();
    let cfg = load_config(&cwd);
    let name = &cfg.name;

    println!();
    println!("📦 iExpo Build (iOS)");
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

fn cmd_build_macos() {
    let cwd = require_project_dir();
    let cfg = load_config(&cwd);

    println!();
    println!("📦 iExpo Build (macOS)");
    println!();

    ensure_shell(cfg);
    configure_metro(&cwd, cfg);

    let shell = shell_dir();
    let output_dir = cwd.join("dist");
    fs::create_dir_all(&output_dir).unwrap();

    println!("1/4 Bundling JavaScript (release)...");
    let assets_dir = shell.join("assets-macos");
    let bundle_path = bundle_js_for_platform(
        &shell,
        "main.macos.jsbundle",
        Some(&assets_dir),
        "macos",
        "index.macos.js",
    );
    println!("   ✅ Bundle: {}", bundle_path.display());

    println!("2/4 Compiling shell...");
    let shell_app = compile_macos_app();

    println!("3/4 Packaging into per-app .app...");
    let dest_app = output_dir.join(format!("{}.app", cfg.display_name));
    if dest_app.exists() { let _ = fs::remove_dir_all(&dest_app); }
    copy_dir_all(&shell_app, &dest_app).unwrap();

    let dst_resources = dest_app.join("Contents/Resources");
    fs::create_dir_all(&dst_resources).unwrap();
    fs::copy(&bundle_path, dst_resources.join("main.jsbundle")).expect("copy jsbundle");
    if assets_dir.exists() {
        let dest_assets = dst_resources.join("assets");
        if dest_assets.exists() { let _ = fs::remove_dir_all(&dest_assets); }
        let _ = copy_dir_all(&assets_dir, &dest_assets);
    }

    println!("4/4 Writing Info.plist + icon...");
    write_app_info_plist(&dest_app.join("Contents/Info.plist"), cfg);
    embed_app_icon(&cwd, &dst_resources);

    let _ = fs::remove_file(&bundle_path);
    let _ = fs::remove_dir_all(&assets_dir);

    println!();
    println!("✅ Build complete!");
    println!("   {}", dest_app.display());
    println!();
    println!("   Run:");
    println!("   open '{}'", dest_app.display());
}

fn write_app_info_plist(path: &Path, cfg: &IexConfig) {
    let plist = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\">\n\
         <dict>\n\
         \t<key>CFBundleExecutable</key>\n\t<string>iExpoMac</string>\n\
         \t<key>CFBundleIdentifier</key>\n\t<string>{bundle_id}</string>\n\
         \t<key>CFBundleName</key>\n\t<string>{display_name}</string>\n\
         \t<key>CFBundleDisplayName</key>\n\t<string>{display_name}</string>\n\
         \t<key>CFBundleShortVersionString</key>\n\t<string>{version}</string>\n\
         \t<key>CFBundleVersion</key>\n\t<string>{version}</string>\n\
         \t<key>CFBundleIconFile</key>\n\t<string>AppIcon</string>\n\
         \t<key>CFBundlePackageType</key>\n\t<string>APPL</string>\n\
         \t<key>LSMinimumSystemVersion</key>\n\t<string>11.0</string>\n\
         \t<key>NSPrincipalClass</key>\n\t<string>NSApplication</string>\n\
         \t<key>NSHighResolutionCapable</key>\n\t<true/>\n\
         </dict>\n\
         </plist>\n",
        bundle_id = cfg.bundle_id,
        display_name = cfg.display_name,
        version = cfg.version,
    );
    fs::write(path, plist).expect("cannot write Info.plist");
}

fn embed_app_icon(project_dir: &Path, resources: &Path) {
    // Prefer prebuilt .icns; otherwise generate from icon.png via sips + iconutil.
    let dst_icns = resources.join("AppIcon.icns");

    if let Some(icns) = first_existing(project_dir, &["icon.icns", "AppIcon.icns"]) {
        fs::copy(&icns, &dst_icns).expect("cannot copy .icns");
        println!("   ✅ AppIcon: {}", icns.display());
        return;
    }
    let Some(png) = first_existing(project_dir, &["icon.png", "AppIcon.png"]) else {
        println!("   (no icon.png / icon.icns at project root — using shell default)");
        return;
    };

    let iconset = resources.with_file_name("AppIcon.iconset");
    if iconset.exists() { let _ = fs::remove_dir_all(&iconset); }
    fs::create_dir_all(&iconset).unwrap();

    // Apple-recommended sizes for a complete .icns.
    let sizes: &[(u32, &str)] = &[
        (16,   "icon_16x16.png"),
        (32,   "icon_16x16@2x.png"),
        (32,   "icon_32x32.png"),
        (64,   "icon_32x32@2x.png"),
        (128,  "icon_128x128.png"),
        (256,  "icon_128x128@2x.png"),
        (256,  "icon_256x256.png"),
        (512,  "icon_256x256@2x.png"),
        (512,  "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ];
    for (size, name) in sizes {
        let out = iconset.join(name);
        if !run_cmd("sips", &[
            "-z", &size.to_string(), &size.to_string(),
            png.to_str().unwrap(),
            "--out", out.to_str().unwrap(),
        ], project_dir) {
            eprintln!("⚠️  sips failed for {name}");
        }
    }

    if !run_cmd("iconutil", &[
        "-c", "icns", iconset.to_str().unwrap(),
        "-o", dst_icns.to_str().unwrap(),
    ], project_dir) {
        eprintln!("⚠️  iconutil failed; .app will use shell default icon");
    } else {
        println!("   ✅ AppIcon.icns generated from {}", png.display());
    }

    let _ = fs::remove_dir_all(&iconset);
}

fn first_existing(dir: &Path, names: &[&str]) -> Option<PathBuf> {
    for n in names {
        let p = dir.join(n);
        if p.exists() { return Some(p); }
    }
    None
}
