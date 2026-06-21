/**
 * 0004_graph — graph_nodes, graph_edges, semantic_relations, search_index
 */
module.exports = {
  id: '0004_graph',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE graph_nodes (
        id TEXT PRIMARY KEY,
        resource_id TEXT,
        label TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('resource', 'concept', 'person', 'location', 'event', 'topic')),
        properties TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_graph_nodes_label ON graph_nodes(label);
      CREATE INDEX idx_graph_nodes_resource ON graph_nodes(resource_id);
      CREATE INDEX idx_graph_nodes_type ON graph_nodes(type);

      CREATE TABLE graph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        weight DOUBLE DEFAULT 1.0,
        metadata TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_graph_edges_relation ON graph_edges(relation);
      CREATE INDEX idx_graph_edges_source ON graph_edges(source_id);
      CREATE INDEX idx_graph_edges_target ON graph_edges(target_id);

      CREATE TABLE semantic_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        similarity DOUBLE NOT NULL,
        relation_type TEXT NOT NULL CHECK(relation_type IN ('auto', 'manual', 'confirmed', 'rejected')),
        label TEXT,
        detected_at BIGINT NOT NULL,
        confirmed_at BIGINT,
        UNIQUE(source_id, target_id)
      );

      CREATE INDEX idx_semantic_sim ON semantic_relations(similarity DESC);
      CREATE INDEX idx_semantic_source ON semantic_relations(source_id);
      CREATE INDEX idx_semantic_target ON semantic_relations(target_id);

      CREATE TABLE search_index (
        id TEXT PRIMARY KEY,
        resource_id TEXT UNIQUE NOT NULL,
        combined_text TEXT,
        keywords TEXT,
        last_indexed BIGINT NOT NULL
      );

      CREATE INDEX idx_search_index_resource ON search_index(resource_id);
    `);
  },
};
