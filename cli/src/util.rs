use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

pub fn run_cmd(program: &str, args: &[&str], cwd: &Path) -> bool {
    run_cmd_env(program, args, cwd, &[])
}

pub fn run_cmd_env(program: &str, args: &[&str], cwd: &Path, env: &[(&str, &str)]) -> bool {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(cwd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    for (k, v) in env { cmd.env(k, v); }
    match cmd.status() {
        Ok(s) => s.success(),
        Err(e) => { eprintln!("Failed to run {program}: {e}"); false }
    }
}

pub fn write_if_changed(path: &Path, content: &str) {
    if fs::read_to_string(path).unwrap_or_default() != content {
        fs::write(path, content).unwrap_or_else(|e| panic!("cannot write {}: {e}", path.display()));
    }
}

/// Format a value as a JS string literal — handles `\`, `'`, `"`, control
/// chars, and supplementary unicode safely. JS accepts JSON-quoted strings
/// verbatim, so we lean on serde_json's escaping rather than rolling our own.
pub fn js_string(s: &str) -> String {
    serde_json::to_string(s).expect("string serialisation cannot fail")
}

/// True iff `target` exists and its mtime is >= every source's mtime.
/// Missing target or any missing source returns false (i.e. needs rebuild).
pub fn target_up_to_date(target: &Path, sources: &[&Path]) -> bool {
    let target_mtime = match target.metadata().and_then(|m| m.modified()) {
        Ok(t) => t,
        Err(_) => return false,
    };
    for src in sources {
        match src.metadata().and_then(|m| m.modified()) {
            Ok(src_mtime) if src_mtime <= target_mtime => continue,
            _ => return false,
        }
    }
    true
}

pub fn run_cmd_output(program: &str, args: &[&str], cwd: &Path) -> Option<String> {
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

pub fn bundle_js(shell: &Path, output_name: &str, assets_dest: Option<&Path>) -> std::path::PathBuf {
    bundle_js_for_platform(shell, output_name, assets_dest, "ios", "index.js")
}

pub fn bundle_js_for_platform(
    shell: &Path,
    output_name: &str,
    assets_dest: Option<&Path>,
    platform: &str,
    entry: &str,
) -> std::path::PathBuf {
    let bundle_path = shell.join(output_name);

    let bundle_str = bundle_path.to_str().unwrap().to_string();
    let assets_str;
    let mut args = vec![
        "react-native", "bundle",
        "--platform", platform,
        "--dev", "false",
        "--entry-file", entry,
        "--bundle-output", &bundle_str,
    ];

    if let Some(dest) = assets_dest {
        std::fs::create_dir_all(dest).unwrap();
        assets_str = dest.to_str().unwrap().to_string();
        args.push("--assets-dest");
        args.push(&assets_str);
    }

    if !run_cmd("npx", &args, shell) {
        eprintln!("❌ JS bundle failed");
        std::process::exit(1);
    }

    bundle_path
}
