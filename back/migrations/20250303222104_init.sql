create table users (
    id varchar(30) primary key not null,
    username varchar(100) not null,
    password_hash text not null
);

create table bookmarks (
    id varchar(30) primary key not null,
    client_id varchar(30) not null,
    title varchar(100) not null,
    url varchar(255) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    deleted_at timestamptz,

    user_id varchar(30) not null references users(id)
);

create table sessions (
    id varchar(30) primary key not null,
    user_id varchar(30) not null references users(id),
    expiry timestamptz not null
);
