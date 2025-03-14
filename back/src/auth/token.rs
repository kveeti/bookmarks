use hmac::{Hmac, Mac};
use sha2::Sha256;

static ID_SEPARATOR: &str = ".";
static TOKEN_SEPARATOR: &str = ":";

type HmacSha256 = Hmac<Sha256>;

pub fn create_token(secret: &str, user_id: &str, session_id: &str) -> String {
    let data = format!("{user_id}{ID_SEPARATOR}{session_id}");

    let signature = create_signature(secret, &data);

    return format!("{data}{TOKEN_SEPARATOR}{signature}");
}

pub fn verify_token(secret: &str, token: &str) -> Result<(String, String), anyhow::Error> {
    let parts = token.split(TOKEN_SEPARATOR).collect::<Vec<&str>>();

    if parts.len() != 2 {
        return Err(anyhow::anyhow!("not enough parts"));
    }

    let ids = parts[0].split(ID_SEPARATOR).collect::<Vec<&str>>();

    if ids.len() != 2 {
        return Err(anyhow::anyhow!("not enough ids"));
    }

    let user_id = ids[0];
    let session_id = ids[1];
    let signature = parts[1];

    let expected_signature =
        create_signature(secret, &format!("{user_id}{ID_SEPARATOR}{session_id}"));
    if !timing_safe_equals(signature.as_bytes(), expected_signature.as_bytes()) {
        return Err(anyhow::anyhow!("invalid signature"));
    }

    return Ok((user_id.to_owned(), session_id.to_owned()));
}

pub fn timing_safe_equals(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }

    result == 0
}

fn create_signature(secret: &str, data_to_sign: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("error creating hmac");

    mac.update(data_to_sign.as_bytes());

    let result = mac.finalize();
    let result = result.into_bytes();

    return hex::encode(result);
}
