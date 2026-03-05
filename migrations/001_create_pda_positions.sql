CREATE TABLE IF NOT EXISTS pda_positions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  vessel_name TEXT NOT NULL DEFAULT '',
  berth_terminal TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL DEFAULT '',
  quantity TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL,
  index_state JSONB,
  calculator_state JSONB
);

CREATE INDEX IF NOT EXISTS pda_positions_created_at_idx
  ON pda_positions (created_at DESC);

CREATE INDEX IF NOT EXISTS pda_positions_saved_at_idx
  ON pda_positions (saved_at DESC);
