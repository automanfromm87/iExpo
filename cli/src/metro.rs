use std::fs;
use std::path::Path;

use crate::config::IexConfig;
use crate::constants::generate_constants;
use crate::paths::{generated_dir, packages_dir, shell_dir};
use crate::router::generate_router;
use crate::util::{js_string, write_if_changed};

/// Render the contents of `metro.config.generated.js`. Shared by single-app
/// (`configure_metro`) and hub (`hub::generate_hub_metro`) — they only differ
/// in which directories Metro should watch for HMR.
pub fn render_metro_config(watch_folders: &[&Path], packages_iex: &Path) -> String {
    let shell = shell_dir();
    let shell_abs = fs::canonicalize(&shell).unwrap_or(shell);

    let watch_arr: String = {
        let entries: Vec<String> = watch_folders
            .iter()
            .map(|p| js_string(&p.display().to_string()))
            .collect();
        format!("[{}]", entries.join(", "))
    };

    format!(
        "const {{getDefaultConfig, mergeConfig}} = require('@react-native/metro-config');\n\
         const path = require('path');\n\
         const exclusionList = require('metro-config/private/defaults/exclusionList').default;\n\
         const shellDir = {};\n\
         const iexRuntime = path.resolve(shellDir, 'iex-runtime.js');\n\
         const iexStubs = path.resolve(shellDir, 'iex-stubs.js');\n\
         const RN_INITIALIZE_CORE = require.resolve('react-native/Libraries/Core/InitializeCore');\n\
         // Explicit shims for deep imports that have a real macOS implementation.\n\
         const IEX_DEEP_SHIMS = {{\n\
         \x20 'react-native/Libraries/Components/Clipboard/Clipboard': 'iex-clipboard.js',\n\
         }};\n\
         // Narrowest set of deep imports that genuinely need to be neutralised:\n\
         // these load native-bridge invariants at module-init time and are\n\
         // pulled in transitively by user code we can't easily intercept.\n\
         const IEX_STUB_PREFIXES = [\n\
         \x20 'react-native/Libraries/TurboModule/',\n\
         \x20 'react-native/Libraries/BatchedBridge/',\n\
         \x20 'react-native/src/private/specs',\n\
         ];\n\
         module.exports = mergeConfig(getDefaultConfig(shellDir), {{\n\
         \x20 watchFolders: {watch_arr},\n\
         \x20 resolver: {{\n\
         \x20\x20\x20 nodeModulesPaths: [path.resolve(shellDir, 'node_modules')],\n\
         \x20\x20\x20 blockList: exclusionList([/apps\\/.*\\/node_modules\\/.*/]),\n\
         \x20\x20\x20 extraNodeModules: {{ 'iex': {} }},\n\
         \x20\x20\x20 platforms: ['ios', 'android', 'macos', 'native'],\n\
         \x20\x20\x20 resolveRequest: (context, moduleName, platform) => {{\n\
         \x20\x20\x20\x20\x20 if (platform === 'macos') {{\n\
         \x20\x20\x20\x20\x20\x20\x20 if (moduleName === 'react-native') {{\n\
         \x20\x20\x20\x20\x20\x20\x20\x20\x20 return {{ type: 'sourceFile', filePath: iexRuntime }};\n\
         \x20\x20\x20\x20\x20\x20\x20 }}\n\
         \x20\x20\x20\x20\x20\x20\x20 const shimmed = IEX_DEEP_SHIMS[moduleName];\n\
         \x20\x20\x20\x20\x20\x20\x20 if (shimmed) {{\n\
         \x20\x20\x20\x20\x20\x20\x20\x20\x20 return {{ type: 'sourceFile', filePath: path.resolve(shellDir, shimmed) }};\n\
         \x20\x20\x20\x20\x20\x20\x20 }}\n\
         \x20\x20\x20\x20\x20\x20\x20 if (IEX_STUB_PREFIXES.some(p => moduleName.startsWith(p))) {{\n\
         \x20\x20\x20\x20\x20\x20\x20\x20\x20 return {{ type: 'sourceFile', filePath: iexStubs }};\n\
         \x20\x20\x20\x20\x20\x20\x20 }}\n\
         \x20\x20\x20\x20\x20\x20\x20 if (moduleName.startsWith('react-native/') || moduleName.startsWith('@react-native/')) {{\n\
         \x20\x20\x20\x20\x20\x20\x20\x20\x20 throw new Error('iEx macOS: unsupported deep import \"' + moduleName + '\". Add a shim in iex-runtime.js or extend IEX_DEEP_SHIMS / IEX_STUB_PREFIXES.');\n\
         \x20\x20\x20\x20\x20\x20\x20 }}\n\
         \x20\x20\x20\x20\x20 }}\n\
         \x20\x20\x20\x20\x20 return context.resolveRequest(context, moduleName, platform);\n\
         \x20\x20\x20 }},\n\
         \x20 }},\n\
         \x20 serializer: {{\n\
         \x20\x20\x20 // Skip RN's InitializeCore for macOS bundles; iex-runtime handles setup itself.\n\
         \x20\x20\x20 getModulesRunBeforeMainModule: (entryFile) => {{\n\
         \x20\x20\x20\x20\x20 if (typeof entryFile === 'string' && entryFile.endsWith('index.macos.js')) return [];\n\
         \x20\x20\x20\x20\x20 return [RN_INITIALIZE_CORE];\n\
         \x20\x20\x20 }},\n\
         \x20\x20\x20 getPolyfills: () => require('@react-native/js-polyfills')(),\n\
         \x20 }},\n\
         \x20 watcher: {{ healthCheck: {{ enabled: false }} }},\n\
         }});\n",
        js_string(&shell_abs.display().to_string()),
        js_string(&packages_iex.display().to_string()),
    )
}

pub fn configure_metro(project_dir: &Path, cfg: &IexConfig) {
    println!("📋 Configuring Metro to read from {}", project_dir.display());
    let gen = generated_dir();
    let project_abs = fs::canonicalize(project_dir).expect("cannot resolve project path");
    let packages_iex = packages_dir().join("iex");

    fs::create_dir_all(&gen).unwrap();

    generate_constants(cfg, project_dir);

    let has_pages = project_dir.join("pages").is_dir();

    if has_pages {
        println!("📂 Detected pages/ directory — enabling file-system routing");
        generate_router(&project_abs, &cfg.name);
    } else {
        let index_content = format!(
            "import './constants.generated';\n\
             import {{ AppRegistry }} from 'react-native';\n\
             import App from {};\n\
             AppRegistry.registerComponent({}, () => App);\n",
            js_string(&format!("{}/App", project_abs.display())),
            js_string(&cfg.name),
        );
        write_if_changed(&gen.join("index.generated.js"), &index_content);
    }

    write_if_changed(
        &project_abs.join(".watchmanconfig"),
        r#"{"ignore_dirs":["node_modules","build"]}"#,
    );

    let shell_abs = fs::canonicalize(shell_dir()).unwrap_or_else(|_| shell_dir());
    let metro_content = render_metro_config(&[&shell_abs, &project_abs], &packages_iex);
    write_if_changed(&gen.join("metro.config.generated.js"), &metro_content);
}
