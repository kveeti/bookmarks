use ulid::Ulid;

pub fn new_id() -> String {
    return Ulid::new().to_string();
}
