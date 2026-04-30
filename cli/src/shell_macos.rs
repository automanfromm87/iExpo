use std::fs;
use std::path::{Path, PathBuf};

use crate::config::IexConfig;
use crate::hermes::{ensure_hermes, hermes_lib_dir, hermes_src_dir};
use crate::paths::{build_dir, shell_macos_dir};
use crate::util::{run_cmd, target_up_to_date};
use crate::yoga::{ensure_yoga, yoga_lib_path, yoga_src_dir};

const HERMES_DYLIBS: &[&str] = &["libhermesvm.dylib", "libjsi.dylib"];

pub fn macos_build_dir() -> PathBuf { build_dir().join("macos") }
pub fn macos_app_path() -> PathBuf { macos_build_dir().join("iExpoMac.app") }

/// Compile the macOS shell into a `.app` bundle. Returns the bundle path.
pub fn compile_macos_app() -> PathBuf {
    ensure_hermes();
    ensure_yoga();

    let src_dir = shell_macos_dir();
    let main_swift = src_dir.join("main.swift");
    let bridge_mm = src_dir.join("HermesBridge.mm");
    let bridge_header = src_dir.join("HermesBridge.h");
    let bridging_header = src_dir.join("iExpoMac-Bridging-Header.h");
    let info_plist = src_dir.join("Info.plist");

    for f in [&main_swift, &bridge_mm, &bridge_header, &bridging_header, &info_plist] {
        if !f.exists() {
            eprintln!("❌ {} not found", f.display());
            std::process::exit(1);
        }
    }

    let build = macos_build_dir();
    let app = macos_app_path();
    let contents = app.join("Contents");
    let macos_dir = contents.join("MacOS");
    let frameworks = contents.join("Frameworks");
    let bin = macos_dir.join("iExpoMac");
    let bridge_obj = build.join("HermesBridge.o");

    fs::create_dir_all(&macos_dir).unwrap();
    fs::create_dir_all(&frameworks).unwrap();
    fs::create_dir_all(contents.join("Resources")).unwrap();

    let hermes_src = hermes_src_dir();
    let hermes_lib = hermes_lib_dir();
    let api_inc = hermes_src.join("API").to_str().unwrap().to_string();
    let jsi_inc = hermes_src.join("API/jsi").to_str().unwrap().to_string();
    let public_inc = hermes_src.join("public").to_str().unwrap().to_string();
    let lib_path = hermes_lib.to_str().unwrap().to_string();
    let yoga_inc = yoga_src_dir().to_str().unwrap().to_string();
    let yoga_lib_str = yoga_lib_path().to_str().unwrap().to_string();

    let obj_inputs: Vec<&Path> = vec![&bridge_mm, &bridge_header];
    if target_up_to_date(&bridge_obj, &obj_inputs) {
        println!("✅ HermesBridge.o cached");
    } else {
        println!("🔨 Compiling HermesBridge.mm...");
        if !run_cmd(
            "clang++",
            &[
                "-c",
                bridge_mm.to_str().unwrap(),
                "-o", bridge_obj.to_str().unwrap(),
                "-std=c++20",
                "-fobjc-arc",
                "-fexceptions",
                "-frtti",
                "-mmacosx-version-min=11.0",
                "-I", &api_inc,
                "-I", &jsi_inc,
                "-I", &public_inc,
                "-I", &yoga_inc,
            ],
            &src_dir,
        ) {
            eprintln!("❌ clang++ failed");
            std::process::exit(1);
        }
    }

    let yoga_lib_path_buf = yoga_lib_path();
    let hermesvm = hermes_lib.join("libhermesvm.dylib");
    let jsi = hermes_lib.join("libjsi.dylib");
    let bin_inputs: Vec<&Path> = vec![
        &main_swift, &bridge_obj, &bridging_header,
        &yoga_lib_path_buf, &hermesvm, &jsi,
    ];
    if target_up_to_date(&bin, &bin_inputs) {
        println!("✅ Swift binary cached");
    } else {
        println!("🔨 Compiling Swift + linking...");
        if !run_cmd(
            "swiftc",
            &[
                main_swift.to_str().unwrap(),
                bridge_obj.to_str().unwrap(),
                "-o", bin.to_str().unwrap(),
                "-import-objc-header", bridging_header.to_str().unwrap(),
                "-framework", "Cocoa",
                "-framework", "UserNotifications",
                "-L", &lib_path,
                "-lhermesvm",
                "-ljsi",
                "-lc++",
                "-Xlinker", &yoga_lib_str,
                "-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks",
            ],
            &src_dir,
        ) {
            eprintln!("❌ swiftc failed");
            std::process::exit(1);
        }
    }

    let dst_plist = contents.join("Info.plist");
    if !target_up_to_date(&dst_plist, &[&info_plist]) {
        fs::copy(&info_plist, &dst_plist).expect("cannot copy Info.plist");
    }
    for name in HERMES_DYLIBS {
        let dst = frameworks.join(name);
        let src = hermes_lib.join(name);
        if !target_up_to_date(&dst, &[&src]) {
            fs::copy(&src, &dst).unwrap_or_else(|e| panic!("cannot copy {name}: {e}"));
        }
    }

    app
}

pub fn launch_macos_app(app: &Path, cfg: &IexConfig) {
    println!("🚀 Launching...");
    let port_env = format!("IEX_METRO_PORT={}", cfg.port);
    run_cmd(
        "open",
        &["--env", &port_env, app.to_str().unwrap()],
        &PathBuf::from("."),
    );
    println!("✅ Launched — {}", app.display());
}

