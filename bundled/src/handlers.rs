use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use sha2::{Sha256, Digest};
use std::fs;

use crate::manifest::{Release, SharedState};
use crate::storage::{storage_dir, save_state};

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
