/* eslint-disable no-console */
/**
 * Hierarchical Document Index - Main Process
 *
 * Implements tree-based document indexing inspired by PageIndex
 * for reasoning-based retrieval without vector embeddings.
 *
 * ARCHITECTURE:
 * 1. Document Parser: Extract structure from documents
 * 2. Tree Builder: Use LLM to create hierarchical index
 * 3. Tree Navigator: Reasoning-based retrieval using LLM
 * 4. Storage: SQLite for tree persistence
 *
 * This is a PROTOTYPE implementation for research purposes.
 */

const database = require('./database.cjs');
const aiCloudService = require('./ai-cloud-service.cjs');
const ollamaService = require('./ollama-service.cjs');

// ============================================
// TYPES (for documentation - not enforced)
// ============================================

/**
 * @typedef {Object} TreeNode
 * @property {string} id - Unique node identifier
 * @property {string} title - Section/chapter title
 * @property {string} summary - LLM-generated summary
 * @property {number} level - Depth in tree (0 = root)
 * @property {number} pageStart - Starting page number
 * @property {number} pageEnd - Ending page number
 * @property {TreeNode[]} children - Child nodes
 * @property {Object} metadata - Additional context
 */

/**
 * @typedef {Object} DocumentTree
 * @property {string} id - Tree identifier
 * @property {string} resourceId - Associated resource ID
 * @property {TreeNode} root - Root node of tree
 * @property {number} createdAt - Timestamp
 * @property {number} updatedAt - Timestamp
 */

// ============================================
// TREE BUILDING
// ============================================

/**
 * Generate tree index for a document
 * Uses LLM to analyze document structure and create hierarchical index
 *
 * @param {Object} options - Build options
 * @param {string} options.resourceId - Resource ID
 * @param {string} options.content - Document content
 * @param {Object} options.aiProvider - AI provider config
 * @returns {Promise<DocumentTree>}
 */
async function buildDocumentTree(options) {
  const { resourceId, content, aiProvider } = options;

  console.log(`[HierarchicalIndex] Building tree for resource: ${resourceId}`);

  try {
    // Step 1: Extract document structure
    const structure = await extractDocumentStructure(content);

    // Step 2: Generate tree with LLM
    const tree = await generateTreeWithLLM(structure, aiProvider);

    // Step 3: Store in database
    await storeDocumentTree(resourceId, tree);

    console.log(`[HierarchicalIndex] ✅ Tree built successfully for ${resourceId}`);
    return tree;

  } catch (error) {
    console.error('[HierarchicalIndex] Error building tree:', error);
    throw error;
  }
}

/**
 * Extract basic document structure (headings, sections, pages)
 * This is a simplified version - real implementation would use PDF parser, etc.
 *
 * @param {string} content - Document content
 * @returns {Promise<Object>}
 */
async function extractDocumentStructure(content) {
  // PROTOTYPE: Simple structure extraction
  // In production, this would use proper PDF parsing, heading detection, etc.

  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;
  let pageNumber = 1;

  for (const line of lines) {
    // Detect headings (simplified - look for lines with # or all caps)
    const isHeading = line.startsWith('#') ||
                     (line.length > 0 && line === line.toUpperCase() && line.length < 100);

    if (isHeading) {
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        title: line.replace(/^#+\s*/, '').trim(),
        content: '',
        pageStart: pageNumber,
        pageEnd: pageNumber,
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';

      // Simple page break detection (every 50 lines)
      if (currentSection.content.split('\n').length > 50) {
        pageNumber++;
        currentSection.pageEnd = pageNumber;
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    sections,
    totalPages: pageNumber,
  };
}

/**
 * Generate hierarchical tree using LLM
 * Asks LLM to analyze structure and create multi-level index with summaries
 *
 * @param {Object} structure - Extracted document structure
 * @param {Object} aiProvider - AI provider config
 * @returns {Promise<TreeNode>}
 */
async function generateTreeWithLLM(structure, aiProvider) {
  const { provider, apiKey, model } = aiProvider;

  // Prepare prompt for LLM
  const prompt = `Analyze the following document structure and create a hierarchical index.

For each section, provide:
1. A clear, descriptive title
2. A concise summary (2-3 sentences)
3. Hierarchical organization (parent-child relationships)
4. Page ranges

Document sections:
${structure.sections.map((s, i) => `
Section ${i + 1}: ${s.title}
Pages: ${s.pageStart}-${s.pageEnd}
Content preview: ${s.content.slice(0, 500)}...
`).join('\n')}

Return a JSON tree structure with this format:
{
  "id": "root",
  "title": "Document Title",
  "summary": "Overall document summary",
  "level": 0,
  "pageStart": 1,
  "pageEnd": ${structure.totalPages},
  "children": [
    {
      "id": "section-1",
      "title": "Section Title",
      "summary": "Section summary",
      "level": 1,
      "pageStart": 1,
      "pageEnd": 5,
      "children": []
    }
  ]
}`;

  // Call LLM based on provider
  let response;

  if (provider === 'ollama') {
    const baseUrl = ollamaService.getBaseUrl();
    response = await ollamaService.generateText(
      prompt,
      model || 'llama3.1',
      {
        temperature: 0.3, // Lower temperature for structured output
        format: 'json',
      },
      baseUrl
    );
  } else {
    // Use cloud provider
    const messages = [
      {
        role: 'system',
        content: 'You are a document analysis expert. Create hierarchical document indexes with clear structure and summaries.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    response = await aiCloudService.chat(provider, messages, apiKey, {
      model: model || 'gpt-4o',
      temperature: 0.3,
    });
  }

  // Parse JSON response
  try {
    const treeJson = typeof response === 'string' ? response : response.content;
    const tree = JSON.parse(treeJson);
    return tree;
  } catch (error) {
    console.error('[HierarchicalIndex] Failed to parse LLM response:', error);
    console.error('[HierarchicalIndex] Response:', response);
    throw new Error('Failed to generate valid tree structure');
  }
}

// ============================================
// TREE STORAGE (SQLite)
// ============================================

/**
 * Store document tree in SQLite
 *
 * @param {string} resourceId - Resource ID
 * @param {TreeNode} tree - Tree structure
 * @returns {Promise<void>}
 */
async function storeDocumentTree(resourceId, tree) {
  const db = database.getDatabase();
  const timestamp = Date.now();
  const treeId = `tree-${resourceId}`;

  // Store tree as JSON in document_tree_index table
  const insertTree = db.prepare(`
    INSERT OR REPLACE INTO document_tree_index (id, resource_id, tree_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertTree.run(
    treeId,
    resourceId,
    JSON.stringify(tree),
    timestamp,
    timestamp
  );

  console.log(`[HierarchicalIndex] ✅ Tree stored for resource ${resourceId}`);
}

/**
 * Load document tree from SQLite
 *
 * @param {string} resourceId - Resource ID
 * @returns {Promise<DocumentTree|null>}
 */
async function loadDocumentTree(resourceId) {
  const db = database.getDatabase();

  const query = db.prepare(`
    SELECT * FROM document_tree_index WHERE resource_id = ?
  `);

  const row = query.get(resourceId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    resourceId: row.resource_id,
    root: JSON.parse(row.tree_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// REASONING-BASED RETRIEVAL
// ============================================

/**
 * Search using reasoning-based tree navigation
 * LLM navigates the tree to find relevant information
 *
 * @param {Object} options - Search options
 * @param {string} options.query - User query
 * @param {string} options.resourceId - Resource to search
 * @param {Object} options.aiProvider - AI provider config
 * @returns {Promise<Object>}
 */
async function searchWithReasoning(options) {
  const { query, resourceId, aiProvider } = options;

  console.log(`[HierarchicalIndex] Reasoning search: "${query}" in ${resourceId}`);

  try {
    // Load tree
    const tree = await loadDocumentTree(resourceId);

    if (!tree) {
      throw new Error(`No tree index found for resource ${resourceId}`);
    }

    // Navigate tree with LLM
    const result = await navigateTreeWithLLM(query, tree.root, aiProvider);

    return {
      success: true,
      results: result.nodes,
      reasoning: result.reasoning,
      pageReferences: result.pageReferences,
    };

  } catch (error) {
    console.error('[HierarchicalIndex] Search error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Navigate tree using LLM reasoning
 * Multi-step process: analyze query → explore branches → return relevant nodes
 *
 * @param {string} query - User query
 * @param {TreeNode} tree - Document tree
 * @param {Object} aiProvider - AI provider config
 * @returns {Promise<Object>}
 */
async function navigateTreeWithLLM(query, tree, aiProvider) {
  const { provider, apiKey, model } = aiProvider;

  // Create prompt for tree navigation
  const prompt = `You are a document navigation expert. Given a user query and a document tree index,
navigate the tree to find the most relevant sections.

USER QUERY: "${query}"

DOCUMENT TREE:
${JSON.stringify(tree, null, 2)}

TASK:
1. Analyze the query and determine what information is needed
2. Navigate the tree hierarchically (start at root, explore relevant branches)
3. Identify the most relevant section(s) that answer the query
4. Explain your reasoning step-by-step

Return a JSON response with this structure:
{
  "reasoning": [
    "Step 1: Analyzed query, looking for information about X",
    "Step 2: Explored branch A because...",
    "Step 3: Found relevant section..."
  ],
  "relevantNodes": [
    {
      "id": "section-id",
      "title": "Section Title",
      "summary": "Why this is relevant",
      "pageStart": 10,
      "pageEnd": 15,
      "relevanceScore": 0.95
    }
  ],
  "answer": "Direct answer to the query based on the tree structure"
}`;

  // Call LLM
  let response;

  if (provider === 'ollama') {
    const baseUrl = ollamaService.getBaseUrl();
    response = await ollamaService.generateText(
      prompt,
      model || 'llama3.1',
      {
        temperature: 0.2,
        format: 'json',
      },
      baseUrl
    );
  } else {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert at navigating hierarchical document indexes using reasoning.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    response = await aiCloudService.chat(provider, messages, apiKey, {
      model: model || 'gpt-4o',
      temperature: 0.2,
    });
  }

  // Parse response
  try {
    const resultJson = typeof response === 'string' ? response : response.content;
    const result = JSON.parse(resultJson);

    return {
      nodes: result.relevantNodes || [],
      reasoning: result.reasoning || [],
      pageReferences: result.relevantNodes?.map(n => ({
        title: n.title,
        pages: `${n.pageStart}-${n.pageEnd}`,
        score: n.relevanceScore,
      })) || [],
      answer: result.answer,
    };
  } catch (error) {
    console.error('[HierarchicalIndex] Failed to parse navigation response:', error);
    throw new Error('Failed to navigate tree');
  }
}

// ============================================
// HYBRID SEARCH (Vector + Hierarchical)
// ============================================

/**
 * Hybrid search: combines vector similarity with reasoning-based navigation
 * Routes query to appropriate system or combines both
 *
 * @param {Object} options - Search options
 * @param {string} options.query - User query
 * @param {string} options.resourceId - Resource to search (optional)
 * @param {Object} options.aiProvider - AI provider config
 * @param {string} options.strategy - 'vector' | 'hierarchical' | 'hybrid'
 * @returns {Promise<Object>}
 */
async function hybridSearch(options) {
  const { query, resourceId, aiProvider, strategy = 'hybrid' } = options;

  console.log(`[HierarchicalIndex] Hybrid search (${strategy}): "${query}"`);

  // Analyze query complexity
  const isComplexQuery = analyzeQueryComplexity(query);

  let selectedStrategy = strategy;
  if (strategy === 'hybrid') {
    // Auto-select based on query complexity
    selectedStrategy = isComplexQuery ? 'hierarchical' : 'vector';
    console.log(`[HierarchicalIndex] Auto-selected: ${selectedStrategy}`);
  }

  try {
    if (selectedStrategy === 'hierarchical') {
      // Use tree-based reasoning
      return await searchWithReasoning({ query, resourceId, aiProvider });

    } else if (selectedStrategy === 'vector') {
      // Use existing vector search (LanceDB)
      // This would call the existing vector search implementation
      return {
        success: true,
        strategy: 'vector',
        message: 'Vector search not implemented in this prototype',
      };

    } else {
      // Combine both approaches
      // TODO: Implement result fusion
      return {
        success: true,
        strategy: 'combined',
        message: 'Combined search not yet implemented',
      };
    }

  } catch (error) {
    console.error('[HierarchicalIndex] Hybrid search error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Analyze query complexity to determine best search strategy
 *
 * @param {string} query - User query
 * @returns {boolean} - True if complex, false if simple
 */
function analyzeQueryComplexity(query) {
  // Simple heuristics (can be improved with ML)
  const complexPatterns = [
    /why|how|explain|compare|analyze/i,
    /what.*relationship|how.*related/i,
    /step.*by.*step|process/i,
    /.*and.*and.*/i, // Multiple ANDs suggest complex query
  ];

  const wordCount = query.split(/\s+/).length;

  // Complex if:
  // - Matches complex patterns
  // - More than 10 words
  const isComplex = complexPatterns.some(p => p.test(query)) || wordCount > 10;

  return isComplex;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Check if hierarchical index exists for resource
 *
 * @param {string} resourceId - Resource ID
 * @returns {Promise<boolean>}
 */
async function hasHierarchicalIndex(resourceId) {
  const tree = await loadDocumentTree(resourceId);
  return tree !== null;
}

/**
 * Delete hierarchical index for resource
 *
 * @param {string} resourceId - Resource ID
 * @returns {Promise<void>}
 */
async function deleteHierarchicalIndex(resourceId) {
  const db = database.getDatabase();

  const deleteStmt = db.prepare(`
    DELETE FROM document_tree_index WHERE resource_id = ?
  `);

  deleteStmt.run(resourceId);

  console.log(`[HierarchicalIndex] Deleted index for resource ${resourceId}`);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  buildDocumentTree,
  loadDocumentTree,
  storeDocumentTree,
  searchWithReasoning,
  hybridSearch,
  hasHierarchicalIndex,
  deleteHierarchicalIndex,
};
