use anyhow::{anyhow, Context};
use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use axum_extra::{headers::Cookie, typed_header::TypedHeaderRejectionReason, TypedHeader};
use hyper::header::COOKIE;

use crate::{config::CONFIG, data::Data, error::ApiError};

use super::{cookie::SESSION_COOKIE_NAME, token::verify_token};

pub struct UserId(pub String);

impl<S> FromRequestParts<S> for UserId
where
    Data: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let cookies: TypedHeader<Cookie> = TypedHeader::from_request_parts(parts, state)
            .await
            .map_err(|e| match *e.name() {
                COOKIE => match e.reason() {
                    TypedHeaderRejectionReason::Missing => {
                        ApiError::Unauthorized("no cookie".to_owned())
                    }
                    _ => ApiError::UnexpectedError(anyhow!("error getting cookies")),
                },
                _ => ApiError::UnexpectedError(anyhow!("error getting cookies")),
            })?;

        let session_cookie = cookies
            .get(SESSION_COOKIE_NAME)
            .ok_or(ApiError::Unauthorized("no cookie".to_owned()))?;

        let (user_id, session_id) = verify_token(&CONFIG.secret, session_cookie)
            .map_err(|_| ApiError::Unauthorized("invalid auth".to_owned()))?;

        let data = Data::from_ref(state);

        data.sessions
            .get(&user_id, &session_id)
            .await
            .context("error getting context")?
            .ok_or(ApiError::Unauthorized("no session".to_owned()))?;

        return Ok(UserId(user_id.to_owned()));
    }
}

pub struct AuthData {
    pub user_id: String,
    pub session_id: String,
}

pub struct Auth(pub AuthData);

impl<S> FromRequestParts<S> for Auth
where
    Data: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let cookies: TypedHeader<Cookie> = TypedHeader::from_request_parts(parts, state)
            .await
            .map_err(|e| match *e.name() {
                COOKIE => match e.reason() {
                    TypedHeaderRejectionReason::Missing => {
                        ApiError::Unauthorized("no cookie".to_owned())
                    }
                    _ => ApiError::UnexpectedError(anyhow!("error getting cookies")),
                },
                _ => ApiError::UnexpectedError(anyhow!("error getting cookies")),
            })?;

        let session_cookie = cookies
            .get(SESSION_COOKIE_NAME)
            .ok_or(ApiError::Unauthorized("no cookie".to_owned()))?;

        let (user_id, session_id) = verify_token(&CONFIG.secret, session_cookie)
            .map_err(|_| ApiError::Unauthorized("invalid auth".to_owned()))?;

        let data = Data::from_ref(state);

        data.sessions
            .get(&user_id, &session_id)
            .await
            .context("error getting context")?
            .ok_or(ApiError::Unauthorized("no session".to_owned()))?;

        return Ok(Auth(AuthData {
            user_id: user_id.to_owned(),
            session_id: session_id.to_owned(),
        }));
    }
}
