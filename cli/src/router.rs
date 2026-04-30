use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;

use notify::{EventKind, RecursiveMode, Watcher};

use crate::paths::generated_dir;
use crate::project::is_js_file;
use crate::util::{js_string, write_if_changed};

pub struct ScannedRoute {
    pub path: String,
    pub file: String,
    pub layouts: Vec<String>,
}

pub fn scan_pages(dir: &Path, prefix: &str, parent_layouts: &[String]) -> Vec<ScannedRoute> {
    let mut routes = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut layouts = parent_layouts.to_vec();
    for ext in ["tsx", "ts", "jsx", "js"] {
        let layout_file = dir.join(format!("_layout.{ext}"));
        if layout_file.exists() {
            layouts.push(layout_file.to_string_lossy().to_string());
            break;
        }
    }

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('_') { continue; }

        if path.is_dir() && name != "node_modules" {
            let sub = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            routes.extend(scan_pages(&path, &sub, &layouts));
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
            layouts: layouts.clone(),
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

pub struct RoutesBlock {
    pub imports: String,
    pub layout_imports: String,
    pub entries: String,
}

/// Per-call dedup table for layout imports. Threading one across multiple
/// `render_routes_block` calls (as the hub does for each app) lets shared
/// layout files import once instead of per-app.
pub struct LayoutDedup {
    seen: HashMap<String, usize>,
    next: usize,
}

impl LayoutDedup {
    pub fn new() -> Self {
        Self { seen: HashMap::new(), next: 0 }
    }
}

/// Generate the `import` lines and the `routes: [...]` table body for a set of
/// scanned routes. `var_prefix` namespaces the per-route `Page` / `meta`
/// identifiers so multiple apps' blocks can share one JS scope.
pub fn render_routes_block(
    routes: &[ScannedRoute],
    var_prefix: &str,
    dedup: &mut LayoutDedup,
) -> RoutesBlock {
    let mut imports = String::new();
    let mut layout_imports = String::new();
    let mut entries = String::new();

    for (i, r) in routes.iter().enumerate() {
        let page_var = format!("{var_prefix}Page{i}");
        let meta_var = format!("{var_prefix}meta{i}");
        imports.push_str(&format!(
            "import {page_var}, {{ meta as {meta_var} }} from {};\n",
            js_string(&r.file)
        ));

        let mut layout_refs: Vec<String> = Vec::with_capacity(r.layouts.len());
        for lf in &r.layouts {
            let idx = if let Some(&idx) = dedup.seen.get(lf) {
                idx
            } else {
                let idx = dedup.next;
                dedup.next += 1;
                dedup.seen.insert(lf.clone(), idx);
                layout_imports.push_str(&format!(
                    "import Layout{idx} from {};\n",
                    js_string(lf)
                ));
                idx
            };
            layout_refs.push(format!("Layout{idx}"));
        }

        let layouts_str = format!("[{}]", layout_refs.join(", "));
        entries.push_str(&format!(
            "  {{ path: {}, component: {page_var}, meta: {meta_var} || {{}}, layouts: {layouts_str} }},\n",
            js_string(&r.path)
        ));
    }

    RoutesBlock { imports, layout_imports, entries }
}

pub fn generate_router(project_abs: &Path, app_name: &str) {
    let gen = generated_dir();
    fs::create_dir_all(&gen).unwrap();

    let pages_dir = project_abs.join("pages");
    let routes = scan_pages(&pages_dir, "", &[]);

    if routes.is_empty() {
        eprintln!("⚠️  pages/ directory is empty");
        return;
    }

    println!("   Routes:");
    for r in &routes {
        let suffix = if r.path.contains(':') { " (dynamic)" } else { "" };
        println!("     {} → {}{}", r.path, route_name(&r.path), suffix);
    }

    let mut dedup = LayoutDedup::new();
    let block = render_routes_block(&routes, "", &mut dedup);

    let content = format!(
        "import './constants.generated';\n\
         import {{ AppRegistry }} from 'react-native';\n\
         import {{ Router }} from 'iex/router';\n\
         {}{}\n\
         const routes = [\n{}];\n\n\
         function App() {{ return <Router routes={{routes}} />; }}\n\n\
         AppRegistry.registerComponent({}, () => App);\n",
        block.layout_imports,
        block.imports,
        block.entries,
        js_string(app_name),
    );

    write_if_changed(&gen.join("index.generated.js"), &content);
}

pub fn watch_pages(project_dir: PathBuf, app_name: String) {
    let pages_dir = project_dir.join("pages");
    if !pages_dir.is_dir() { return; }

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, _>| {
            let Ok(event) = res else { return };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Remove(_)) {
                return;
            }
            if !event.paths.iter().any(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(is_js_file)
            }) {
                return;
            }
            let _ = tx.send(());
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
