use std::fs;
use std::path::Path;

use crate::paths::{generated_dir, packages_dir};
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
        fs::write(gen.join("index.generated.js"), index_content).expect("cannot write index.generated.js");
    }

    let watchman_config = project_abs.join(".watchmanconfig");
    if !watchman_config.exists() {
        fs::write(&watchman_config, "{}").expect("cannot write .watchmanconfig");
    }

    let metro_content = format!(
        "const {{getDefaultConfig, mergeConfig}} = require('@react-native/metro-config');\n\
         const path = require('path');\n\
         const exclusionList = require('metro-config/src/defaults/exclusionList');\n\
         module.exports = mergeConfig(getDefaultConfig(__dirname), {{\n\
         \x20 watchFolders: ['{}', '{}'],\n\
         \x20 resolver: {{\n\
         \x20\x20\x20 nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],\n\
         \x20\x20\x20 blockList: exclusionList([/apps\\/.*\\/node_modules\\/.*/]),\n\
         \x20\x20\x20 extraNodeModules: {{ 'iex': '{}' }},\n\
         \x20 }},\n\
         }});\n",
        project_abs.display(),
        packages_iex.display(),
        packages_iex.display(),
    );
    fs::write(gen.join("metro.config.generated.js"), metro_content).expect("cannot write metro.config.generated.js");

}
