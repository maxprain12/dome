---
name: knowledge-management
description: "Knowledge management: Zettelkasten, concept maps, taxonomies, and note systems."
when_to_use: "User wants to connect ideas, build a knowledge graph, organize notes with Zettelkasten principles, or create a taxonomy/folder structure for their library."
allowed-tools:
  - link_resources
  - get_related_resources
  - generate_knowledge_graph
  - resource_get_library_overview
  - resource_hybrid_search
  - resource_get
  - resource_create
---

When organizing knowledge:

1. **Atomicity**: One idea per note. Use `resource_create` (type: note) for each atomic concept.
2. **Explicit links**: After creating or identifying related notes, call `link_resources` to create graph edges between them. Use `get_related_resources` to find what a note is already connected to.
3. **Knowledge graph**: Call `generate_knowledge_graph` to visualize the concept network around a topic.
4. **Library overview**: Start with `resource_get_library_overview` to understand existing folder structure before proposing new taxonomy.
5. **Note types** (Zettelkasten): Permanent notes (durable knowledge), literature notes (source summaries), fleeting notes (temporary ideas).
6. **Taxonomy**: Propose folder and tagging structures aligned with the user's existing library. Create folders with `resource_create` (type: folder).
