use anyhow::Context;
use serde::{Deserialize, Serialize};
use sqlx::{query, query_as, PgPool};

use super::Session;

#[derive(Clone)]
pub struct Users {
    pub(crate) pool: PgPool,
}

impl Users {
    pub async fn get(&self, id: &str) -> anyhow::Result<Option<User>> {
        let row = query_as!(User, r#"select * from users where id = $1;"#, id)
            .fetch_optional(&self.pool)
            .await?;

        return Ok(row);
    }

    pub async fn get_by_username(&self, username: &str) -> anyhow::Result<Option<User>> {
        let row = query_as!(
            User,
            r#"select * from users where username = $1;"#,
            username
        )
        .fetch_optional(&self.pool)
        .await?;

        return Ok(row);
    }

    pub async fn insert(&self, user: &User) -> anyhow::Result<()> {
        query!(
            r#"insert into users (id, username, password_hash) values ($1, $2, $3);"#,
            &user.id,
            &user.username,
            &user.password_hash
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn insert_with_session(&self, user: &User, session: &Session) -> anyhow::Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("error beginning transaction")?;

        query!(
            r#"
            insert into users (id, username, password_hash)
            values ($1, $2, $3);
            "#,
            user.id,
            user.username,
            user.password_hash,
        )
        .execute(&mut *tx)
        .await
        .context("error inserting user")?;

        query!(
            r#"
            insert into sessions (id, user_id, expiry)
            values ($1, $2, $3);
            "#,
            session.id,
            session.user_id,
            session.expiry,
        )
        .execute(&mut *tx)
        .await
        .context("error inserting session")?;

        tx.commit().await.context("error committing transaction")?;

        return Ok(());
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
}
