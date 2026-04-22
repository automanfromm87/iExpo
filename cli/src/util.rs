use std::path::Path;
use std::process::{Command, Stdio};

pub fn run_cmd(program: &str, args: &[&str], cwd: &Path) -> bool {
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
