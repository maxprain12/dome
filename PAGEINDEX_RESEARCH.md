# PageIndex RAG Investigation for Dome

**Date:** 2026-01-28
**Branch:** `claude/explore-pageindex-rag-a75Sd`
**Status:** Research & Design Phase

## Executive Summary

This document analyzes the integration of PageIndex (vectorless, reasoning-based RAG) as an alternative to Dome's current LanceDB vector database implementation. After in-depth research, we propose a **hybrid approach** that combines the strengths of both systems.

---

## 1. What is PageIndex?

### Overview
[PageIndex](https://github.com/VectifyAI/PageIndex) is an open-source RAG framework that replaces vector embeddings with **hierarchical tree indexing** and **LLM-based reasoning** for document retrieval.

### Key Principles
- **"Similarity ≠ Relevance"** - Traditional vector search finds similar text, but PageIndex finds relevant information through reasoning
- **Tree-based navigation** - Documents are indexed as hierarchical trees (like table of contents)
- **Multi-step reasoning** - LLM navigates the tree structure to find information
- **No chunking required** - Preserves document structure instead of fragmenting it

### Performance
- **98.7% accuracy** on FinanceBench (financial document analysis)
- Significantly outperforms traditional vector RAG on complex queries
- Better explainability (shows reasoning path with page references)

### Technology Stack
- **Language:** Python (no native TypeScript/Node.js implementation)
- **LLM Provider:** OpenAI API required
- **License:** MIT (open source)

---

## 2. Integration Options

### Option A: MCP (Model Context Protocol) Integration
**Description:** Connect to PageIndex as an external MCP server

**Architecture:**
```
┌─────────────────────────┐
│   Dome (Electron)       │
│   ├─ MCP TypeScript SDK │──┐
│   └─ Main Process       │  │ MCP Protocol
└─────────────────────────┘  │
                             │
┌─────────────────────────┐  │
│   PageIndex MCP Server  │◄─┘
│   (Python Service)      │
│   └─ OpenAI API         │
└─────────────────────────┘
```

**Pros:**
- Uses official PageIndex implementation
- Standard MCP protocol (future-proof)
- Can run locally or as cloud service
- No need to reimplement PageIndex logic

**Cons:**
- Requires Python runtime in deployment
- Additional service dependency
- Network latency (if external service)
- OpenAI API costs for reasoning

**Implementation Steps:**
1. Install MCP TypeScript SDK: `@modelcontextprotocol/sdk`
2. Set up PageIndex as MCP server (self-hosted or cloud)
3. Create MCP client in Dome's main process
4. Expose via IPC to renderer process

**MCP Resources:**
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Building MCP Clients - Node.js](https://modelcontextprotocol.info/docs/tutorials/building-a-client-node/)
- [PageIndex MCP Integration](https://pageindex.ai/mcp)

---

### Option B: PageIndex API Integration
**Description:** Use PageIndex's beta API as a service

**Architecture:**
```
┌─────────────────────────┐
│   Dome (Electron)       │
│   └─ HTTP Client        │──┐
└─────────────────────────┘  │ HTTPS/REST
                             │
┌─────────────────────────┐  │
│   PageIndex API         │◄─┘
│   (Cloud Service)       │
└─────────────────────────┘
```

**Pros:**
- No local Python dependency
- Managed infrastructure
- Always up-to-date
- Simpler deployment

**Cons:**
- Requires internet connection
- API costs (usage-based)
- Less control over data
- Beta status (may change)

**Implementation:**
- Use standard `fetch` API in main process
- API documentation: https://docs.pageindex.ai/quickstart

---

### Option C: Custom TypeScript Hierarchical RAG
**Description:** Reimplement PageIndex concepts natively in TypeScript

**Architecture:**
```
┌─────────────────────────────────┐
│   Dome (Electron)               │
│   ├─ Document Parser            │
│   ├─ Hierarchical Indexer       │
│   │  └─ Tree Builder (LLM)      │
│   ├─ Reasoning-based Retrieval  │
│   │  └─ Tree Navigator (LLM)    │
│   └─ SQLite (tree storage)      │
└─────────────────────────────────┘
```

**Pros:**
- No external dependencies
- Full control over implementation
- Works offline (with local Ollama)
- Native Electron integration
- Can optimize for Dome's use cases

**Cons:**
- Significant development effort
- Need to replicate PageIndex algorithms
- Ongoing maintenance burden
- May not match PageIndex performance initially

**Implementation Outline:**
1. **Document Parsing:** Extract structure from PDFs, notes, sources
2. **Tree Building:** Use LLM to generate hierarchical index
   - Generate summaries at multiple levels
   - Create page ranges and section titles
   - Store in SQLite as JSON tree
3. **Reasoning Retrieval:** Navigate tree with LLM
   - Start at root, reason about which branches to explore
   - Use chain-of-thought prompting
   - Return page references with results

**Similar Research/Frameworks:**
- [RAPTOR](https://github.com/NirDiamant/RAG_Techniques) - Recursive tree organization
- [T-Retriever](https://github.com/T-Retriever/T-Retriever) - Tree-based semantic retrieval
- [TreeRAG](https://aclanthology.org/2025.findings-acl.20.pdf) - Hierarchical storage

---

### Option D: Hybrid Approach ⭐ **RECOMMENDED**
**Description:** Combine LanceDB vector search with hierarchical indexing

**Architecture:**
```
┌───────────────────────────────────────┐
│   Dome Search System                  │
│                                       │
│   ┌─────────────────────────────┐    │
│   │   Query Router              │    │
│   │   (decides which system)    │    │
│   └──────────┬──────────────────┘    │
│              │                        │
│      ┌───────┴───────┐               │
│      │               │               │
│   ┌──▼──────┐   ┌───▼─────────┐     │
│   │ LanceDB │   │ Hierarchical│     │
│   │ Vector  │   │ Tree Index  │     │
│   │ Search  │   │ (SQLite)    │     │
│   │         │   │             │     │
│   │ Fast    │   │ Deep        │     │
│   │ Fuzzy   │   │ Reasoning   │     │
│   └─────────┘   └─────────────┘     │
│                                      │
│   ┌──────────────────────────┐      │
│   │   Result Fusion          │      │
│   │   (combine & re-rank)    │      │
│   └──────────────────────────┘      │
└──────────────────────────────────────┘
```

**Strategy:**
1. **LanceDB Vector Search** - For quick, fuzzy searches
   - Fast semantic similarity
   - Good for short queries
   - Existing implementation
   - Low latency

2. **Hierarchical Tree Index** - For deep, reasoning-based retrieval
   - Complex multi-step queries
   - Long document navigation
   - Explainable results
   - Better relevance for research

3. **Smart Router** - Decides which system to use
   - Simple queries → LanceDB (fast)
   - Complex queries → Tree Index (accurate)
   - Can combine both for best results

**Pros:**
- Best of both worlds
- Incremental implementation (lower risk)
- Backwards compatible
- Can optimize for different use cases
- Graceful degradation

**Cons:**
- More complex architecture
- Need to maintain both systems
- Requires smart routing logic

**Implementation Phases:**

**Phase 1: Tree Index Storage (SQLite)**
```sql
CREATE TABLE document_tree_index (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  tree_json TEXT NOT NULL,  -- Hierarchical tree structure
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES resources(id)
);

CREATE TABLE tree_nodes (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  page_start INTEGER,
  page_end INTEGER,
  level INTEGER NOT NULL,
  FOREIGN KEY (tree_id) REFERENCES document_tree_index(id)
);
```

**Phase 2: Tree Builder**
- Extract document structure (headings, sections, pages)
- Use LLM to generate summaries at each level
- Build hierarchical tree representation
- Store in SQLite

**Phase 3: Reasoning Retrieval**
- Implement tree navigation with LLM
- Use chain-of-thought prompting
- Track reasoning path for explainability

**Phase 4: Query Router**
- Analyze query complexity
- Route to appropriate system
- Optionally combine results

**Phase 5: Result Fusion**
- Merge results from both systems
- Re-rank based on relevance
- Present unified results to user

---

## 3. Current Dome Implementation

### Vector Database: LanceDB
- **Tables:**
  - `resource_embeddings` (1536 dims - OpenAI)
  - `source_embeddings` (1536 dims - OpenAI)
  - `annotation_embeddings` (1024 dims - Ollama bge-m3)

- **Embedding Providers:**
  - Ollama (local, free, bge-m3)
  - OpenAI (cloud, paid, text-embedding-3-small)
  - Google (cloud, paid, text-embedding-004)

- **Use Cases:**
  - Semantic search across resources
  - Annotation search in PDFs
  - RAG for Martin AI assistant
  - Web content processing

### Architecture
```
Renderer Process (app/)
    │
    │ IPC
    ▼
Main Process (electron/)
    ├─ LanceDB (vectordb module)
    ├─ Embedding Generation
    │  ├─ Ollama Service
    │  └─ Cloud AI Service
    └─ Search Operations
```

### Challenges with Current System
1. **Limited to similarity matching** - May miss relevant but semantically different content
2. **Chunk-based** - Loses document structure and context
3. **No reasoning** - Can't handle multi-step queries
4. **Fixed embeddings** - Different providers use different dimensions

---

## 4. Recommended Implementation Plan

### Phase 1: Research & Prototyping (1-2 weeks)
- [ ] Create MCP client prototype
- [ ] Test PageIndex MCP server locally
- [ ] Benchmark performance vs current LanceDB
- [ ] Evaluate cost (OpenAI API usage)

### Phase 2: Hybrid Architecture Design (1 week)
- [ ] Design SQLite schema for tree storage
- [ ] Design query router logic
- [ ] Plan IPC handlers for new system
- [ ] Document API interfaces

### Phase 3: Tree Index Implementation (2-3 weeks)
- [ ] Implement document structure extraction
- [ ] Create LLM-based tree builder
- [ ] Build tree storage in SQLite
- [ ] Add IPC handlers for tree operations

### Phase 4: Reasoning Retrieval (2 weeks)
- [ ] Implement tree navigation with LLM
- [ ] Add chain-of-thought prompting
- [ ] Create result formatting
- [ ] Add explainability (show reasoning path)

### Phase 5: Integration & Testing (1-2 weeks)
- [ ] Implement query router
- [ ] Add result fusion
- [ ] Update UI to show both types of results
- [ ] Performance testing and optimization

### Phase 6: Polish & Documentation (1 week)
- [ ] User documentation
- [ ] Settings UI for system selection
- [ ] Error handling and fallbacks
- [ ] Performance monitoring

**Total Estimated Time:** 8-11 weeks for full hybrid implementation

---

## 5. Technical Considerations

### Electron Compatibility
- **MCP SDK:** ✅ Works with Node.js/Electron
- **PageIndex (Python):** ❌ Requires separate process/service
- **Custom TypeScript:** ✅ Native Electron integration

### Offline Support
- **MCP/API:** ❌ Requires network (unless self-hosted)
- **Custom TypeScript:** ✅ Can work with local Ollama
- **Hybrid:** ⚡ Best of both (fallback to vector search)

### Cost Analysis
- **LanceDB:** Free (local), storage cost only
- **PageIndex MCP:** OpenAI API costs for reasoning
- **Custom Implementation:** Free (if using Ollama)
- **Hybrid:** Can optimize costs (use vector for simple queries)

### Performance
- **Vector Search:** ~10-50ms (very fast)
- **Tree Navigation:** ~1-3s (LLM reasoning)
- **Hybrid:** Adaptive (fast or accurate as needed)

---

## 6. Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Python dependency complexity | Use MCP TypeScript client, run PageIndex as service |
| OpenAI API costs | Implement caching, use local Ollama for tree building |
| Implementation time | Incremental rollout, maintain LanceDB during transition |
| User experience impact | Make hierarchical search opt-in, show reasoning paths |
| Maintenance burden | Focus on hybrid approach, leverage existing LanceDB |

---

## 7. Recommendations

### Immediate Next Steps (This Branch)
1. **Set up MCP prototype**
   - Install `@modelcontextprotocol/sdk`
   - Create test client in `electron/pageindex-mcp-client.cjs`
   - Connect to PageIndex MCP server
   - Test with sample documents

2. **Benchmark comparison**
   - Test same query on LanceDB vs PageIndex
   - Measure accuracy, speed, cost
   - Document findings

3. **Design hybrid architecture**
   - Create detailed schema for tree storage
   - Design query router algorithm
   - Plan gradual rollout strategy

### Long-term Strategy
- **Short term (1-2 months):** MCP prototype and testing
- **Medium term (3-4 months):** Hybrid implementation
- **Long term (6+ months):** Optimize based on usage data

### Success Metrics
- [ ] Retrieval accuracy improvement (target: >10% over current)
- [ ] User satisfaction with search results
- [ ] Reasonable API costs (<$10/month for typical user)
- [ ] Search response time <3s for complex queries
- [ ] Zero breaking changes to existing features

---

## 8. References & Resources

### PageIndex
- [GitHub Repository](https://github.com/VectifyAI/PageIndex)
- [MCP Integration](https://pageindex.ai/mcp)
- [API Documentation](https://docs.pageindex.ai/quickstart)

### Model Context Protocol
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Anthropic MCP Announcement](https://www.anthropic.com/news/model-context-protocol)
- [Building MCP Clients - Node.js](https://modelcontextprotocol.info/docs/tutorials/building-a-client-node/)
- [MCP Integration Guide](https://claudecode.io/guides/mcp-integration)

### Hierarchical RAG Research
- [RAPTOR - Hierarchical Indices](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/hierarchical_indices.ipynb)
- [T-Retriever](https://arxiv.org/html/2601.04945) - Tree-based Hierarchical Retrieval
- [TreeRAG](https://aclanthology.org/2025.findings-acl.20.pdf) - Hierarchical Storage
- [Enhanced RAG with Hierarchical Trees](https://medium.com/@clappy.ai/hierarchical-trees-in-data-indexing-algorithms-10b21fbd69d5)
- [RAG in 2026: Practical Blueprint](https://dev.to/suraj_khaitan_f893c243958/-rag-in-2026-a-practical-blueprint-for-retrieval-augmented-generation-16pp)

### MCP Governance
- [Wikipedia - Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- Donated to Linux Foundation's Agentic AI Foundation (December 2025)

---

## 9. Conclusion

**PageIndex represents a paradigm shift in RAG** - from similarity matching to reasoning-based retrieval. While it cannot directly replace LanceDB as a drop-in solution due to its Python-based architecture, a **hybrid approach** offers the best path forward for Dome:

1. **Keep LanceDB** for fast, fuzzy semantic search
2. **Add hierarchical tree indexing** for deep, reasoning-based retrieval
3. **Implement smart routing** to use the right system for each query
4. **Leverage MCP** for potential future PageIndex integration

This strategy provides:
- ✅ Immediate value (incremental improvement)
- ✅ Low risk (backwards compatible)
- ✅ Future-proof (can integrate PageIndex later via MCP)
- ✅ Native Electron support (no Python dependency for core features)
- ✅ Offline capability (with local Ollama)

The research phase on this branch should focus on **prototyping the MCP integration** and **designing the hybrid architecture** before committing to full implementation.

---

**Next Action:** Begin MCP prototype implementation (see Section 7)
