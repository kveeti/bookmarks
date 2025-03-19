use std::{convert::Infallible, sync::Arc, time::Duration};

use anyhow::Context;
use auth::{
    create_empty_session_cookie, create_session_cookie, create_token, password_hash,
    password_verify, Auth, UserId,
};
use axum::{
    extract::{Json, Query, State},
    http::HeaderValue,
    response::{
        sse::{Event, KeepAlive},
        AppendHeaders, IntoResponse, Sse,
    },
    routing::{get, post},
    Extension, Router,
};
use chrono::{DateTime, Utc};
use config::CONFIG;
use data::{Bookmark, Data, Session, User};
use error::ApiError;
use hyper::{header, Method};
use id::new_id;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt};
use tower_http::cors::CorsLayer;
use tracing::{debug, level_filters::LevelFilter};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod config;
mod data;
mod error;
mod id;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(LevelFilter::DEBUG)
        .with(tracing_subscriber::fmt::layer())
        .init();

    let data = Data::new(&CONFIG.database_url).await.expect("data init");

    let (tx, _) = broadcast::channel::<Message>(100);
    let tx = Arc::new(tx);

    let routes = Router::new()
        .route("/events", get(sse_handler))
        .route("/sync", post(sync_handler))
        .route("/bootstrap", get(bootstrap_handler))
        .route("/me", get(me_handler))
        .route("/auth/login", post(login_handler))
        .route("/auth/register", post(register_handler))
        .route("/auth/logout", post(logout_handler));

    let api = Router::new()
        .nest("/api", routes)
        .layer(cors())
        .layer(Extension(tx))
        .with_state(data);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    debug!("listening at {}", listener.local_addr().unwrap());

    axum::serve(listener, api).await.unwrap();
}

fn cors() -> CorsLayer {
    CorsLayer::new()
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::OPTIONS,
            Method::PATCH,
            Method::DELETE,
            Method::HEAD,
        ])
        .allow_headers(vec![
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::ACCEPT_ENCODING,
            header::ACCEPT_LANGUAGE,
            header::COOKIE,
        ])
        .allow_origin(
            CONFIG
                .front_url
                .parse::<HeaderValue>()
                .expect("allow origin should be valid"),
        )
}

#[derive(Serialize, Deserialize, Clone)]
struct Message {
    user_id: String,
    bookmark: Bookmark,
}

type Tx = broadcast::Sender<Message>;

async fn sse_handler(
    Extension(tx): Extension<Arc<Tx>>,
    UserId(user_id): UserId,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(move |res| {
        if let Ok(message) = res {
            if message.user_id != user_id {
                return None;
            }

            match serde_json::to_string(&message.bookmark) {
                Ok(data) => Some(Ok(Event::default().data(data))),
                Err(_) => None,
            }
        } else {
            None
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncRequest {
    bookmarks: Vec<Bookmark>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BootstrapRequest {
    cursor: Option<String>,
    limit: Option<i64>,
    from: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BootstrapResponse {
    bookmarks: Vec<Bookmark>,
    next_cursor: Option<String>,
}

async fn bootstrap_handler(
    data: State<Data>,
    UserId(user_id): UserId,
    Query(req): Query<BootstrapRequest>,
) -> Result<Json<BootstrapResponse>, ApiError> {
    let limit = req.limit.unwrap_or(100);

    let bookmarks = data
        .bookmarks
        .get_all(&user_id, &req.from, req.cursor.as_deref(), limit)
        .await
        .context("error getting bookmarks")?;

    let next_cursor = if bookmarks.len() == limit as usize {
        bookmarks.last().map(|b| b.id.clone())
    } else {
        None
    };

    Ok(Json(BootstrapResponse {
        bookmarks,
        next_cursor,
    }))
}

async fn sync_handler(
    Extension(tx): Extension<Arc<Tx>>,
    data: State<Data>,
    UserId(user_id): UserId,
    Json(req): Json<SyncRequest>,
) -> Result<(), ApiError> {
    data.bookmarks
        .bulk_upsert(&user_id, &req.bookmarks)
        .await
        .context("error upserting bookmarks")?;

    for bookmark in req.bookmarks {
        let _ = tx.send(Message {
            user_id: user_id.to_owned(),
            bookmark,
        });
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
struct AuthForm {
    pub username: String,
    pub password: String,
}

async fn login_handler(
    data: State<Data>,
    Json(input): Json<AuthForm>,
) -> Result<impl IntoResponse, ApiError> {
    let user = data
        .users
        .get_by_username(&input.username)
        .await
        .context("error getting user by username")?;

    let user = match user {
        Some(user) => {
            if !password_verify(&input.password, &user.password_hash).await? {
                return Err(ApiError::Unauthorized("invalid creds".to_owned()))?;
            }

            user
        }
        None => {
            let user = User {
                id: new_id(),
                password_hash: password_hash(&input.password)
                    .await
                    .context("error hashing password")?,
                username: input.username,
            };

            data.users
                .insert(&user)
                .await
                .context("error inserting user")?;

            user
        }
    };

    let session_expiry = Utc::now() + Duration::from_secs(60 * 60 * 24 * 30);
    let session = &Session {
        id: new_id(),
        user_id: user.id.to_owned(),
        expiry: Some(session_expiry),
    };

    data.sessions
        .insert(session)
        .await
        .context("error inserting session")?;

    let token = create_token(&CONFIG.secret, &user.id, &session.id);
    let cookie = create_session_cookie(&token, &session_expiry);

    Ok(AppendHeaders([(
        header::SET_COOKIE,
        cookie
            .parse::<HeaderValue>()
            .context("error parsing cookie")?,
    )]))
}

async fn register_handler(
    data: State<Data>,
    Json(input): Json<AuthForm>,
) -> Result<impl IntoResponse, ApiError> {
    let user = data
        .users
        .get_by_username(&input.username)
        .await
        .context("error getting user by username")?;

    if user.is_some() {
        return Err(ApiError::Unauthorized("username taken".to_owned()))?;
    }

    let user = User {
        id: new_id(),
        username: input.username,
        password_hash: password_hash(&input.password)
            .await
            .context("error hashing password")?,
    };

    let session_expiry = Utc::now() + Duration::from_secs(60 * 60 * 24 * 30);
    let session = &Session {
        id: new_id(),
        user_id: user.id.to_owned(),
        expiry: Some(session_expiry),
    };

    data.users
        .insert_with_session(&user, &session)
        .await
        .context("error inserting user with session")?;

    let token = create_token(&CONFIG.secret, &user.id, &session.id);
    let cookie = create_session_cookie(&token, &session_expiry);

    Ok(AppendHeaders([(
        header::SET_COOKIE,
        cookie
            .parse::<HeaderValue>()
            .context("error parsing cookie")?,
    )]))
}

async fn me_handler(
    data: State<Data>,
    UserId(user_id): UserId,
) -> Result<impl IntoResponse, ApiError> {
    let user = data
        .users
        .get(&user_id)
        .await
        .context("error getting user")?
        .ok_or(ApiError::Unauthorized("user not found".to_owned()))?;

    Ok(Json(json!({
        "id": user.id,
        "username": user.username,
    })))
}

async fn logout_handler(
    data: State<Data>,
    Auth(auth): Auth,
) -> Result<impl IntoResponse, ApiError> {
    data.sessions
        .delete(&auth.user_id, &auth.session_id)
        .await
        .context("error deleting session")?;

    Ok(AppendHeaders([(
        header::SET_COOKIE,
        create_empty_session_cookie()
            .parse::<HeaderValue>()
            .context("error parsing cookie")?,
    )]))
}
