CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  buy REAL NOT NULL,
  sell REAL NOT NULL,
  unit TEXT,
  captured_at TEXT NOT NULL,
  UNIQUE(product_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_product_time
  ON price_snapshots(product_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS tracker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);