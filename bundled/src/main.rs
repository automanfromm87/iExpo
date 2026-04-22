use axum::{
    Router, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

// ─── Types ───

#[derive(Clone, Serialize, Deserialize)]
struct BundleVersion {
    version: u64,
    hash: String,
    size: u64,
    created_at: String,
    note: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct AppState {
    versions: Vec<BundleVersion>,
}

type SharedState = Arc<RwLock<AppState>>;

fn storage_dir() -> PathBuf {
    let dir = PathBuf::from("./bundles");
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn state_file() -> PathBuf {
    storage_dir().join("state.json")
}

fn load_state() -> AppState {
    if let Ok(data) = fs::read_to_string(state_file()) {
        serde_json::from_str(&data).unwrap_or(AppState { versions: vec![] })
    } else {
        AppState { versions: vec![] }
    }
}

fn save_state(state: &AppState) {
    let json = serde_json::to_string_pretty(state).unwrap();
    fs::write(state_file(), json).unwrap();
}

// ─── Handlers ───

// GET /latest — return latest version info
async fn get_latest(State(state): State<SharedState>) -> impl IntoResponse {
    let s = state.read().unwrap();
    match s.versions.last() {
        Some(v) => Json(serde_json::json!({
            "version": v.version,
            "hash": v.hash,
            "size": v.size,
            "created_at": v.created_at,
            "note": v.note,
            "url": format!("/bundles/v{}/main.jsbundle", v.version),
        })).into_response(),
        None => (StatusCode::NOT_FOUND, "no bundles published").into_response(),
    }
}

// GET /versions — list all versions
async fn get_versions(State(state): State<SharedState>) -> impl IntoResponse {
    let s = state.read().unwrap();
    Json(s.versions.clone())
}

// GET /check/:version — check if update available
async fn check_update(
    State(state): State<SharedState>,
    Path(current_version): Path<u64>,
) -> impl IntoResponse {
    let s = state.read().unwrap();
    match s.versions.last() {
        Some(latest) if latest.version > current_version => {
            Json(serde_json::json!({
                "update_available": true,
                "current": current_version,
                "latest": latest.version,
                "hash": latest.hash,
                "size": latest.size,
                "url": format!("/bundles/v{}/main.jsbundle", latest.version),
            })).into_response()
        }
        _ => Json(serde_json::json!({
            "update_available": false,
            "current": current_version,
        })).into_response(),
    }
}

// POST /publish — upload a new bundle
#[derive(Deserialize)]
struct PublishParams {
    note: Option<String>,
}

async fn publish_bundle(
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

    let mut s = state.write().unwrap();
    let version = s.versions.last().map_or(1, |v| v.version + 1);

    // Save bundle file
    let version_dir = storage_dir().join(format!("v{version}"));
    fs::create_dir_all(&version_dir).unwrap();
    fs::write(version_dir.join("main.jsbundle"), &body).unwrap();

    let entry = BundleVersion {
        version,
        hash: hash.clone(),
        size: body.len() as u64,
        created_at: chrono::Utc::now().to_rfc3339(),
        note: params.note.unwrap_or_default(),
    };

    s.versions.push(entry);
    save_state(&s);

    println!("📦 Published v{version} ({} bytes, hash: {})", body.len(), &hash[..12]);

    Json(serde_json::json!({
        "version": version,
        "hash": hash,
        "size": body.len(),
        "url": format!("/bundles/v{version}/main.jsbundle"),
    })).into_response()
}

// ─── Main ───

#[tokio::main]
async fn main() {
    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);

    let state: SharedState = Arc::new(RwLock::new(load_state()));

    let app = Router::new()
        .route("/latest", get(get_latest))
        .route("/versions", get(get_versions))
        .route("/check/{version}", get(check_update))
        .route("/publish", post(publish_bundle))
        .nest_service("/bundles", ServeDir::new(storage_dir()))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    println!("🚀 bundled server running on http://localhost:{port}");
    println!();
    println!("   GET  /latest          — latest version info");
    println!("   GET  /versions        — list all versions");
    println!("   GET  /check/:version  — check for update");
    println!("   POST /publish         — upload new bundle");
    println!("   GET  /bundles/vN/main.jsbundle — download bundle");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
