use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;

use notify::{EventKind, RecursiveMode, Watcher};

use crate::paths::generated_dir;
use crate::project::is_js_file;
use crate::util::write_if_changed;

struct ScannedRoute {
    path: String,
    file: String,
    layout: Option<String>,
}

fn scan_pages(dir: &Path, prefix: &str, layout: Option<&str>) -> Vec<ScannedRoute> {
    let mut routes = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let own_layout = dir.join("_layout.tsx");
    let active_layout = if own_layout.exists() {
        Some(own_layout.to_string_lossy().to_string())
    } else if let Some(parent) = layout {
        Some(parent.to_string())
    } else {
        let js_layout = dir.join("_layout.js");
        if js_layout.exists() { Some(js_layout.to_string_lossy().to_string()) } else { None }
    };

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('_') { continue; }

        if path.is_dir() && name != "node_modules" {
            let sub = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            routes.extend(scan_pages(&path, &sub, active_layout.as_deref()));
            continue;
        }

        if !is_js_file(&name) { continue; }

        let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);

        let is_dynamic = stem.starts_with('[') && stem.ends_with(']');
        let param_name = if is_dynamic { &stem[1..stem.len()-1] } else { "" };

        let route_path = if stem == "index" {
            if prefix.is_empty() { "/".to_string() } else { format!("/{prefix}") }
        } else if is_dynamic {
            if prefix.is_empty() { format!("/:{param_name}") } else { format!("/{prefix}/:{param_name}") }
        } else if prefix.is_empty() {
            format!("/{stem}")
        } else {
            format!("/{prefix}/{stem}")
        };

        routes.push(ScannedRoute {
            path: route_path,
            file: path.to_string_lossy().to_string(),
            layout: active_layout.clone(),
        });
    }
    routes
}

fn route_name(path: &str) -> String {
    if path == "/" { return "Home".to_string(); }
    path.trim_start_matches('/')
        .split('/')
        .filter(|s| !s.starts_with(':'))
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

pub fn generate_router(project_abs: &Path, app_name: &str) {
    let gen = generated_dir();
    fs::create_dir_all(&gen).unwrap();

    let pages_dir = project_abs.join("pages");
    let routes = scan_pages(&pages_dir, "", None);

    if routes.is_empty() {
        eprintln!("⚠️  pages/ directory is empty");
        return;
    }

    println!("   Routes:");
    for r in &routes {
        let suffix = if r.path.contains(':') { " (dynamic)" } else { "" };
        println!("     {} → {}{}", r.path, route_name(&r.path), suffix);
    }

    let mut imports = String::new();
    let mut route_entries = String::new();
    let mut layout_imports = String::new();
    let mut layout_set: Vec<String> = Vec::new();

    for (i, r) in routes.iter().enumerate() {
        let var = format!("Page{i}");
        imports.push_str(&format!(
            "import {var}, {{ meta as meta{i} }} from '{}';\n", r.file
        ));

        let layout_ref = if let Some(ref lf) = r.layout {
            let idx = layout_set.iter().position(|x| x == lf).unwrap_or_else(|| {
                let idx = layout_set.len();
                layout_imports.push_str(&format!("import Layout{idx} from '{lf}';\n"));
                layout_set.push(lf.clone());
                idx
            });
            format!("Layout{idx}")
        } else {
            "undefined".to_string()
        };

        route_entries.push_str(&format!(
            "  {{ path: '{}', component: {var}, meta: meta{i} || {{}}, layout: {layout_ref} }},\n",
            r.path
        ));
    }

    let content = format!(
        "import {{ AppRegistry }} from 'react-native';\n\
         import {{ Router }} from 'iex/router';\n\
         {layout_imports}{imports}\n\
         const routes = [\n{route_entries}];\n\n\
         function App() {{ return <Router routes={{routes}} />; }}\n\n\
         AppRegistry.registerComponent('{app_name}', () => App);\n",
    );

    write_if_changed(&gen.join("index.generated.js"), &content);
}

pub fn watch_pages(project_dir: PathBuf, app_name: String) {
    let pages_dir = project_dir.join("pages");
    if !pages_dir.is_dir() { return; }

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, _>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Remove(_) => { let _ = tx.send(()); }
                    _ => {}
                }
            }
        }).expect("cannot start file watcher");

        watcher.watch(&pages_dir, RecursiveMode::Recursive).expect("cannot watch pages/");

        while rx.recv().is_ok() {
            while rx.try_recv().is_ok() {}
            std::thread::sleep(std::time::Duration::from_millis(300));
            while rx.try_recv().is_ok() {}

            println!("📂 Pages changed — regenerating routes...");
            generate_router(&project_dir, &app_name);
        }
    });
}
