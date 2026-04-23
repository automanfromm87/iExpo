use std::fs;
use std::path::Path;

use crate::paths::generated_dir;
use crate::project::is_js_file;

pub fn scan_pages(dir: &Path, prefix: &str) -> Vec<(String, String)> {
    let mut routes = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() && name != "node_modules" {
            let sub = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            routes.extend(scan_pages(&path, &sub));
        } else if is_js_file(&name) {
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

pub fn generate_router(project_abs: &Path) {
    let gen = generated_dir();
    fs::create_dir_all(&gen).unwrap();

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

    let content = format!(
        "import {{ AppRegistry }} from 'react-native';\n\
         import {{ Router }} from 'iex/router';\n\
         {imports}\n\
         const routes = [\n{route_entries}];\n\n\
         function App() {{ return <Router routes={{routes}} />; }}\n\n\
         AppRegistry.registerComponent('iExpoShell', () => App);\n"
    );

    let out = gen.join("index.generated.js");
    let existing = fs::read_to_string(&out).unwrap_or_default();
    if existing != content {
        fs::write(&out, content).expect("cannot write index.generated.js");
    }
}


