-- Migration: Add Hierarchical Document Index Tables
-- Date: 2026-01-28
-- Purpose: Support tree-based, reasoning RAG as alternative to vector embeddings

-- Table: document_tree_index
-- Stores the complete hierarchical tree structure for documents
CREATE TABLE IF NOT EXISTS document_tree_index (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  tree_json TEXT NOT NULL,      -- JSON representation of hierarchical tree
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_tree_resource ON document_tree_index(resource_id);

-- Table: tree_nodes
-- Normalized storage of individual tree nodes (optional - for faster querying)
CREATE TABLE IF NOT EXISTS tree_nodes (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  parent_id TEXT,               -- NULL for root node
  title TEXT NOT NULL,
  summary TEXT,                 -- LLM-generated summary
  page_start INTEGER,
  page_end INTEGER,
  level INTEGER NOT NULL,       -- Depth in tree (0 = root)
  node_order INTEGER NOT NULL,  -- Order among siblings
  metadata_json TEXT,           -- Additional node metadata
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tree_id) REFERENCES document_tree_index(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES tree_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tree_nodes_tree ON tree_nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent ON tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_tree_nodes_level ON tree_nodes(level);

-- Table: search_strategy_cache
-- Cache query routing decisions to learn from user feedback
CREATE TABLE IF NOT EXISTS search_strategy_cache (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,     -- Hash of query for lookup
  query TEXT NOT NULL,
  selected_strategy TEXT NOT NULL, -- 'vector' | 'hierarchical' | 'hybrid'
  auto_selected INTEGER NOT NULL,  -- 1 if auto-selected, 0 if user-selected
  user_rating INTEGER,          -- User feedback: 1-5 stars
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_strategy_hash ON search_strategy_cache(query_hash);

-- Settings for hierarchical search
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('hierarchical_index_enabled', 'true', strftime('%s', 'now') * 1000),
  ('hierarchical_index_auto_build', 'true', strftime('%s', 'now') * 1000),
  ('hierarchical_index_llm_provider', 'ollama', strftime('%s', 'now') * 1000),
  ('hierarchical_index_llm_model', 'llama3.1', strftime('%s', 'now') * 1000),
  ('search_strategy_default', 'hybrid', strftime('%s', 'now') * 1000);

-- Comments
PRAGMA table_info(document_tree_index);
PRAGMA table_info(tree_nodes);
PRAGMA table_info(search_strategy_cache);
