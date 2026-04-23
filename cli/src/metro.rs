use std::fs;
use std::path::Path;

use crate::paths::{generated_dir, packages_dir, shell_dir};
use crate::router::generate_router;

pub fn configure_metro(project_dir: &Path) {
    println!("📋 Configuring Metro to read from {}", project_dir.display());
    let gen = generated_dir();
    let project_abs = fs::canonicalize(project_dir).expect("cannot resolve project path");
    let packages_iex = packages_dir().join("iex");

    fs::create_dir_all(&gen).unwrap();

    let has_pages = project_dir.join("pages").is_dir();

    if has_pages {
        println!("📂 Detected pages/ directory — enabling file-system routing");
        generate_router(&project_abs);
    } else {
        let index_content = format!(
            "import {{ AppRegistry }} from 'react-native';\n\
             import App from '{}/App';\n\
             AppRegistry.registerComponent('iExpoShell', () => App);\n",
            project_abs.display()
        );
        let out = gen.join("index.generated.js");
        if fs::read_to_string(&out).unwrap_or_default() != index_content {
            fs::write(&out, index_content).expect("cannot write index.generated.js");
        }
    }

    let watchman_config = project_abs.join(".watchmanconfig");
    fs::write(&watchman_config, r#"{"ignore_dirs":["node_modules","build"]}"#)
        .expect("cannot write .watchmanconfig");

    let shell = shell_dir();
    let shell_abs = fs::canonicalize(&shell).unwrap_or(shell);
    let metro_content = format!(
        "const {{getDefaultConfig, mergeConfig}} = require('@react-native/metro-config');\n\
         const path = require('path');\n\
         const exclusionList = require('metro-config/src/defaults/exclusionList');\n\
         const shellDir = '{}';\n\
         module.exports = mergeConfig(getDefaultConfig(shellDir), {{\n\
         \x20 watchFolders: ['{}', '{}'],\n\
         \x20 resolver: {{\n\
         \x20\x20\x20 nodeModulesPaths: [path.resolve(shellDir, 'node_modules')],\n\
         \x20\x20\x20 blockList: exclusionList([/apps\\/.*\\/node_modules\\/.*/]),\n\
         \x20\x20\x20 extraNodeModules: {{ 'iex': '{}' }},\n\
         \x20 }},\n\
         \x20 watcher: {{\n\
         \x20\x20\x20 watchman: {{ enabled: false }},\n\
         \x20\x20\x20 healthCheck: {{ enabled: false }},\n\
         \x20 }},\n\
         }});\n",
        shell_abs.display(),
        project_abs.display(),
        packages_iex.display(),
        packages_iex.display(),
    );
    let metro_out = gen.join("metro.config.generated.js");
    if fs::read_to_string(&metro_out).unwrap_or_default() != metro_content {
        fs::write(&metro_out, metro_content).expect("cannot write metro.config.generated.js");
    }

}
