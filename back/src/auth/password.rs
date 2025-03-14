use anyhow::Result;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, PasswordHash, PasswordVerifier,
};

pub async fn password_hash(plaintext: &str) -> Result<String> {
    let plaintext = plaintext.to_owned();

    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);

        let argon2 = Argon2::default();

        let password_hash = argon2
            .hash_password(plaintext.as_bytes(), &salt)
            .map_err(|e| anyhow::anyhow!(e))?
            .to_string();

        Ok(password_hash)
    })
    .await?
}

pub async fn password_verify(plaintext: &str, hash: &str) -> Result<bool> {
    let hash = hash.to_owned();
    let plaintext = plaintext.to_owned();

    tokio::task::spawn_blocking(move || {
        let parsed_hash = PasswordHash::new(&hash).map_err(|e| anyhow::anyhow!(e))?;
        let ok = Argon2::default()
            .verify_password(plaintext.as_bytes(), &parsed_hash)
            .map_err(|e| anyhow::anyhow!(e))
            .is_ok();

        Ok(ok)
    })
    .await?
}
