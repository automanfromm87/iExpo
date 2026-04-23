use std::fs;
use std::path::{Path, PathBuf};

use crate::paths::{shell_dir, build_dir};
use crate::util::{run_cmd, run_cmd_output};
use crate::project::{copy_dir_all, sed_replace_in_dir};

pub fn ensure_shell() {
    let shell = shell_dir();
    if shell.join("node_modules").join("react-native").exists() {
        println!("✅ Shell exists");
        ensure_entry_points(&shell);
        return;
    }

    println!("⚙️  Setting up shell (one-time)...");
    fs::create_dir_all(&shell).unwrap();

    fs::write(shell.join("package.json"), r#"{
  "name": "iexpo-shell", "version": "1.0.0", "private": true,
  "dependencies": {
    "react": "^19.2.3",
    "react-native": "0.85.2",
    "@react-native-community/cli": "^20.1.3",
    "@react-native-community/cli-platform-ios": "^20.1.3",
    "@react-native/metro-config": "0.85.2"
  }
}"#).unwrap();

    fs::write(shell.join("app.json"), r#"{"name":"iExpoShell","displayName":"iExpo"}"#).unwrap();
    fs::write(shell.join(".watchmanconfig"), "{}").unwrap();

    fs::write(shell.join("tsconfig.json"), r#"{
  "compilerOptions": {
    "target": "esnext",
    "module": "commonjs",
    "lib": ["es2017"],
    "jsx": "react-native",
    "strict": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "exclude": ["node_modules"]
}"#).unwrap();

    fs::write(shell.join("babel.config.js"),
        "module.exports = { presets: ['module:@react-native/babel-preset'] };\n").unwrap();

    ensure_entry_points(&shell);

    println!("📦 npm install...");
    if !run_cmd("npm", &["install"], &shell) {
        eprintln!("❌ npm install failed");
        std::process::exit(1);
    }

    println!("📱 Generating iOS project...");
    run_cmd("npm", &["install", "@react-native-community/template@0.85.2", "--save-dev"], &shell);

    let template_ios = shell.join("node_modules/@react-native-community/template/template/ios");
    if template_ios.exists() {
        copy_dir_all(&template_ios, &shell.join("ios")).unwrap();
    }

    let ios_dir = shell.join("ios");
    if ios_dir.exists() {
        sed_replace_in_dir(&ios_dir, &[("HelloWorld", "iExpoShell"), ("helloworld", "iexposhell")]);

        for (from, to) in [
            ("HelloWorld.xcodeproj", "iExpoShell.xcodeproj"),
            ("HelloWorld", "iExpoShell"),
            ("HelloWorldTests", "iExpoShellTests"),
        ] {
            let src = ios_dir.join(from);
            if src.exists() { let _ = fs::rename(&src, ios_dir.join(to)); }
        }

        let scheme_file = ios_dir
            .join("iExpoShell.xcodeproj/xcshareddata/xcschemes/HelloWorld.xcscheme");
        if scheme_file.exists() {
            let _ = fs::rename(&scheme_file, scheme_file.with_file_name("iExpoShell.xcscheme"));
        }

        println!("📦 pod install...");
        run_cmd("pod", &["install"], &ios_dir);
    }

    println!("✅ Shell setup complete");
}

fn ensure_entry_points(shell: &Path) {
    let index = shell.join("index.js");
    if !index.exists() {
        fs::write(&index, "import './.iex-generated/index.generated';\n").unwrap();
    }

    let metro = shell.join("metro.config.js");
    if !metro.exists() {
        fs::write(&metro, "module.exports = require('./.iex-generated/metro.config.generated.js');\n").unwrap();
    }

    let babel = shell.join("babel.config.js");
    if !babel.exists() {
        fs::write(&babel, "module.exports = { presets: ['module:@react-native/babel-preset'] };\n").unwrap();
    }
}

pub fn build_shell() -> Option<PathBuf> {
    let build = build_dir();

    if let Some(app_path) = find_app(&build, "Debug-iphonesimulator") {
        println!("✅ Using cached shell app");
        return Some(app_path);
    }

    println!("🔨 Building shell app (first time, takes a few minutes)...");
    fs::create_dir_all(&build).unwrap();

    let shell = shell_dir();
    let workspace = shell.join("ios/iExpoShell.xcworkspace");
    let derived = build.join("DerivedData");

    let success = run_cmd("xcodebuild", &[
        "-workspace", workspace.to_str().unwrap(),
        "-scheme", "iExpoShell",
        "-configuration", "Debug",
        "-destination", "platform=iOS Simulator,name=iPhone 17 Pro",
        "-derivedDataPath", derived.to_str().unwrap(),
        "build",
    ], &shell);

    if !success { eprintln!("❌ Build failed"); return None; }
    find_app(&build, "Debug-iphonesimulator")
}

pub fn find_app(dir: &Path, config_suffix: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if entry.file_name() == "iExpoShell.app"
                && path.parent().map_or(false, |p| {
                    p.file_name().map_or(false, |n| n.to_string_lossy().contains(config_suffix))
                })
                && path.join("Info.plist").exists()
            {
                return Some(path);
            }
            if let Some(found) = find_app(&path, config_suffix) { return Some(found); }
        }
    }
    None
}

pub fn install_app(app_path: &Path) {
    println!("📱 Installing on simulator...");
    let dot = PathBuf::from(".");

    let booted = run_cmd_output("xcrun", &["simctl", "list", "devices", "booted"], &dot)
        .map_or(false, |s| s.contains("Booted"));

    if !booted {
        println!("🔄 Booting simulator...");
        if let Some(json) = run_cmd_output("xcrun", &["simctl", "list", "devices", "available", "-j"], &dot) {
            if let Some(uid) = extract_iphone_udid(&json) {
                run_cmd("xcrun", &["simctl", "boot", &uid], &dot);
                run_cmd("open", &["-a", "Simulator"], &dot);
                std::thread::sleep(std::time::Duration::from_secs(3));
            }
        }
    }

    run_cmd("xcrun", &["simctl", "install", "booted", app_path.to_str().unwrap()], &dot);

    let bundle_id = run_cmd_output("defaults", &[
        "read", &format!("{}/Info.plist", app_path.display()), "CFBundleIdentifier"
    ], &dot).unwrap_or_else(|| "org.reactjs.native.example.iExpoShell".to_string());

    run_cmd("xcrun", &["simctl", "launch", "booted", &bundle_id], &dot);
    println!("✅ App launched");
}

fn extract_iphone_udid(json_str: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let devices = v.get("devices")?.as_object()?;
    let mut runtimes: Vec<&String> = devices.keys().collect();
    runtimes.sort();
    runtimes.reverse();
    for runtime in runtimes {
        if runtime.contains("iOS") {
            for dev in devices[runtime].as_array()? {
                if dev.get("name")?.as_str()?.contains("iPhone") {
                    return dev.get("udid")?.as_str().map(|s| s.to_string());
                }
            }
        }
    }
    None
}
