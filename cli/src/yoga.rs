use std::fs;
use std::path::PathBuf;

use crate::paths::{build_dir, shell_dir};
use crate::util::run_cmd;

pub fn yoga_src_dir() -> PathBuf {
    shell_dir().join("node_modules/react-native/ReactCommon/yoga")
}

pub fn yoga_build_dir() -> PathBuf {
    build_dir().join("yoga")
}

pub fn yoga_lib_path() -> PathBuf {
    yoga_build_dir().join("yoga").join("libyogacore.a")
}

fn version_marker() -> String {
    // Hash the Yoga sources tree so editor saves on unchanged content don't
    // invalidate the cache (which mtime-based markers do).
    let yh = yoga_src_dir().join("yoga").join("Yoga.h");
    let bytes = fs::read(&yh).unwrap_or_default();
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in &bytes {
        hash = (hash ^ (*b as u64)).wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

pub fn ensure_yoga() {
    let src = yoga_src_dir();
    if !src.join("yoga/Yoga.h").exists() {
        eprintln!("❌ Yoga sources not found at {}", src.display());
        eprintln!("   Run `iex run` (iOS path) once to install RN's node_modules.");
        std::process::exit(1);
    }

    let build = yoga_build_dir();
    let lib = yoga_lib_path();
    let stamp = build.join(".version");
    let want = version_marker();

    if lib.exists() {
        if let Ok(have) = fs::read_to_string(&stamp) {
            if have.trim() == want {
                println!("✅ Yoga cached");
                return;
            }
        }
    }

    let _ = fs::remove_dir_all(&build);
    fs::create_dir_all(&build).unwrap();

    println!("🔨 Configuring Yoga (cmake)...");
    if !run_cmd(
        "cmake",
        &[
            "-S", src.to_str().unwrap(),
            "-B", build.to_str().unwrap(),
            "-G", "Ninja",
            "-DCMAKE_BUILD_TYPE=Release",
        ],
        &build,
    ) {
        eprintln!("❌ cmake configure (yoga) failed");
        std::process::exit(1);
    }

    println!("🔨 Building Yoga static lib...");
    if !run_cmd(
        "cmake",
        &["--build", build.to_str().unwrap(), "--target", "yogacore"],
        &build,
    ) {
        eprintln!("❌ yoga build failed");
        std::process::exit(1);
    }

    if !lib.exists() {
        eprintln!("❌ libyogacore.a not produced at {}", lib.display());
        std::process::exit(1);
    }

    fs::write(&stamp, &want).unwrap();
    println!("✅ Yoga built: {}", lib.display());
}
