use anyhow::Context;
use chrono::{DateTime, Utc};
use sqlx::{query, query_as, PgPool};

use crate::data::users::User;

#[derive(Clone)]
pub struct Sessions {
    pub(crate) pool: PgPool,
}

pub struct Session {
    pub id: String,
    pub user_id: String,
    pub expiry: Option<DateTime<Utc>>,
}

impl Sessions {
    pub async fn get(&self, user_id: &str, session_id: &str) -> anyhow::Result<Option<Session>> {
        let row = query_as!(
            Session,
            r#"
            select id, user_id, expiry from sessions
            where id = $1 and user_id = $2;
            "#,
            session_id,
            user_id
        )
        .fetch_optional(&self.pool)
        .await?;

        return Ok(row);
    }

    pub async fn insert(&self, session: &Session) -> anyhow::Result<()> {
        query_as!(
            Session,
            r#"
            insert into sessions (id, user_id, expiry)
            values ($1, $2, $3);
            "#,
            session.id,
            session.user_id,
            session.expiry,
        )
        .execute(&self.pool)
        .await?;

        return Ok(());
    }
}
