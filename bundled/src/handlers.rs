use axum::{
    Json,
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use sha2::{Sha256, Digest};
use std::fs;

use crate::manifest::{AppManifest, AppVersion, Release, SharedState};
use crate::storage::{
    app_bundle_path, list_app_ids, load_app_manifest, save_app_manifest,
    save_state, storage_dir,
};

pub async fn get_latest(State(state): State<SharedState>) -> impl IntoResponse {
    let s = state.read().unwrap();
    match s.versions.last() {
        Some(v) => Json(serde_json::json!({
            "id": v.id,
            "version": v.version,
            "runtime_version": v.runtime_version,
            "hash": v.hash,
            "size": v.size,
            "channel": v.channel,
            "note": v.note,
            "created_at": v.created_at,
            "url": format!("/bundles/v{}/main.jsbundle", v.version),
        })).into_response(),
        None => (StatusCode::NOT_FOUND, "no bundles published").into_response(),
    }
}

pub async fn get_versions(State(state): State<SharedState>) -> impl IntoResponse {
    let s = state.read().unwrap();
    Json(s.versions.clone())
}

#[derive(Deserialize)]
pub struct CheckParams {
    pub channel: Option<String>,
}

pub async fn check_update(
    State(state): State<SharedState>,
    Path(current_version): Path<u64>,
    axum::extract::Query(params): axum::extract::Query<CheckParams>,
) -> impl IntoResponse {
    let s = state.read().unwrap();
    let channel = params.channel.as_deref().unwrap_or("production");
    let latest = s.versions.iter().rev().find(|v| v.channel == channel);

    match latest {
        Some(v) if v.version > current_version => {
            Json(serde_json::json!({
                "update_available": true,
                "current": current_version,
                "latest": v.version,
                "hash": v.hash,
                "size": v.size,
                "channel": v.channel,
                "url": format!("/bundles/v{}/main.jsbundle", v.version),
            })).into_response()
        }
        _ => Json(serde_json::json!({
            "update_available": false,
            "current": current_version,
        })).into_response(),
    }
}

#[derive(Deserialize)]
pub struct PublishParams {
    pub note: Option<String>,
    pub channel: Option<String>,
    pub runtime_version: Option<String>,
}

pub async fn publish_bundle(
    State(state): State<SharedState>,
    axum::extract::Query(params): axum::extract::Query<PublishParams>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, "empty bundle").into_response();
    }

    let mut hasher = Sha256::new();
    hasher.update(&body);
    let hash = format!("{:x}", hasher.finalize());

    let channel = params.channel.unwrap_or_else(|| "production".to_string());
    let runtime_version = params.runtime_version.unwrap_or_else(|| "unknown".to_string());

    let mut s = state.write().unwrap();
    let version = s.versions.last().map_or(1, |v| v.version + 1);
    let id = format!("{}-v{}-{}", channel, version, &hash[..8]);

    let version_dir = storage_dir().join(format!("v{version}"));
    fs::create_dir_all(&version_dir).unwrap();
    fs::write(version_dir.join("main.jsbundle"), &body).unwrap();

    let release = Release {
        id: id.clone(),
        version,
        runtime_version,
        hash: hash.clone(),
        size: body.len() as u64,
        channel: channel.clone(),
        note: params.note.unwrap_or_default(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    s.versions.push(release);
    save_state(&s);

    println!("📦 Published {} ({} bytes, channel: {})", id, body.len(), channel);

    Json(serde_json::json!({
        "id": id,
        "version": version,
        "channel": channel,
        "hash": hash,
        "size": body.len(),
        "url": format!("/bundles/v{version}/main.jsbundle"),
    })).into_response()
}

// ─── Multi-app catalog ─────────────────────────────────────────────

fn bundle_url(id: &str, version: u64) -> String {
    format!("/apps/{id}/bundles/v{version}/main.jsbundle")
}

pub async fn list_apps() -> impl IntoResponse {
    let mut catalog = Vec::new();
    for id in list_app_ids() {
        let Some(m) = load_app_manifest(&id) else { continue };
        catalog.push(serde_json::json!({
            "id": m.id,
            "displayName": m.display_name,
            "icon": m.icon,
            "description": m.description,
            "latestVersion": m.latest_version,
            "bundleUrl": bundle_url(&m.id, m.latest_version),
        }));
    }
    Json(catalog)
}

pub async fn get_app_manifest(Path(id): Path<String>) -> impl IntoResponse {
    match load_app_manifest(&id) {
        Some(m) => Json(m).into_response(),
        None => (StatusCode::NOT_FOUND, format!("app not found: {id}")).into_response(),
    }
}

pub async fn get_app_bundle(
    Path((id, version)): Path<(String, u64)>,
) -> impl IntoResponse {
    let path = app_bundle_path(&id, version);
    match fs::read(&path) {
        Ok(bytes) => (
            [(header::CONTENT_TYPE, "application/javascript")],
            bytes,
        ).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            format!("bundle not found: {id} v{version}"),
        ).into_response(),
    }
}

#[derive(Deserialize)]
pub struct AppPublishParams {
    pub display_name: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub note: Option<String>,
    pub runtime_version: Option<String>,
}

pub async fn publish_app(
    Path(id): Path<String>,
    axum::extract::Query(params): axum::extract::Query<AppPublishParams>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, "empty bundle").into_response();
    }
    if id.is_empty() || id.contains('/') || id.contains('.') {
        return (StatusCode::BAD_REQUEST, format!("invalid app id: {id}")).into_response();
    }

    let mut hasher = Sha256::new();
    hasher.update(&body);
    let hash = format!("{:x}", hasher.finalize());

    let mut manifest = load_app_manifest(&id).unwrap_or_else(|| AppManifest {
        id: id.clone(),
        display_name: id.clone(),
        icon: String::new(),
        description: String::new(),
        latest_version: 0,
        versions: Vec::new(),
    });

    let version = manifest.latest_version + 1;
    let bundle_path = app_bundle_path(&id, version);
    if let Some(parent) = bundle_path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(&bundle_path, &body).unwrap();

    if let Some(v) = params.display_name { manifest.display_name = v; }
    if let Some(v) = params.icon { manifest.icon = v; }
    if let Some(v) = params.description { manifest.description = v; }

    manifest.latest_version = version;
    manifest.versions.push(AppVersion {
        version,
        hash: hash.clone(),
        size: body.len() as u64,
        runtime_version: params.runtime_version.unwrap_or_else(|| "unknown".to_string()),
        note: params.note.unwrap_or_default(),
        created_at: chrono::Utc::now().to_rfc3339(),
    });

    save_app_manifest(&manifest);

    println!("📦 Published app {id} v{version} ({} bytes)", body.len());

    Json(serde_json::json!({
        "id": id,
        "version": version,
        "hash": hash,
        "size": body.len(),
        "url": bundle_url(&id, version),
    })).into_response()
}
