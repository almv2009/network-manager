PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_recovery_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_user
  ON account_recovery_tokens(user_id, purpose, used_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_account_recovery_tokens_hash
  ON account_recovery_tokens(token_hash);
