# Hierarchical RAG Implementation Guide

## Overview

This document provides step-by-step instructions for implementing the hybrid RAG system in Dome, combining vector search (LanceDB) with hierarchical tree-based indexing (inspired by PageIndex).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Dome Search Layer                   │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         Query Router & Analyzer              │  │
│  │  • Analyzes query complexity                 │  │
│  │  • Routes to optimal search strategy         │  │
│  │  • Combines results if needed                │  │
│  └────────────┬─────────────────────────────────┘  │
│               │                                     │
│       ┌───────┴────────┐                           │
│       │                │                           │
│  ┌────▼────────┐  ┌────▼──────────────┐           │
│  │  LanceDB    │  │  Hierarchical     │           │
│  │  Vector     │  │  Tree Index       │           │
│  │  Search     │  │  (SQLite + LLM)   │           │
│  │             │  │                   │           │
│  │  • Fast     │  │  • Deep reasoning │           │
│  │  • Fuzzy    │  │  • Structured     │           │
│  │  • Simple   │  │  • Explainable    │           │
│  └─────────────┘  └───────────────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Database Schema ✅ COMPLETE

**Files Created:**
- `migrations/add-hierarchical-index.sql`

**Tables:**
1. `document_tree_index` - Stores JSON tree structures
2. `tree_nodes` - Normalized node storage (optional, for faster queries)
3. `search_strategy_cache` - Learns from user feedback

**To Apply:**
```bash
# Run migration
sqlite3 ~/Library/Application\ Support/Dome/dome.db < migrations/add-hierarchical-index.sql

# Or programmatically in database.cjs:
// Add migration to electron/database.cjs
```

### Phase 2: Core Modules ✅ COMPLETE

**Files Created:**
1. `electron/hierarchical-index.cjs` - Tree building and reasoning search
2. `electron/pageindex-mcp-client.cjs` - MCP integration (prototype)

**Key Functions:**
- `buildDocumentTree()` - Create hierarchical index
- `searchWithReasoning()` - Navigate tree with LLM
- `hybridSearch()` - Route between vector and hierarchical
- `analyzeQueryComplexity()` - Determine search strategy

### Phase 3: IPC Handlers (TODO)

**File to Modify:** `electron/main.cjs`

Add these IPC handlers:

```javascript
// ============================================
// HIERARCHICAL INDEX HANDLERS
// ============================================

const hierarchicalIndex = require('./hierarchical-index.cjs');

// Build tree for a resource
ipcMain.handle('hierarchical:build-tree', async (event, data) => {
  try {
    const { resourceId, content, aiProvider } = data;

    const tree = await hierarchicalIndex.buildDocumentTree({
      resourceId,
      content,
      aiProvider,
    });

    return { success: true, tree };
  } catch (error) {
    console.error('[IPC] Error building tree:', error);
    return { success: false, error: error.message };
  }
});

// Search with reasoning
ipcMain.handle('hierarchical:search', async (event, data) => {
  try {
    const { query, resourceId, aiProvider } = data;

    const result = await hierarchicalIndex.searchWithReasoning({
      query,
      resourceId,
      aiProvider,
    });

    return result;
  } catch (error) {
    console.error('[IPC] Error in hierarchical search:', error);
    return { success: false, error: error.message };
  }
});

// Hybrid search
ipcMain.handle('search:hybrid', async (event, data) => {
  try {
    const { query, resourceId, aiProvider, strategy } = data;

    const result = await hierarchicalIndex.hybridSearch({
      query,
      resourceId,
      aiProvider,
      strategy, // 'vector' | 'hierarchical' | 'hybrid'
    });

    return result;
  } catch (error) {
    console.error('[IPC] Error in hybrid search:', error);
    return { success: false, error: error.message };
  }
});

// Check if tree exists
ipcMain.handle('hierarchical:has-index', async (event, resourceId) => {
  try {
    const exists = await hierarchicalIndex.hasHierarchicalIndex(resourceId);
    return { success: true, exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete tree
ipcMain.handle('hierarchical:delete-index', async (event, resourceId) => {
  try {
    await hierarchicalIndex.deleteHierarchicalIndex(resourceId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### Phase 4: Preload Script (TODO)

**File to Modify:** `electron/preload.cjs`

Add to `ALLOWED_CHANNELS`:

```javascript
const ALLOWED_CHANNELS = {
  invoke: [
    // ... existing channels ...
    'hierarchical:build-tree',
    'hierarchical:search',
    'hierarchical:has-index',
    'hierarchical:delete-index',
    'search:hybrid',
  ],
  // ...
};
```

Expose API in `contextBridge`:

```javascript
contextBridge.exposeInMainWorld('electron', {
  // ... existing APIs ...

  hierarchical: {
    buildTree: (data) => ipcRenderer.invoke('hierarchical:build-tree', data),
    search: (data) => ipcRenderer.invoke('hierarchical:search', data),
    hasIndex: (resourceId) => ipcRenderer.invoke('hierarchical:has-index', resourceId),
    deleteIndex: (resourceId) => ipcRenderer.invoke('hierarchical:delete-index', resourceId),
  },

  search: {
    hybrid: (data) => ipcRenderer.invoke('search:hybrid', data),
  },
});
```

### Phase 5: TypeScript Types (TODO)

**File to Create:** `app/lib/hierarchical/types.ts`

```typescript
export interface TreeNode {
  id: string;
  title: string;
  summary: string;
  level: number;
  pageStart: number;
  pageEnd: number;
  children: TreeNode[];
  metadata?: Record<string, any>;
}

export interface DocumentTree {
  id: string;
  resourceId: string;
  root: TreeNode;
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  success: boolean;
  results?: {
    id: string;
    title: string;
    summary: string;
    pageStart: number;
    pageEnd: number;
    relevanceScore: number;
  }[];
  reasoning?: string[];
  pageReferences?: {
    title: string;
    pages: string;
    score: number;
  }[];
  error?: string;
}

export type SearchStrategy = 'vector' | 'hierarchical' | 'hybrid';

export interface HybridSearchOptions {
  query: string;
  resourceId?: string;
  aiProvider: {
    provider: string;
    apiKey?: string;
    model?: string;
  };
  strategy?: SearchStrategy;
}
```

### Phase 6: Renderer Client (TODO)

**File to Create:** `app/lib/hierarchical/client.ts`

```typescript
import type { HybridSearchOptions, SearchResult, DocumentTree } from './types';

/**
 * Build hierarchical tree for a resource
 */
export async function buildHierarchicalTree(
  resourceId: string,
  content: string,
  aiProvider: { provider: string; apiKey?: string; model?: string }
): Promise<{ success: boolean; tree?: DocumentTree; error?: string }> {
  return window.electron.hierarchical.buildTree({
    resourceId,
    content,
    aiProvider,
  });
}

/**
 * Search using hierarchical reasoning
 */
export async function searchHierarchical(
  query: string,
  resourceId: string,
  aiProvider: { provider: string; apiKey?: string; model?: string }
): Promise<SearchResult> {
  return window.electron.hierarchical.search({
    query,
    resourceId,
    aiProvider,
  });
}

/**
 * Hybrid search (auto-routes to best strategy)
 */
export async function hybridSearch(
  options: HybridSearchOptions
): Promise<SearchResult> {
  return window.electron.search.hybrid(options);
}

/**
 * Check if hierarchical index exists
 */
export async function hasHierarchicalIndex(
  resourceId: string
): Promise<boolean> {
  const result = await window.electron.hierarchical.hasIndex(resourceId);
  return result.exists;
}

/**
 * Delete hierarchical index
 */
export async function deleteHierarchicalIndex(
  resourceId: string
): Promise<void> {
  await window.electron.hierarchical.deleteIndex(resourceId);
}
```

### Phase 7: UI Integration (TODO)

**Components to Create/Modify:**

1. **Search Settings Panel** (`app/components/settings/SearchSettingsPanel.tsx`)
```tsx
export default function SearchSettingsPanel() {
  return (
    <div>
      <h3>Search Strategy</h3>
      <select>
        <option value="hybrid">Hybrid (Auto)</option>
        <option value="vector">Vector Only (Fast)</option>
        <option value="hierarchical">Hierarchical (Accurate)</option>
      </select>

      <h3>Hierarchical Index</h3>
      <button onClick={buildTreeForAllResources}>
        Build Indexes for All Resources
      </button>
    </div>
  );
}
```

2. **Search Results Display** (`app/components/search/SearchResults.tsx`)
```tsx
export default function SearchResults({ results }: Props) {
  return (
    <div>
      {results.reasoning && (
        <div className="reasoning-path">
          <h4>Reasoning Path:</h4>
          {results.reasoning.map((step, i) => (
            <div key={i}>Step {i + 1}: {step}</div>
          ))}
        </div>
      )}

      {results.pageReferences && (
        <div className="page-refs">
          <h4>Page References:</h4>
          {results.pageReferences.map(ref => (
            <div key={ref.title}>
              {ref.title} (pages {ref.pages}) - {ref.score}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Phase 8: Automatic Tree Building (TODO)

**Trigger tree building when:**
1. PDF is imported
2. Large note is created/updated
3. User requests it manually

**File to Modify:** `electron/main.cjs`

In resource creation/update handlers:

```javascript
// After creating/updating resource
if (shouldBuildTree(resource)) {
  // Build tree in background (non-blocking)
  hierarchicalIndex.buildDocumentTree({
    resourceId: resource.id,
    content: resource.content,
    aiProvider: getAIProviderConfig(),
  }).catch(error => {
    console.error('[Tree] Background build failed:', error);
  });
}

function shouldBuildTree(resource) {
  // Build tree for PDFs and long notes
  return resource.type === 'pdf' ||
         (resource.type === 'note' && resource.content.length > 10000);
}
```

## MCP Integration (Optional)

### Setup PageIndex MCP Server

1. **Install PageIndex:**
```bash
git clone https://github.com/VectifyAI/PageIndex.git
cd PageIndex
pip install -r requirements.txt
```

2. **Create MCP Server Script:**
```python
# pageindex_mcp_server.py
from pageindex import PageIndex
# ... MCP server setup
```

3. **Start MCP Server:**
```bash
python pageindex_mcp_server.py
```

4. **Install MCP SDK in Dome:**
```bash
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk
```

5. **Connect in Dome:**
```javascript
const { initializeMCPClient } = require('./electron/pageindex-mcp-client.cjs');

await initializeMCPClient({
  serverCommand: 'python',
  serverArgs: ['path/to/pageindex_mcp_server.py'],
});
```

## Testing

### Unit Tests
```bash
# Test tree building
bun test electron/hierarchical-index.test.cjs

# Test query routing
bun test electron/query-router.test.cjs
```

### Integration Tests
```bash
# Test full workflow
bun test:integration hierarchical-rag
```

### Manual Testing
1. Import a PDF with multiple sections
2. Build hierarchical tree
3. Test search queries:
   - Simple: "machine learning" (should use vector)
   - Complex: "Explain the relationship between X and Y" (should use hierarchical)
4. Verify reasoning paths are shown
5. Verify page references are accurate

## Performance Optimization

### Caching
- Cache LLM responses for tree building
- Cache query routing decisions
- Store generated summaries

### Parallel Processing
- Build trees for multiple documents in parallel
- Batch LLM requests

### Progressive Building
- Build tree incrementally (level by level)
- Show partial results while building

## Monitoring

### Metrics to Track
- Tree build time per document
- Search latency (vector vs hierarchical)
- Query routing accuracy
- User satisfaction ratings
- LLM API costs

### Logging
```javascript
console.log('[HierarchicalRAG] Metrics:', {
  treeBuildTime: endTime - startTime,
  nodeCount: tree.nodes.length,
  searchStrategy: selectedStrategy,
  resultCount: results.length,
});
```

## Cost Management

### OpenAI API Costs
- Use caching to reduce API calls
- Use cheaper models for simple tasks (gpt-4o-mini)
- Batch requests when possible

### Ollama (Free Alternative)
- Use Ollama for tree building (local, free)
- Use Ollama for navigation (may be less accurate)
- Hybrid: OpenAI for complex queries, Ollama for simple ones

## Rollout Strategy

### Beta Testing
1. Enable for internal testing only
2. Collect feedback from 5-10 power users
3. Iterate based on feedback

### Gradual Rollout
1. Release as opt-in feature
2. Default to vector search
3. Show UI hint to try hierarchical search
4. Gradually make it default based on success metrics

### Rollback Plan
- Keep vector search fully functional
- Easy toggle to disable hierarchical search
- Graceful degradation if LLM unavailable

## Future Enhancements

1. **Multi-document Search** - Search across multiple trees
2. **Visual Tree Browser** - UI to explore document structure
3. **Semantic Routing** - ML model for query routing
4. **Result Fusion** - Combine vector + hierarchical results
5. **Collaborative Filtering** - Learn from user preferences
6. **Cross-reference Detection** - Find related sections across documents

## Troubleshooting

### Common Issues

**Issue:** Tree building is slow
- **Solution:** Use smaller chunk sizes, cache LLM responses, use faster model

**Issue:** Search returns irrelevant results
- **Solution:** Improve tree summaries, adjust navigation prompt, tune relevance scoring

**Issue:** High LLM costs
- **Solution:** Switch to Ollama, enable caching, reduce API calls

**Issue:** Tree structure is poor
- **Solution:** Improve document parsing, better summarization prompts, manual tree editing

## Support

For questions or issues:
1. Check logs: `~/Library/Logs/Dome/main.log`
2. Review research document: `PAGEINDEX_RESEARCH.md`
3. Check MCP status: `window.electron.hierarchical.status()`

---

**Status:** Research & Prototyping Phase
**Next Steps:** Apply database migration, add IPC handlers, create UI components
