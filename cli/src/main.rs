use clap::{Parser, Subcommand};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

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

fn iexpo_root() -> PathBuf {
    let exe = env::current_exe().expect("cannot resolve exe path");
    exe.ancestors().nth(4).unwrap_or_else(|| exe.parent().unwrap()).to_path_buf()
}

fn shell_dir() -> PathBuf { iexpo_root().join("runtime").join("shell") }
fn build_dir() -> PathBuf { iexpo_root().join("runtime").join("build") }
fn apps_dir() -> PathBuf { iexpo_root().join("apps") }

fn run_cmd(program: &str, args: &[&str], cwd: &Path) -> bool {
    let status = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();
    match status {
        Ok(s) => s.success(),
        Err(e) => { eprintln!("Failed to run {program}: {e}"); false }
    }
}

fn run_cmd_output(program: &str, args: &[&str], cwd: &Path) -> Option<String> {
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

// ─── init ───

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

    let app_json = format!(r#"{{ "name": "{name}", "displayName": "{name}" }}"#);
    fs::write(dir.join("app.json"), app_json).expect("cannot write app.json");

    println!("📦 Installing type definitions...");
    run_cmd("npm", &["install"], &dir);

    println!("✅ Created {}", dir.display());
    println!("   cd apps/{name} && iex run");
}

// ─── ensure_shell ───

fn ensure_shell() {
    let shell = shell_dir();
    if shell.join("node_modules").join("react-native").exists() {
        println!("✅ Shell exists");
        return;
    }

    println!("⚙️  Setting up shell (one-time)...");
    fs::create_dir_all(&shell).unwrap();

    fs::write(shell.join("package.json"), r#"{
  "name": "iexpo-shell", "version": "1.0.0", "private": true,
  "dependencies": {
    "react": "18.3.1",
    "react-native": "0.76.9",
    "@react-native-community/cli": "15.1.3",
    "@react-native-community/cli-platform-ios": "15.1.3",
    "@react-native/metro-config": "0.76.9"
  }
}"#).unwrap();

    fs::write(shell.join("index.js"), "import { AppRegistry } from 'react-native';\n\
        import App from './App';\n\
        AppRegistry.registerComponent('iExpoShell', () => App);\n"
    ).unwrap();

    fs::write(shell.join("metro.config.js"),
        "const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');\n\
         module.exports = mergeConfig(getDefaultConfig(__dirname), {});\n"
    ).unwrap();

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

    println!("📦 npm install...");
    if !run_cmd("npm", &["install"], &shell) {
        eprintln!("❌ npm install failed");
        std::process::exit(1);
    }

    println!("📱 Generating iOS project...");
    run_cmd("npm", &["install", "@react-native-community/template@0.76.9", "--save-dev"], &shell);

    let template_ios = shell.join("node_modules/@react-native-community/template/template/ios");
    if template_ios.exists() {
        copy_dir_recursive(&template_ios, &shell.join("ios"));
    }

    let ios_dir = shell.join("ios");
    if ios_dir.exists() {
        sed_replace_in_dir(&ios_dir, "HelloWorld", "iExpoShell");
        sed_replace_in_dir(&ios_dir, "helloworld", "iexposhell");

        for (from, to) in [
            ("HelloWorld.xcodeproj", "iExpoShell.xcodeproj"),
            ("HelloWorld", "iExpoShell"),
            ("HelloWorldTests", "iExpoShellTests"),
        ] {
            let src = ios_dir.join(from);
            if src.exists() { let _ = fs::rename(&src, ios_dir.join(to)); }
        }

        println!("📦 pod install...");
        run_cmd("pod", &["install"], &ios_dir);
    }

    println!("✅ Shell setup complete");
}

fn copy_dir_recursive(src: &Path, dst: &Path) {
    fs::create_dir_all(dst).unwrap();
    for entry in fs::read_dir(src).unwrap().flatten() {
        let dest_path = dst.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path);
        } else {
            fs::copy(entry.path(), &dest_path).unwrap();
        }
    }
}

fn sed_replace_in_dir(dir: &Path, from: &str, to: &str) {
    for entry in fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            sed_replace_in_dir(&path, from, to);
        } else if let Ok(content) = fs::read_to_string(&path) {
            if content.contains(from) {
                let _ = fs::write(&path, content.replace(from, to));
            }
        }
    }
}

// ─── generate_router ───

fn scan_pages(dir: &Path, prefix: &str) -> Vec<(String, String)> {
    let mut routes = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() && name != "node_modules" {
            let sub = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            routes.extend(scan_pages(&path, &sub));
        } else if name.ends_with(".tsx") || name.ends_with(".ts")
               || name.ends_with(".jsx") || name.ends_with(".js") {
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);
            let route_path = if stem == "index" {
                if prefix.is_empty() { "/".to_string() } else { format!("/{prefix}") }
            } else if prefix.is_empty() {
                format!("/{stem}")
            } else {
                format!("/{prefix}/{stem}")
            };
            routes.push((route_path, path.to_string_lossy().to_string()));
        }
    }
    routes
}

fn route_name(path: &str) -> String {
    if path == "/" { return "Home".to_string(); }
    path.trim_start_matches('/')
        .split('/')
        .map(|s| {
            let mut c = s.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().to_string() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn default_icon(path: &str) -> &str {
    match path {
        "/" => "H",
        "/settings" => "S",
        "/about" => "i",
        "/profile" => "P",
        "/search" => "Q",
        "/chat" => "C",
        _ => "*",
    }
}

fn generate_router(project_abs: &Path, shell: &Path) {
    let pages_dir = project_abs.join("pages");
    let routes = scan_pages(&pages_dir, "");

    if routes.is_empty() {
        eprintln!("⚠️  pages/ directory is empty");
        return;
    }

    println!("   Routes:");
    for (path, _) in &routes {
        println!("     {} → {}", path, route_name(path));
    }

    let mut imports = String::new();
    let mut route_entries = String::new();

    for (i, (path, file)) in routes.iter().enumerate() {
        let var_name = format!("Page{i}");
        let icon = default_icon(path);
        imports.push_str(&format!("import {var_name} from '{file}';\n"));
        route_entries.push_str(&format!(
            "  {{ name: '{}', path: '{}', icon: '{}', component: {var_name} }},\n",
            route_name(path), path, icon
        ));
    }

    let index_content = format!(
        "import {{ AppRegistry }} from 'react-native';\n\
         import {{ Router }} from './iex/router';\n\
         {imports}\n\
         const routes = [\n{route_entries}];\n\n\
         function App() {{ return <Router routes={{routes}} />; }}\n\n\
         AppRegistry.registerComponent('iExpoShell', () => App);\n"
    );

    fs::write(shell.join("index.js"), index_content).expect("cannot write index.js");
}

fn watch_pages(project_dir: PathBuf) {
    let shell = shell_dir();
    let pages_dir = project_dir.join("pages");
    if !pages_dir.is_dir() { return; }

    std::thread::spawn(move || {
        let mut last_snapshot = snapshot_dir(&pages_dir);
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let current = snapshot_dir(&pages_dir);
            if current != last_snapshot {
                println!("📂 Pages changed — regenerating routes...");
                generate_router(&project_dir, &shell);
                last_snapshot = current;
            }
        }
    });
}

fn snapshot_dir(dir: &Path) -> Vec<(String, std::time::SystemTime)> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if path.is_dir() && name != "node_modules" {
                files.extend(snapshot_dir(&path));
            } else if name.ends_with(".tsx") || name.ends_with(".ts")
                   || name.ends_with(".jsx") || name.ends_with(".js") {
                let modified = fs::metadata(&path)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                files.push((path.to_string_lossy().to_string(), modified));
            }
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

// ─── configure_metro ───

fn configure_metro(project_dir: &Path) {
    println!("📋 Configuring Metro to read from {}", project_dir.display());
    let shell = shell_dir();
    let project_abs = fs::canonicalize(project_dir).expect("cannot resolve project path");

    // Check if project uses file-system routing (has pages/ directory)
    let pages_dir = project_dir.join("pages");
    let has_pages = pages_dir.is_dir();

    if has_pages {
        println!("📂 Detected pages/ directory — enabling file-system routing");
        generate_router(&project_abs, &shell);
    } else {
        let index_content = format!(
            "import {{ AppRegistry }} from 'react-native';\n\
             import App from '{}/App';\n\
             AppRegistry.registerComponent('iExpoShell', () => App);\n",
            project_abs.display()
        );
        fs::write(shell.join("index.js"), index_content).expect("cannot write index.js");
    }

    // .watchmanconfig in project dir so Watchman can watch it
    let watchman_config = project_abs.join(".watchmanconfig");
    if !watchman_config.exists() {
        fs::write(&watchman_config, "{}").expect("cannot write .watchmanconfig");
    }

    // metro.config.js: watch user's project directory, resolve deps from shell only
    let metro_content = format!(
        "const {{getDefaultConfig, mergeConfig}} = require('@react-native/metro-config');\n\
         const path = require('path');\n\
         const exclusionList = require('metro-config/src/defaults/exclusionList');\n\
         module.exports = mergeConfig(getDefaultConfig(__dirname), {{\n\
         \x20 watchFolders: ['{}'],\n\
         \x20 resolver: {{\n\
         \x20\x20\x20 nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],\n\
         \x20\x20\x20 blockList: exclusionList([/apps\\/.*\\/node_modules\\/.*/]),\n\
         \x20\x20\x20 extraNodeModules: {{ 'iex': path.resolve(__dirname, 'iex') }},\n\
         \x20 }},\n\
         }});\n",
        project_abs.display()
    );
    fs::write(shell.join("metro.config.js"), metro_content).expect("cannot write metro.config.js");
}

// ─── build_shell ───

fn build_shell() -> Option<PathBuf> {
    let build = build_dir();

    if let Some(app_path) = find_app_in_build(&build) {
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
    find_app_in_build(&build)
}

fn find_app_in_build(dir: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if entry.file_name() == "iExpoShell.app"
                && path.parent().map_or(false, |p| p.file_name().map_or(false, |n| n == "Debug-iphonesimulator"))
                && path.join("Info.plist").exists()
            {
                return Some(path);
            }
            if let Some(found) = find_app_in_build(&path) { return Some(found); }
        }
    }
    None
}

// ─── install_app ───

fn install_app(app_path: &Path) {
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

// ─── cmd_build ───

fn cmd_build(sim: bool) {
    let cwd = env::current_dir().expect("cannot get cwd");
    if !cwd.join("App.js").exists() && !cwd.join("App.tsx").exists() && !cwd.join("pages").is_dir() {
        eprintln!("❌ No App.js, App.tsx, or pages/ found. Are you in an iExpo project?");
        std::process::exit(1);
    }

    println!();
    println!("📦 iExpo Build");
    println!();

    ensure_shell();
    configure_metro(&cwd);

    let shell = shell_dir();
    let build = build_dir();
    let output_dir = cwd.join("build");
    fs::create_dir_all(&output_dir).unwrap();

    // Step 1: Bundle JS
    println!("1/4 Bundling JavaScript...");
    let bundle_path = shell.join("main.jsbundle");
    let assets_dir = shell.join("assets");
    fs::create_dir_all(&assets_dir).unwrap();

    let bundle_ok = run_cmd("npx", &[
        "react-native", "bundle",
        "--platform", "ios",
        "--dev", "false",
        "--entry-file", "index.js",
        "--bundle-output", bundle_path.to_str().unwrap(),
        "--assets-dest", assets_dir.to_str().unwrap(),
    ], &shell);

    if !bundle_ok {
        eprintln!("❌ JS bundle failed");
        std::process::exit(1);
    }
    println!("   ✅ Bundle created");

    // Step 2: Copy bundle into iOS project resources
    println!("2/4 Embedding bundle into app...");
    let ios_resources = shell.join("ios/iExpoShell");
    fs::copy(&bundle_path, ios_resources.join("main.jsbundle"))
        .expect("cannot copy jsbundle");
    // Copy assets if any exist
    if assets_dir.exists() {
        let dest_assets = ios_resources.join("assets");
        if dest_assets.exists() { let _ = fs::remove_dir_all(&dest_assets); }
        let _ = copy_dir_recursive_safe(&assets_dir, &dest_assets);
    }
    println!("   ✅ Bundle embedded");

    // Step 3: xcodebuild Release
    println!("3/4 Compiling Release build...");
    let derived = build.join("DerivedData-Release");
    fs::create_dir_all(&derived).unwrap();

    let (destination, config_suffix) = if sim {
        ("platform=iOS Simulator,name=iPhone 17 Pro", "iphonesimulator")
    } else {
        ("generic/platform=iOS", "iphoneos")
    };

    let build_ok = run_cmd("xcodebuild", &[
        "-workspace", shell.join("ios/iExpoShell.xcworkspace").to_str().unwrap(),
        "-scheme", "iExpoShell",
        "-configuration", "Release",
        "-destination", destination,
        "-derivedDataPath", derived.to_str().unwrap(),
        "build",
    ], &shell);

    if !build_ok {
        eprintln!("❌ Release build failed");
        std::process::exit(1);
    }

    // Step 4: Locate and copy .app
    println!("4/4 Packaging...");
    let search_dir = format!("Release-{config_suffix}");
    let app_path = find_app_release(&derived, &search_dir);

    match app_path {
        Some(app) => {
            let dest_app = output_dir.join("iExpoShell.app");
            if dest_app.exists() { let _ = fs::remove_dir_all(&dest_app); }
            copy_dir_recursive(&app, &dest_app);

            println!();
            println!("✅ Build complete!");
            println!("   {}", dest_app.display());
            if sim {
                println!();
                println!("   Install on simulator:");
                println!("   xcrun simctl install booted build/iExpoShell.app");
            } else {
                println!();
                println!("   To create .ipa for App Store, use:");
                println!("   xcodebuild -exportArchive ...");
            }
        }
        None => {
            eprintln!("❌ Cannot find built .app");
            std::process::exit(1);
        }
    }

    // Cleanup: remove embedded bundle from source (keep it clean for dev mode)
    let _ = fs::remove_file(ios_resources.join("main.jsbundle"));
    let _ = fs::remove_dir_all(ios_resources.join("assets"));
}

fn find_app_release(dir: &Path, config_suffix: &str) -> Option<PathBuf> {
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
            if let Some(found) = find_app_release(&path, config_suffix) { return Some(found); }
        }
    }
    None
}

fn copy_dir_recursive_safe(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.flatten() {
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive_safe(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

// ─── cmd_publish ───

fn cmd_publish(server: &str, note: &str) {
    let cwd = env::current_dir().expect("cannot get cwd");
    if !cwd.join("App.js").exists() && !cwd.join("App.tsx").exists() && !cwd.join("pages").is_dir() {
        eprintln!("❌ No App.js, App.tsx, or pages/ found. Are you in an iExpo project?");
        std::process::exit(1);
    }

    println!();
    println!("🚀 iExpo Publish");
    println!();

    ensure_shell();
    configure_metro(&cwd);

    let shell = shell_dir();

    // Step 1: Bundle JS
    println!("1/2 Bundling JavaScript...");
    let bundle_path = shell.join("ota-bundle.jsbundle");

    let bundle_ok = run_cmd("npx", &[
        "react-native", "bundle",
        "--platform", "ios",
        "--dev", "false",
        "--entry-file", "index.js",
        "--bundle-output", bundle_path.to_str().unwrap(),
    ], &shell);

    if !bundle_ok {
        eprintln!("❌ JS bundle failed");
        std::process::exit(1);
    }

    let bundle_size = fs::metadata(&bundle_path).map(|m| m.len()).unwrap_or(0);
    println!("   ✅ Bundle created ({:.1} KB)", bundle_size as f64 / 1024.0);

    // Step 2: Upload to server
    println!("2/2 Publishing to {}...", server);

    let url = if note.is_empty() {
        format!("{}/publish", server)
    } else {
        format!("{}/publish?note={}", server, note.replace(' ', "+"))
    };

    let output = Command::new("curl")
        .args([
            "-s", "-X", "POST",
            "--data-binary", &format!("@{}", bundle_path.display()),
            "-H", "Content-Type: application/octet-stream",
            &url,
        ])
        .output();

    // Cleanup temp bundle
    let _ = fs::remove_file(&bundle_path);

    match output {
        Ok(o) if o.status.success() => {
            let body = String::from_utf8_lossy(&o.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                let version = json.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
                let hash = json.get("hash").and_then(|v| v.as_str()).unwrap_or("");
                println!();
                println!("✅ Published v{}", version);
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

// ─── start_metro ───

fn start_metro() {
    println!();
    println!("🔥 Starting Metro dev server...");
    println!("   Edit any file → save → see changes instantly!");
    println!();

    let shell = shell_dir();
    run_cmd("npx", &["react-native", "start", "--port", "8081"], &shell);
}

// ─── main ───

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Cmd::Init { name } => cmd_init(&name),
        Cmd::Run { no_build } => {
            let cwd = env::current_dir().expect("cannot get cwd");
            if !cwd.join("App.js").exists() && !cwd.join("App.tsx").exists() && !cwd.join("pages").is_dir() {
                eprintln!("❌ No App.js, App.tsx, or pages/ found. Are you in an iExpo project?");
                std::process::exit(1);
            }

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
        Cmd::Build { sim } => cmd_build(sim),
        Cmd::Publish { server, note } => cmd_publish(&server, &note),
    }
}
