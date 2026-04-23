use std::fs;
use std::path::Path;

use crate::paths::{generated_dir, packages_dir, shell_dir};
use crate::router::generate_router;
use crate::util::write_if_changed;

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
        write_if_changed(&gen.join("index.generated.js"), &index_content);
    }

    write_if_changed(
        &project_abs.join(".watchmanconfig"),
        r#"{"ignore_dirs":["node_modules","build"]}"#,
    );

    let shell = shell_dir();
    let shell_abs = fs::canonicalize(&shell).unwrap_or(shell);
    let metro_content = format!(
        "const {{getDefaultConfig, mergeConfig}} = require('@react-native/metro-config');\n\
         const path = require('path');\n\
         const exclusionList = require('metro-config/private/defaults/exclusionList').default;\n\
         const shellDir = '{}';\n\
         module.exports = mergeConfig(getDefaultConfig(shellDir), {{\n\
         \x20 watchFolders: ['{}', '{}'],\n\
         \x20 resolver: {{\n\
         \x20\x20\x20 nodeModulesPaths: [path.resolve(shellDir, 'node_modules')],\n\
         \x20\x20\x20 blockList: exclusionList([/apps\\/.*\\/node_modules\\/.*/]),\n\
         \x20\x20\x20 extraNodeModules: {{ 'iex': '{}' }},\n\
         \x20 }},\n\
         \x20 watcher: {{ healthCheck: {{ enabled: false }} }},\n\
         }});\n",
        shell_abs.display(),
        project_abs.display(),
        packages_iex.display(),
        packages_iex.display(),
    );
    write_if_changed(&gen.join("metro.config.generated.js"), &metro_content);
}
