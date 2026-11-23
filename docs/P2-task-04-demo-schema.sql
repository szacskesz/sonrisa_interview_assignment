-- Phase 2 SQLite schema for review. Timestamps are UTC Unix milliseconds.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
    token_hash BLOB PRIMARY KEY NOT NULL CHECK (length(token_hash) = 32),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms)
) STRICT;

CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_by_expiry ON sessions (expires_at_ms);

CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic TEXT NOT NULL CHECK (length(trim(topic)) > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'removed')),
    created_at_ms INTEGER NOT NULL,
    activated_at_ms INTEGER NOT NULL CHECK (activated_at_ms >= created_at_ms)
) STRICT;

CREATE INDEX subscriptions_by_user ON subscriptions (user_id);
CREATE INDEX active_subscriptions_by_topic
    ON subscriptions (topic, activated_at_ms) WHERE status = 'active';

CREATE TABLE feeds (
    id INTEGER PRIMARY KEY,
    source_kind TEXT NOT NULL DEFAULT 'rss' CHECK (length(trim(source_kind)) > 0),
    url TEXT NOT NULL UNIQUE,
    publisher TEXT NOT NULL CHECK (length(trim(publisher)) > 0),
    topic TEXT NOT NULL CHECK (length(trim(topic)) > 0),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    poll_interval_seconds INTEGER NOT NULL CHECK (poll_interval_seconds > 0),
    next_poll_at_ms INTEGER NOT NULL,
    last_poll_attempt_at_ms INTEGER,
    last_poll_success_at_ms INTEGER,
    last_poll_error TEXT,
    initialized_at_ms INTEGER,
    last_processed_published_at_ms INTEGER,
    CHECK (last_processed_published_at_ms IS NULL OR initialized_at_ms IS NOT NULL)
) STRICT;

CREATE INDEX enabled_feeds_by_next_poll
    ON feeds (next_poll_at_ms) WHERE enabled = 1;

CREATE TABLE delivery_jobs (
    id INTEGER PRIMARY KEY,
    feed_id INTEGER NOT NULL REFERENCES feeds(id),
    source_url TEXT NOT NULL,
    source_item_id TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (length(trim(channel)) > 0),
    destination TEXT NOT NULL CHECK (length(trim(destination)) > 0),
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    publisher TEXT NOT NULL,
    item_url TEXT,
    published_at_ms INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'canceled')),
    created_at_ms INTEGER NOT NULL,
    next_attempt_at_ms INTEGER,
    sent_at_ms INTEGER,
    UNIQUE (feed_id, source_url, source_item_id, channel, destination),
    CHECK ((status = 'pending') = (next_attempt_at_ms IS NOT NULL)),
    CHECK ((status = 'sent') = (sent_at_ms IS NOT NULL))
) STRICT;

CREATE INDEX pending_jobs_by_next_attempt
    ON delivery_jobs (next_attempt_at_ms, id) WHERE status = 'pending';

CREATE TABLE delivery_job_subscriptions (
    job_id INTEGER NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    PRIMARY KEY (job_id, subscription_id)
) STRICT;

CREATE INDEX delivery_matches_by_subscription
    ON delivery_job_subscriptions (subscription_id);

CREATE TABLE delivery_attempts (
    job_id INTEGER NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    started_at_ms INTEGER NOT NULL,
    finished_at_ms INTEGER,
    outcome TEXT NOT NULL CHECK (
        outcome IN ('started', 'accepted', 'retryable_failure', 'permanent_failure', 'unknown')
    ),
    error_detail TEXT,
    PRIMARY KEY (job_id, attempt_no),
    CHECK ((outcome = 'started') = (finished_at_ms IS NULL))
) STRICT;
