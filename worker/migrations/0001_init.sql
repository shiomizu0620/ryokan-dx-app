-- Migration 0001: initial schema for ryokan-dx
-- Tables map to requirements.md section 4 (data structures).
-- Nested fields (zones, losses breakdown, improvements, messages) are stored
-- as JSON text columns. SQLite has native JSON1 functions if we need to query
-- inside them later, but for now we read/write whole blobs.

CREATE TABLE IF NOT EXISTS facilities (
  facility_id        TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

  -- profile: rooms, staff_count, foreign_ratio, main_customer, stay_pattern
  profile_json       TEXT NOT NULL DEFAULT '{}',

  -- array of { area, dx, reason, sensitivity }
  zones_json         TEXT NOT NULL DEFAULT '[]',

  -- { total_monthly_yen, total_monthly_hours, breakdown: [...] }
  losses_json        TEXT NOT NULL DEFAULT '{}',

  -- array of { id, title, priority, status, expected_reduction_*, difficulty, duration_days, method }
  improvements_json  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id     TEXT PRIMARY KEY,
  facility_id    TEXT NOT NULL,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at       TEXT,
  summary        TEXT,

  -- array of { role: 'user' | 'assistant', content: string }
  messages_json  TEXT NOT NULL DEFAULT '[]',

  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_facility ON sessions(facility_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started  ON sessions(started_at);
