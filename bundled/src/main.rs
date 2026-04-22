mod manifest;
mod storage;
mod handlers;

use axum::{Router, routing::{get, post}};
use manifest::SharedState;
use std::sync::{Arc, RwLock};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);

    let state: SharedState = Arc::new(RwLock::new(storage::load_state()));

    let app = Router::new()
        .route("/latest", get(handlers::get_latest))
        .route("/versions", get(handlers::get_versions))
        .route("/check/{version}", get(handlers::check_update))
        .route("/publish", post(handlers::publish_bundle))
        .nest_service("/bundles", ServeDir::new(storage::storage_dir()))
        .layer(CorsLayer::permissive())
        .with_state(state);

    println!("🚀 bundled server running on http://localhost:{port}");
    println!();
    println!("   GET  /latest          — latest release info");
    println!("   GET  /versions        — list all releases");
    println!("   GET  /check/:version  — check for update");
    println!("   POST /publish         — upload new bundle");
    println!("   GET  /bundles/vN/main.jsbundle — download bundle");

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
