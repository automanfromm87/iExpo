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

pub fn run_cmd_output(program: &str, args: &[&str], cwd: &Path) -> Option<String> {
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

pub fn bundle_js(shell: &Path, output_name: &str, assets_dest: Option<&Path>) -> std::path::PathBuf {
    let bundle_path = shell.join(output_name);

    let bundle_str = bundle_path.to_str().unwrap().to_string();
    let assets_str;
    let mut args = vec![
        "react-native", "bundle",
        "--platform", "ios",
        "--dev", "false",
        "--entry-file", "index.js",
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
