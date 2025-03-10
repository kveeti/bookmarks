use axum::{http::HeaderValue, Router};
use config::CONFIG;
use tower_http::cors::CorsLayer;
use tracing::{debug, level_filters::LevelFilter};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(LevelFilter::DEBUG)
        .with(tracing_subscriber::fmt::layer())
        .init();

    let routes = Router::new();

    let api = Router::new().nest("/api", routes).layer(cors());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    debug!("listening at {}", listener.local_addr().unwrap());

    axum::serve(listener, api).await.unwrap();
}

fn cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(
            CONFIG
                .front_url
                .parse::<HeaderValue>()
                .expect("allow origin should be valid"),
        )
        .allow_credentials(true)
}
