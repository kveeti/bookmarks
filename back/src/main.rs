use std::{convert::Infallible, sync::Arc, time::Duration};

use anyhow::Context;
use axum::{
    extract::{Json, State},
    http::HeaderValue,
    response::{
        sse::{Event, KeepAlive},
        Sse,
    },
    routing::{get, post},
    Extension, Router,
};
use chrono::{DateTime, Utc};
use config::CONFIG;
use data::{Data, NewBookmark};
use error::ApiError;
use hyper::header;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt};
use tower_http::cors::CorsLayer;
use tracing::{debug, level_filters::LevelFilter};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod data;
mod error;

#[derive(Clone)]
pub struct ServerState {
    data: Data,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(LevelFilter::DEBUG)
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = ServerState {
        data: Data::new(&CONFIG.database_url).await.expect("data init"),
    };

    let (tx, _) = broadcast::channel::<NewBookmark>(100);
    let tx = Arc::new(tx);

    let routes = Router::new()
        .route("/events", get(sse_handler).post(post_handler))
        .route("/sync", post(sync_handler));

    let api = Router::new()
        .nest("/api", routes)
        .layer(cors())
        .layer(Extension(tx))
        .with_state(state);

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
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_credentials(true)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Bookmark {
    id: String,
    client_id: String,
    title: String,
    url: String,
    deleted_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

type Tx = broadcast::Sender<NewBookmark>;

async fn post_handler(
    Extension(tx): Extension<Arc<Tx>>,
    Json(payload): Json<NewBookmark>,
) -> &'static str {
    let _ = tx.send(payload);
    "Message broadcasted"
}

async fn sse_handler(
    Extension(tx): Extension<Arc<Tx>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        if let Ok(message) = res {
            match serde_json::to_string(&message) {
                Ok(data) => Some(Ok(Event::default().data(data))),
                Err(_) => None,
            }
        } else {
            None
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn sync_handler(
    Extension(tx): Extension<Arc<Tx>>,
    state: State<ServerState>,
    Json(bookmarks): Json<Vec<NewBookmark>>,
) -> Result<&'static str, ApiError> {
    if bookmarks.is_empty() {
        return Ok("ok");
    }

    for bookmark in bookmarks.iter() {
        let _ = tx.send(bookmark.clone());

        state
            .data
            .bookmarks
            .upsert("1", bookmark)
            .await
            .context("error upserting bookmark")?;
    }

    Ok("ok")
}
