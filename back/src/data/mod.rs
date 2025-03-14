use anyhow::Context;
use bookmarks::Bookmarks;
use sessions::Sessions;
use sqlx::{migrate, PgPool};

mod bookmarks;
pub use bookmarks::*;

mod sessions;
pub use sessions::*;

mod users;
pub use users::*;

#[derive(Clone)]
pub struct Data {
    pub bookmarks: Bookmarks,
    pub sessions: Sessions,
    pub users: Users,
}
struct Postgres {
    pub(crate) bookmarks: Bookmarks,
    pub(crate) sessions: Sessions,
    pub(crate) users: Users,
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
            sessions: Sessions {
                pool: postgres_pool.clone(),
            },
            users: Users {
                pool: postgres_pool.clone(),
            },
        };

        return Ok(Self {
            bookmarks: postgres.bookmarks,
            sessions: postgres.sessions,
            users: postgres.users,
        });
    }
}
