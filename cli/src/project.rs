use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) const JS_EXTENSIONS: &[&str] = &[".tsx", ".ts", ".jsx", ".js"];

pub fn is_js_file(name: &str) -> bool {
    JS_EXTENSIONS.iter().any(|ext| name.ends_with(ext))
}

pub fn require_project_dir() -> PathBuf {
    let cwd = env::current_dir().expect("cannot get cwd");
    if !cwd.join("App.js").exists() && !cwd.join("App.tsx").exists() && !cwd.join("pages").is_dir() {
        eprintln!("❌ No App.js, App.tsx, or pages/ found. Are you in an iExpo project?");
        std::process::exit(1);
    }
    cwd
}

pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.flatten() {
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

pub fn sed_replace_in_dir(dir: &Path, replacements: &[(&str, &str)]) {
    for entry in fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            sed_replace_in_dir(&path, replacements);
        } else if let Ok(mut content) = fs::read_to_string(&path) {
            let mut changed = false;
            for (from, to) in replacements {
                if content.contains(from) {
                    content = content.replace(from, to);
                    changed = true;
                }
            }
            if changed { let _ = fs::write(&path, content); }
        }
    }
}
