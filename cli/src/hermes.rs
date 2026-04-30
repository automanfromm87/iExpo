use std::fs;
use std::path::PathBuf;

use crate::paths::{shell_dir, build_dir};
use crate::util::run_cmd;

pub fn hermes_dir() -> PathBuf { build_dir().join("hermes") }
pub fn hermes_src_dir() -> PathBuf { hermes_dir().join("src") }
pub fn hermes_lib_dir() -> PathBuf { hermes_dir().join("lib") }

const DYLIBS: &[&str] = &["libhermesvm.dylib", "libjsi.dylib"];

fn all_dylibs_present() -> bool {
    let lib = hermes_lib_dir();
    DYLIBS.iter().all(|n| lib.join(n).exists())
}

fn read_hermes_version() -> String {
    let f = shell_dir().join("node_modules/react-native/sdks/.hermesversion");
    if !f.exists() {
        eprintln!("❌ {} not found", f.display());
        eprintln!("   Run `iex run` (iOS path) once first so the shell's node_modules is installed.");
        std::process::exit(1);
    }
    fs::read_to_string(&f)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", f.display()))
        .trim()
        .to_string()
}

pub fn ensure_hermes() {
    let want = read_hermes_version();
    let dir = hermes_dir();
    let stamp = dir.join(".version");

    if all_dylibs_present() {
        if let Ok(have) = fs::read_to_string(&stamp) {
            if have.trim() == want {
                println!("✅ Hermes cached ({want})");
                return;
            }
        }
    }

    let src = hermes_src_dir();
    let build = dir.join("build");
    let lib_out = dir.join("lib");
    let _ = fs::remove_dir_all(&build);
    let _ = fs::remove_dir_all(&lib_out);
    fs::create_dir_all(&dir).unwrap();

    if !src.exists() {
        println!("📥 Cloning Hermes {want}...");
        if !run_cmd(
            "git",
            &[
                "clone",
                "--depth", "1",
                "--branch", &want,
                "https://github.com/facebook/hermes.git",
                src.to_str().unwrap(),
            ],
            &dir,
        ) {
            eprintln!("❌ git clone failed");
            std::process::exit(1);
        }
    } else {
        println!("🔁 Updating Hermes source to {want}...");
        let _ = run_cmd("git", &["fetch", "--depth", "1", "origin", "tag", &want], &src);
        if !run_cmd("git", &["checkout", &want], &src) {
            eprintln!("❌ git checkout {want} failed");
            std::process::exit(1);
        }
    }

    println!("🔨 Configuring Hermes (cmake)...");
    fs::create_dir_all(&build).unwrap();
    if !run_cmd(
        "cmake",
        &[
            "-S", src.to_str().unwrap(),
            "-B", build.to_str().unwrap(),
            "-G", "Ninja",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DHERMES_ENABLE_DEBUGGER=OFF",
            "-DHERMES_BUILD_APPLE_FRAMEWORK=OFF",
        ],
        &dir,
    ) {
        eprintln!("❌ cmake configure failed");
        std::process::exit(1);
    }

    println!("🔨 Building Hermes dylibs (first time takes a few minutes)...");
    let mut args: Vec<&str> = vec!["--build", build.to_str().unwrap(), "--target"];
    args.extend(DYLIBS.iter().copied());
    if !run_cmd("cmake", &args, &dir) {
        eprintln!("❌ hermes build failed");
        std::process::exit(1);
    }

    fs::create_dir_all(&lib_out).unwrap();
    for name in DYLIBS {
        let src_dylib = find_dylib(&build, name).unwrap_or_else(|| {
            eprintln!("❌ {name} not found under {}", build.display());
            std::process::exit(1);
        });
        let dst = lib_out.join(name);
        fs::copy(&src_dylib, &dst).unwrap_or_else(|e| {
            eprintln!("❌ copy {} → {}: {e}", src_dylib.display(), dst.display());
            std::process::exit(1);
        });
    }

    fs::write(&stamp, &want).expect("cannot write .version stamp");
    println!("✅ Hermes built: {}", lib_out.display());
}

fn find_dylib(root: &std::path::Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(root).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_dylib(&path, name) {
                return Some(found);
            }
        } else if path.file_name().map_or(false, |n| n == name) {
            return Some(path);
        }
    }
    None
}
