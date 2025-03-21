use anyhow::Context;
use dotenv::dotenv;
use once_cell::sync::Lazy;

#[derive(Clone, serde::Deserialize)]
pub struct Config {
    pub database_url: String,
    pub front_url: String,
    pub secret: String,
    pub is_prod: bool,
}

impl Config {
    pub fn new() -> Result<Self, anyhow::Error> {
        dotenv().expect("error loading environment variables from .env");

        let config = envy::from_env::<Self>().context("invalid environment variables")?;

        return Ok(config);
    }
}

pub static CONFIG: Lazy<Config> = Lazy::new(|| Config::new().expect("error loading config"));
