/**
 * LLM Graph Extractor - Main Process
 * Extracts Knowledge Graph entities and relations from text using Ollama
 */

const { chat, DEFAULT_MODEL } = require('./ollama-service.cjs');
const { createConceptNode, addRelation } = require('./graph-service.cjs');

const SYSTEM_PROMPT = `
You are a Knowledge Graph Extraction Expert.
Your task is to analyze the provided text and extract key entities (Nodes) and their relationships (Edges).

Return ONLY a JSON object with this structure:
{
  "nodes": [
    { "label": "Name of entity", "type": "Type (Person, Technology, Concept, Organization, Location, Event)" }
  ],
  "edges": [
    { "source": "Name of source entity", "target": "Name of target entity", "relation": "RELATION_TYPE (in UPPERCASE, short, e.g. AUTHORED, USES, IS_A, LOCATED_IN)" }
  ]
}

Rules:
1. Extract only the most important entities.
2. Normalize entity names (e.g., "React.js" -> "React").
3. Relation types should be verbs or prepositions in uppercase.
4. JSON must be valid. Do not include markdown code blocks.
`;

/**
 * Extract graph data from text and persist it to the database
 * @param {string} sourceResourceId - The ID of the resource (note) being analyzed
 * @param {string} text - The content of the note
 * @param {string} model - Optional model override
 */
async function extractAndPersistGraph(sourceResourceId, text, model = DEFAULT_MODEL) {
  if (!text || text.length < 50) {
    console.log('[GraphExtractor] Text too short, skipping extraction.');
    return { nodes: [], edges: [] };
  }

  try {
    console.log(`[GraphExtractor] Extracting from resource ${sourceResourceId} using ${model}...`);
    
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ];

    const response = await chat(messages, model);
    
    // Clean up response (remove code blocks if LLM adds them)
    const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[GraphExtractor] Failed to parse LLM JSON response:', response);
      throw new Error('Invalid JSON from LLM');
    }

    if (!data.nodes || !data.edges) {
        throw new Error('Missing nodes or edges in JSON');
    }

    console.log(`[GraphExtractor] Found ${data.nodes.length} nodes and ${data.edges.length} edges.`);

    // Persist Nodes
    // We map labels to IDs to link edges later
    const labelToId = {};

    // 1. Ensure the Source Resource is a node (it should be, but let's get its ID)
    // Actually, graph-service handles resource IDs transparently.
    labelToId['__THIS_NOTE__'] = sourceResourceId;

    // 2. Process extracted nodes
    for (const node of data.nodes) {
      try {
        const created = createConceptNode(node.label, node.type);
        labelToId[node.label] = created.id;
      } catch (err) {
        console.warn(`[GraphExtractor] Failed to create node ${node.label}:`, err.message);
      }
    }

    // 3. Process edges
    // We can also link extracted nodes to the source resource explicitly if implied
    // But for now, let's just process the returned edges.
    // If the LLM mentions the "text" or "document", we might need to handle that.
    // Assuming the LLM extracts internal relations mainly.
    // To link extracted entities to the note itself, we might want to add "MENTIONED_IN" edges?
    // Let's add explicit "MENTIONED_IN" edge for all extracted entities to the source resource.
    
    const createdEdges = [];

    for (const node of data.nodes) {
        if (labelToId[node.label]) {
             try {
                // Link: Note MENTIONS Entity
                // Direction: Note -> Entity ?? Or Entity -> Note?
                // Usually "Note MENTIONS Concept".
                addRelation(sourceResourceId, labelToId[node.label], 'MENTIONS', { method: 'llm-extraction' });
            } catch (err) {
                // Ignore duplicates
            }
        }
    }

    for (const edge of data.edges) {
      const sourceId = labelToId[edge.source];
      const targetId = labelToId[edge.target];

      if (sourceId && targetId) {
        try {
          const res = addRelation(sourceId, targetId, edge.relation, { method: 'llm-extraction' });
          createdEdges.push(res);
        } catch (err) {
           // Ignore duplicates
        }
      }
    }

    return { nodes: data.nodes, edges: createdEdges };

  } catch (error) {
    console.error('[GraphExtractor] Error:', error);
    throw error;
  }
}

module.exports = {
  extractAndPersistGraph
};
