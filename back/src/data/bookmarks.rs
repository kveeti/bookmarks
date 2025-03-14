use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{query, PgPool};

#[derive(Clone)]
pub struct Bookmarks {
    pub(crate) pool: PgPool,
}

impl Bookmarks {
    pub async fn upsert(&self, user_id: &str, bookmark: &Bookmark) -> anyhow::Result<()> {
        query!(
            r#"
            insert into bookmarks (id, client_id, title, url, deleted_at, created_at, updated_at, user_id)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict(id)
            do update set
                title = $3,
                url = $4,
                deleted_at = $5,
                updated_at = $6
            "#,
            &bookmark.id,
            &bookmark.client_id,
            &bookmark.title,
            &bookmark.url,
            bookmark.deleted_at,
            bookmark.created_at,
            bookmark.updated_at,
            user_id,
        )
        .execute(&self.pool)
        .await?;

        return Ok(());
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: String,
    pub client_id: String,
    pub title: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
