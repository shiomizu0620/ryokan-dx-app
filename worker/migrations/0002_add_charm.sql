-- Migration 0002: add charm_json column to facilities
-- Stores the extracted charm vector (facility_name, charm_tags, summary, protect_keywords)
-- so return visits can reference the same charm without re-fetching from Places API.

ALTER TABLE facilities ADD COLUMN charm_json TEXT NOT NULL DEFAULT '{}';
