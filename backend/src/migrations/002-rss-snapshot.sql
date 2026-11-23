-- A public feed keeps only the fingerprints from its last successful snapshot.
ALTER TABLE feeds ADD COLUMN rss_snapshot_ids TEXT;
