use chrono::{DateTime, Utc};

use crate::config::CONFIG;

pub static SESSION_COOKIE_NAME: &str = "auth";

pub fn create_session_cookie(token: &str, expiry: &DateTime<Utc>) -> String {
    let max_age = (*expiry - Utc::now()).num_seconds();

    format!(
        "{SESSION_COOKIE_NAME}={token}; Path=/; Max-Age={max_age}; SameSite=Lax; HttpOnly;{}",
        if CONFIG.is_prod { " Secure;" } else { "" }
    )
}

pub fn create_empty_session_cookie() -> String {
    format!(
        "{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly;{}",
        if CONFIG.is_prod { " Secure;" } else { "" }
    )
}
