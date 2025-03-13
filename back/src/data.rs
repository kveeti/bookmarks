use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{migrate, query, query_as, PgPool};

#[derive(Clone)]
pub struct Data {
    pub bookmarks: Bookmarks,
}

impl Data {
    pub async fn new(url: &str) -> anyhow::Result<Self> {
        let postgres_pool = PgPool::connect(url)
            .await
            .context("error connecting to postgres")?;

        migrate!()
            .run(&postgres_pool)
            .await
            .context("error running postgres migrations")?;

        let postgres = Postgres {
            bookmarks: Bookmarks {
                pool: postgres_pool.clone(),
            },
        };

        return Ok(Self {
            bookmarks: postgres.bookmarks,
        });
    }
}

struct Postgres {
    bookmarks: Bookmarks,
}

#[derive(Clone)]
pub struct Bookmarks {
    pool: PgPool,
}

impl Bookmarks {
    pub async fn get_all(&self, user_id: &str) -> Result<Vec<Bookmark>, anyhow::Error> {
        let rows = query_as!(
            Bookmark,
            r#"select * from bookmarks order by created_at desc;"#
        )
        .fetch_all(&self.pool)
        .await?;

        return Ok(rows);
    }

    pub async fn insert(&self, user_id: &str, bookmark: &NewBookmark) -> Result<(), anyhow::Error> {
        query!(
            r#"insert into bookmarks (id, title, url) values ($1, $2, $3)"#,
            bookmark.id,
            bookmark.title,
            bookmark.url,
        )
        .execute(&self.pool)
        .await?;

        return Ok(());
    }

    pub async fn delete_one(&self, user_id: &str, id: &str) -> Result<()> {
        query!(r#"delete from bookmarks where id = $1;"#, &id)
            .execute(&self.pool)
            .await?;

        return Ok(());
    }

    pub async fn update(&self, user_id: &str, bookmark: NewBookmark) -> Result<()> {
        query!(
            r#"update bookmarks set title = $1, url = $2 where id = $3"#,
            &bookmark.title,
            &bookmark.url,
            &bookmark.id,
        )
        .execute(&self.pool)
        .await?;

        return Ok(());
    }

    pub async fn upsert(&self, user_id: &str, bookmark: &NewBookmark) -> Result<()> {
        query!(
            r#"
            insert into bookmarks (id, client_id, title, url, deleted_at, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $6, $7)
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
        )
        .execute(&self.pool)
        .await?;

        return Ok(());
    }
}

#[derive(Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub client_id: String,
    pub title: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NewBookmark {
    pub id: String,
    pub client_id: String,
    pub title: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
