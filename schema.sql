-- Create clans table
CREATE TABLE clans (
  id SERIAL PRIMARY KEY,
  rank INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  master VARCHAR(255),
  members VARCHAR(50),
  reputation BIGINT,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  season INT
);

-- Create index for faster queries
CREATE INDEX idx_clans_fetched_at ON clans(fetched_at DESC);
CREATE INDEX idx_clans_rank ON clans(rank);

-- Create sync_log table to track sync attempts
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  status VARCHAR(50), -- 'success', 'error', 'partial'
  clans_count INT,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create history table to track changes
CREATE TABLE clan_history (
  id SERIAL PRIMARY KEY,
  clan_name VARCHAR(255) NOT NULL,
  rank_prev INT,
  rank_new INT,
  reputation_prev BIGINT,
  reputation_new BIGINT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
