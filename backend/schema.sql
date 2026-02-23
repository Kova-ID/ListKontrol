-- ListKontrol Database Schema
-- Run this ONCE when setting up the Scaleway Serverless SQL Database
-- Connect via psql or the Scaleway console SQL editor

-- Projects table: stores the full project JSON (including points)
-- The 'data' column holds the entire project object as JSONB
-- This keeps the schema simple and flexible as ListK evolves
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast sorting by last update
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects (updated_at DESC);

-- Optional: archives table (same structure)
CREATE TABLE IF NOT EXISTS archives (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    delete_after TIMESTAMPTZ
);

-- Verify
SELECT 'ListKontrol database ready ✅' AS status;
