use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{query, query_as, PgPool, Postgres, QueryBuilder};

#[derive(Clone)]
pub struct Bookmarks {
    pub(crate) pool: PgPool,
}

impl Bookmarks {
    pub async fn upsert(&self, user_id: &str, bookmark: &Bookmark) -> anyhow::Result<()> {
        query!(
            r#"
            insert into bookmarks (user_id, id, title, url, deleted_at, updated_at)
            values ($1, $2, $3, $4, $5, $6)
            on conflict(id)
            do update set
                title = $3,
                url = $4,
                deleted_at = $5,
                updated_at = $6
            "#,
            user_id,
            &bookmark.id,
            &bookmark.title,
            &bookmark.url,
            bookmark.deleted_at,
            bookmark.updated_at,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn bulk_upsert(&self, user_id: &str, bookmarks: &[Bookmark]) -> anyhow::Result<()> {
        if bookmarks.is_empty() {
            return Ok(());
        }

        let mut query_builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "INSERT INTO bookmarks (id, title, url, deleted_at, updated_at, user_id) ",
        );

        query_builder.push_values(bookmarks, |mut b, bookmark| {
            b.push_bind(&bookmark.id)
                .push_bind(&bookmark.title)
                .push_bind(&bookmark.url)
                .push_bind(bookmark.deleted_at)
                .push_bind(bookmark.updated_at)
                .push_bind(user_id);
        });

        query_builder.push(
            " ON CONFLICT (id) DO UPDATE SET 
                title = EXCLUDED.title,
                url = EXCLUDED.url,
                deleted_at = EXCLUDED.deleted_at,
                updated_at = EXCLUDED.updated_at",
        );

        let query = query_builder.build();
        query.execute(&self.pool).await?;

        Ok(())
    }

    pub async fn get_all(
        &self,
        user_id: &str,
        last_synced_at: &DateTime<Utc>,
        cursor: Option<&str>,
        limit: i64,
    ) -> anyhow::Result<Vec<Bookmark>> {
        let bookmarks = query_as!(
            Bookmark,
            r#"
            SELECT id, title, url, deleted_at, updated_at
            FROM bookmarks
            WHERE user_id = $1
            AND updated_at > $2
            AND ($3::text IS NULL OR id > $3)
            ORDER BY id
            LIMIT $4
            "#,
            user_id,
            last_synced_at,
            cursor,
            limit,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(bookmarks)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: String,
    pub title: String,
    pub url: String,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
