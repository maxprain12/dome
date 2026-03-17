/* eslint-disable no-console */
/**
 * DocIndexer - Native JS document indexing (replaces Python PageIndex service)
 *
 * Builds a hierarchical tree of sections/chunks for PDFs and notes,
 * uses the already-configured AI provider (cloud or Ollama) for summaries,
 * and emits live progress events via IPC so the UI can track the state.
 *
 * States per resource:
 *   pending    → queued but not started yet
 *   processing → currently indexing (with progress 0-100)
 *   done       → tree stored in DB, ready for AI search
 *   error      → indexing failed (error_message set)
 *
 * No Python, no subprocess, no venv, no HTTP microservice.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// In-memory state (also persisted to DB)
// ---------------------------------------------------------------------------

/** @type {Map<string, { status: string, progress: number, step: string }>} */
const state = new Map();

// ---------------------------------------------------------------------------
// Helpers: AI provider
// ---------------------------------------------------------------------------

/**
 * Read current AI provider config from DB and call the LLM.
 * Returns the LLM response text (non-streaming, best-effort).
 * Falls back to empty string on error — indexing continues without a summary.
 * @param {string} prompt
 * @param {import('./database.cjs')} database
 * @returns {Promise<string>}
 */
async function callLLM(prompt, database) {
  try {
    const queries = database.getQueries();
    const provider = queries.getSetting.get('ai_provider')?.value || 'openai';

    if (provider === 'ollama') {
      const ollamaService = require('./ollama-service.cjs');
      const baseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://localhost:11434';
      const model = queries.getSetting.get('ollama_model')?.value || 'llama3.2';
      const apiKey = queries.getSetting.get('ollama_api_key')?.value || '';
      return await ollamaService.chat(
        [{ role: 'user', content: prompt }],
        model,
        baseUrl,
        apiKey,
      );
    }

    const aiCloudService = require('./ai-cloud-service.cjs');
    const apiKey = queries.getSetting.get('ai_api_key')?.value || '';
    const model = queries.getSetting.get('ai_model')?.value || 'gpt-4o-mini';
    return await aiCloudService.chat(
      provider,
      [{ role: 'user', content: prompt }],
      apiKey,
      model,
    );
  } catch (err) {
    console.warn('[DocIndexer] LLM call failed (continuing without summary):', err.message);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Helpers: state + IPC broadcast
// ---------------------------------------------------------------------------

/**
 * @param {string} resourceId
 * @param {string} status
 * @param {number} progress  0-100
 * @param {string} step      Human-readable description
 * @param {object|null} windowManager
 * @param {object|null} database
 * @param {string|null} errorMessage
 */
function setState(resourceId, status, progress, step, windowManager, database, errorMessage = null) {
  state.set(resourceId, { status, progress, step });

  // Persist to DB
  if (database) {
    try {
      const queries = database.getQueries();
      queries.setPageIndexStatus?.run(resourceId, status, progress, errorMessage, Date.now());
    } catch { /* non-fatal */ }
  }

  // Broadcast to all renderer windows
  if (windowManager) {
    try {
      windowManager.broadcast('pageindex:progress', {
        resourceId,
        status,
        progress,
        step,
        error: errorMessage,
      });
    } catch { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// Helpers: PDF text extraction
// ---------------------------------------------------------------------------

let pdfjsLib = null;
let pdfjsLoadAttempted = false;

async function ensurePdfjs() {
  if (pdfjsLib) return pdfjsLib;
  if (pdfjsLoadAttempted) return null;
  pdfjsLoadAttempted = true;
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Suppress noisy TrueType font warnings (TT: undefined function: N)
    if (pdfjsLib.VerbosityLevel) {
      pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.ERRORS;
    }
  } catch (err) {
    console.warn('[DocIndexer] pdfjs-dist not available:', err.message);
  }
  return pdfjsLib;
}

/**
 * Extract text per page from a PDF.
 * Returns { pages: string[], numPages: number, isImageBased: boolean }
 * @param {string} pdfPath
 * @returns {Promise<{ pages: string[], numPages: number, isImageBased: boolean }>}
 */
async function extractPDFPages(pdfPath) {
  const lib = await ensurePdfjs();
  if (!lib?.getDocument) return { pages: [], numPages: 0, isImageBased: false };

  const data = new Uint8Array(fs.readFileSync(pdfPath));

  // Try loading — first attempt handles password-protected PDFs with empty password
  let doc;
  try {
    const task = lib.getDocument({ data, disableFontFace: true, useSystemFonts: true, password: '' });
    doc = await task.promise;
  } catch (err) {
    // PasswordException means document requires a user password we don't have
    if (err?.name === 'PasswordException' || String(err).includes('password')) {
      return { pages: [], numPages: 0, isImageBased: false, isPasswordProtected: true };
    }
    throw err;
  }

  const numPages = doc.numPages;
  const pageTexts = [];
  let pagesWithText = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Join items — use markedContent stringsHints if available (better for some PDFs)
    let text = content.items
      .map(item => (item.str != null ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // If text is very short but there are marks (image-based slide), it's likely a scan
    if (text.length > 10) pagesWithText++;

    pageTexts.push(text);
  }

  // Heuristic: if fewer than 20% of pages have meaningful text → image-based PDF
  const isImageBased = numPages > 0 && (pagesWithText / numPages) < 0.2;

  return { pages: pageTexts, numPages, isImageBased };
}

// ---------------------------------------------------------------------------
// Helpers: OCR via LLM vision (for image-based PDFs)
// ---------------------------------------------------------------------------

let napiCanvas = null;
let napiCanvasLoadAttempted = false;

function ensureNapiCanvas() {
  if (napiCanvas) return napiCanvas;
  if (napiCanvasLoadAttempted) return null;
  napiCanvasLoadAttempted = true;
  try {
    napiCanvas = require('@napi-rs/canvas');
  } catch (err) {
    console.warn('[DocIndexer] @napi-rs/canvas not available, OCR disabled:', err.message);
  }
  return napiCanvas;
}

/**
 * Render a single PDF page to a base64 PNG string using @napi-rs/canvas.
 * Returns null if rendering is not available.
 * @param {object} doc - pdfjs PDFDocument
 * @param {number} pageIndex - 0-based page index
 * @returns {Promise<string|null>}
 */
async function renderPageToBase64(doc, pageIndex) {
  const canvas = ensureNapiCanvas();
  if (!canvas?.createCanvas) return null;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const c = canvas.createCanvas(width, height);
    const ctx = c.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport,
      canvasFactory: {
        create(w, h) {
          const c2 = canvas.createCanvas(w, h);
          return { canvas: c2, context: c2.getContext('2d') };
        },
        reset(cc, w, h) {
          if (cc.canvas) { cc.canvas.width = w; cc.canvas.height = h; }
        },
        destroy(cc) { cc.canvas = null; cc.context = null; },
      },
    }).promise;
    const pngBuffer = await c.encode('png');
    return pngBuffer.toString('base64');
  } catch (err) {
    console.warn(`[DocIndexer] Failed to render page ${pageIndex + 1}:`, err.message);
    return null;
  }
}

/**
 * Call LLM with images for OCR text extraction.
 * Handles OpenAI, Anthropic, Google, and Ollama providers.
 * @param {{ pageIndex: number, base64: string }[]} pageImages
 * @param {object} database
 * @returns {Promise<string>} Extracted text
 */
async function callOCRBatch(pageImages, database) {
  if (pageImages.length === 0) return '';

  const queries = database.getQueries();
  const provider = queries.getSetting.get('ai_provider')?.value || 'openai';
  const apiKey = queries.getSetting.get('ai_api_key')?.value || '';
  const model = queries.getSetting.get('ai_model')?.value || 'gpt-4o-mini';

  const pageNums = pageImages.map(p => p.pageIndex + 1);
  const textPrompt =
    `Eres un experto en OCR. Extrae el texto de ${pageImages.length === 1 ? `la página ${pageNums[0]}` : `las páginas ${pageNums.join(', ')}`} de este PDF escaneado. ` +
    `Mantén el formato original lo más fiel posible. ` +
    `Si hay múltiples páginas, sepáralas con "--- Página N ---". ` +
    `Si una página no tiene texto legible, escribe "[Página sin texto legible]". ` +
    `Extrae SOLO el texto, sin explicaciones adicionales.`;

  const aiCloudService = require('./ai-cloud-service.cjs');

  if (provider === 'anthropic') {
    const content = [{ type: 'text', text: textPrompt }];
    for (const { base64 } of pageImages) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } });
    }
    return await aiCloudService.chatAnthropic([{ role: 'user', content }], apiKey, model);
  }

  if (provider === 'google') {
    const parts = [{ text: textPrompt }];
    for (const { base64 } of pageImages) {
      parts.push({ inlineData: { mimeType: 'image/png', data: base64 } });
    }
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 8192 },
    };
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(`Google OCR error: ${data.error?.message || response.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  if (provider === 'minimax') {
    const content = [{ type: 'text', text: textPrompt }];
    for (const { base64 } of pageImages) {
      content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } });
    }
    try {
      const { MINIMAX_BASE_URL } = require('./minimax-config.cjs');
      return await aiCloudService.chatOpenAI([{ role: 'user', content }], apiKey, model, MINIMAX_BASE_URL, 120000);
    } catch (err) {
      console.warn('[DocIndexer] Minimax OCR failed (vision may be unsupported):', err.message);
      return '';
    }
  }

  if (provider === 'ollama') {
    const baseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://localhost:11434';
    const ollamaApiKey = queries.getSetting.get('ollama_api_key')?.value || '';
    const ollamaAuthHeader = ollamaApiKey ? { 'Authorization': `Bearer ${ollamaApiKey}` } : {};

    // Strategy 1: Ollama native API (/api/chat) with explicit `images` field.
    // This works for llava, moondream, glm4v, minicpm-v, etc.
    // Raw base64 without the data-URL prefix is required.
    try {
      const nativeResp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ollamaAuthHeader },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: textPrompt,
            images: pageImages.map(p => p.base64),
          }],
          stream: false,
        }),
      });
      if (nativeResp.ok) {
        const nativeData = await nativeResp.json();
        const text = nativeData.message?.content ?? '';
        if (text.trim()) {
          console.log(`[DocIndexer] OCR via Ollama native API OK (model: ${model})`);
          return text;
        }
      } else {
        const errData = await nativeResp.json().catch(() => ({}));
        console.warn(`[DocIndexer] Ollama native OCR non-ok (${nativeResp.status}):`, errData.error || nativeResp.statusText);
      }
    } catch (nativeErr) {
      console.warn('[DocIndexer] Ollama native API failed:', nativeErr.message);
    }

    // Strategy 2: OpenAI-compatible endpoint with image_url content blocks.
    // Works on Ollama ≥0.5 for vision models.
    const content = [{ type: 'text', text: textPrompt }];
    for (const { base64 } of pageImages) {
      content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } });
    }
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ollamaAuthHeader },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Ollama OCR (${response.status}): ${errData.error || 'el modelo no soporta visión. Usa un modelo con capacidad visual como llava, moondream2 o minicpm-v'}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new Error(`El modelo "${model}" no devolvió texto OCR. Puede que no soporte imágenes. Prueba con llava o moondream2.`);
    }
    return text;
  }

  // Default: OpenAI
  const content = [{ type: 'text', text: textPrompt }];
  for (const { base64 } of pageImages) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' } });
  }
  return await aiCloudService.chatOpenAI([{ role: 'user', content }], apiKey, model, undefined, 120000);
}

// ---------------------------------------------------------------------------
// Helpers: tree building
// ---------------------------------------------------------------------------

/**
 * Build tree node ID (zero-padded integer string).
 */
let _nodeCounter = 0;
function nextNodeId() {
  _nodeCounter += 1;
  return String(_nodeCounter).padStart(4, '0');
}

function resetNodeCounter() {
  _nodeCounter = 0;
}

// ---------------------------------------------------------------------------
// PDF indexing
// ---------------------------------------------------------------------------

const PAGES_PER_CHUNK = 10;
const TARGET_SECTION_PAGES = 3;
const MAX_SECTION_PAGES = 5;
const MIN_SECTION_TEXT_LENGTH = 60;
const MAX_SECTION_SNIPPET_CHARS = 3500;
const MAX_RECURSIVE_DEPTH = 2;
const RECURSIVE_SECTION_PAGE_THRESHOLD = 4;
const SECTION_NUMBER_REGEX = /^(\d+(?:\.\d+)*)(?:[\s).:-]+|$)/;
const HEADING_PREFIX_REGEX = /^([A-Z]\.|(?:\d+(?:\.\d+)*)|(?:[IVXLCDM]+))(?:[\s).:-]+)(.+)$/i;

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pageRangeLabel(startIndex, endIndex = startIndex) {
  if (startIndex == null) return '';
  if (endIndex == null || endIndex === startIndex) return `p.${startIndex + 1}`;
  return `p.${startIndex + 1}-${endIndex + 1}`;
}

function cleanSectionTitle(rawTitle) {
  let title = normalizeWhitespace(rawTitle);
  if (!title) return '';
  title = title
    .replace(/^[#>*\-\u2022]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return title.slice(0, 220);
}

function extractStructureCode(title) {
  const match = cleanSectionTitle(title).match(SECTION_NUMBER_REGEX);
  return match?.[1] || null;
}

function isLikelyHeadingLine(line) {
  const trimmed = cleanSectionTitle(line);
  if (!trimmed || trimmed.length < 3 || trimmed.length > 140) return false;
  if (/^[\W\d_]+$/.test(trimmed)) return false;
  if (/^[a-z]/.test(trimmed) && !SECTION_NUMBER_REGEX.test(trimmed)) return false;
  if (/[:;,.!?]$/.test(trimmed) && trimmed.length > 90) return false;
  if (trimmed.split(' ').length > 14) return false;
  if (SECTION_NUMBER_REGEX.test(trimmed)) return true;
  if (/^(cap[ií]tulo|secci[oó]n|tema|parte|anexo|appendix|chapter)\b/i.test(trimmed)) return true;
  if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s()\-/:]{4,}$/.test(trimmed) && trimmed.length <= 90) return true;
  const alphaWords = trimmed.split(/\s+/).filter(Boolean);
  if (alphaWords.length === 0) return false;
  const titleCaseWords = alphaWords.filter((word) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ0-9]/.test(word));
  return titleCaseWords.length >= Math.max(1, Math.ceil(alphaWords.length * 0.6));
}

function extractHeadingCandidatesFromPage(pageText, pageIndex) {
  const lines = String(pageText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const candidates = [];
  const seenTitles = new Set();
  const maxLinesToInspect = Math.min(lines.length, 80);

  for (let i = 0; i < maxLinesToInspect; i++) {
    const line = lines[i];
    if (!isLikelyHeadingLine(line)) continue;

    const title = cleanSectionTitle(line);
    if (!title || seenTitles.has(title)) continue;

    seenTitles.add(title);
    candidates.push({
      title,
      physical_index: pageIndex,
      structure: extractStructureCode(title),
    });

    if (candidates.length >= 5) break;
  }

  return candidates;
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function buildTaggedPageText(pageTexts, startPage = 0, endPage = pageTexts.length - 1) {
  const slices = [];
  for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
    const pageText = String(pageTexts[pageIndex] || '').trim();
    if (!pageText) continue;
    slices.push(`[PAGE ${pageIndex + 1}]\n${pageText}`);
  }
  return slices.join('\n\n');
}

async function extractSectionCandidatesWithLLM(pageTexts, database, startPage = 0, endPage = pageTexts.length - 1) {
  const taggedText = buildTaggedPageText(pageTexts, startPage, endPage);
  if (!taggedText.trim()) return [];

  const prompt =
    `Analiza este documento PDF etiquetado por páginas y extrae únicamente las secciones visibles.\n` +
    `Devuelve SOLO JSON con este formato exacto:\n` +
    `{"sections":[{"title":"<título visible>","physical_index":<número de página 1-based>,"structure":"<numeración visible o null>"}]}\n\n` +
    `Reglas:\n` +
    `- Usa sólo títulos que realmente aparezcan en el texto.\n` +
    `- physical_index debe ser la primera página donde aparece la sección.\n` +
    `- Si la sección no tiene numeración explícita, usa null en structure.\n` +
    `- No añadas una raíz global para el documento.\n` +
    `- Conserva subtítulos como "5.1 ..." cuando existan.\n\n` +
    `Documento:\n${taggedText}\n\n` +
    `Responde SOLO con el JSON.`;

  const parsed = safeJsonParse(await callLLM(prompt, database));
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];

  return sections.map((section) => {
    const rawPage = Number(section?.physical_index);
    const clampedPage = Number.isFinite(rawPage)
      ? Math.max(startPage, Math.min(endPage, rawPage - 1))
      : startPage;
    const title = cleanSectionTitle(section?.title);
    return {
      title,
      physical_index: clampedPage,
      structure: typeof section?.structure === 'string' && section.structure.trim()
        ? section.structure.trim()
        : extractStructureCode(title),
    };
  }).filter((section) => section.title);
}

function dedupeSectionCandidates(candidates, totalPages) {
  const normalized = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || !candidate.title) continue;
    const physicalIndex = Math.max(0, Math.min(totalPages - 1, candidate.physical_index ?? 0));
    const title = cleanSectionTitle(candidate.title);
    if (!title) continue;
    const key = `${physicalIndex}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      title,
      physical_index: physicalIndex,
      structure: candidate.structure || extractStructureCode(title),
    });
  }

  normalized.sort((a, b) => {
    if (a.physical_index !== b.physical_index) return a.physical_index - b.physical_index;
    const aStructure = a.structure || '';
    const bStructure = b.structure || '';
    return aStructure.localeCompare(bStructure);
  });

  return normalized;
}

function buildFallbackSectionCandidates(pageTexts) {
  const totalPages = pageTexts.length;
  const candidates = [];
  const step = totalPages <= 3 ? 1 : totalPages <= 8 ? 2 : TARGET_SECTION_PAGES;

  for (let start = 0; start < totalPages; start += step) {
    const end = Math.min(start + step - 1, totalPages - 1);
    const rangeText = pageTexts.slice(start, end + 1).join('\n').trim();
    if (!rangeText) continue;
    const pageHeadings = extractHeadingCandidatesFromPage(pageTexts[start], start);
    const fallbackTitle = pageHeadings[0]?.title || `Sección ${candidates.length + 1} (${pageRangeLabel(start, end)})`;
    candidates.push({
      title: fallbackTitle,
      physical_index: start,
      structure: String(candidates.length + 1),
    });
  }

  return candidates;
}

function assignImplicitStructures(candidates) {
  let rootCounter = 0;
  return candidates.map((candidate) => {
    if (candidate.structure) return candidate;
    rootCounter += 1;
    return {
      ...candidate,
      structure: String(rootCounter),
    };
  });
}

function buildTreeFromSectionCandidates(candidates, totalPages, endPage = totalPages - 1) {
  const normalized = assignImplicitStructures(dedupeSectionCandidates(candidates, totalPages));
  if (normalized.length === 0) return [];

  const items = normalized.map((candidate, index) => {
    const next = normalized[index + 1];
    const nextPage = next?.physical_index;
    const startIndex = candidate.physical_index;
    const endIndex = nextPage == null
      ? endPage
      : nextPage > startIndex
        ? Math.min(endPage, Math.max(startIndex, nextPage - 1))
        : startIndex;
    return {
      title: candidate.title,
      structure: candidate.structure,
      start_index: startIndex,
      end_index: endIndex,
      nodes: [],
    };
  });

  const byStructure = new Map();
  const roots = [];

  for (const item of items) {
    byStructure.set(item.structure, item);
    const parentStructure = item.structure.includes('.')
      ? item.structure.split('.').slice(0, -1).join('.')
      : null;
    if (parentStructure && byStructure.has(parentStructure)) {
      byStructure.get(parentStructure).nodes.push(item);
    } else {
      roots.push(item);
    }
  }

  const cleanNode = (node) => {
    if (!node.nodes.length) {
      delete node.nodes;
      return node;
    }
    node.nodes = node.nodes.map(cleanNode);
    return node;
  };

  return roots.map(cleanNode);
}

function getNodeRangeText(pageTexts, node) {
  const start = Math.max(0, node.start_index ?? 0);
  const end = Math.max(start, node.end_index ?? start);
  return pageTexts.slice(start, end + 1).join('\n\n').trim();
}

function isGenericSectionTitle(title) {
  const normalized = normalizeWhitespace(title).toLowerCase();
  return !normalized || normalized.startsWith('sección ') || normalized.startsWith('páginas ') || normalized.startsWith('p.');
}

function countTreeNodes(tree) {
  return flattenTree(tree).length;
}

function assignNodeIds(tree) {
  const walk = (item) => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== 'object') return;
    item.node_id = nextNodeId();
    if (Array.isArray(item.nodes)) item.nodes.forEach(walk);
  };
  walk(tree);
}

async function summarizeTreeNodes(tree, pageTexts, database, resourceId, windowManager) {
  const flatNodes = [];
  const walk = (item) => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== 'object') return;
    flatNodes.push(item);
    if (Array.isArray(item.nodes)) item.nodes.forEach(walk);
  };
  walk(tree);
  if (flatNodes.length === 0) return;

  for (let index = 0; index < flatNodes.length; index++) {
    const node = flatNodes[index];
    const start = node.start_index ?? 0;
    const end = node.end_index ?? start;
    const text = getNodeRangeText(pageTexts, node);
    if (!text) continue;

    const progress = 35 + Math.round((index / Math.max(flatNodes.length, 1)) * 55);
    setState(
      resourceId,
      'processing',
      Math.min(progress, 92),
      `Resumiendo ${index + 1} de ${flatNodes.length} (${pageRangeLabel(start, end)})…`,
      windowManager,
      database
    );

    if (text.length < 450) {
      node.summary = text.slice(0, 500);
      node.keywords = node.keywords || [];
      continue;
    }

    const snippet = text.slice(0, MAX_SECTION_SNIPPET_CHARS);
    const prompt =
      `Eres un asistente de análisis de documentos académicos. Resume esta sección del documento ` +
      `(${pageRangeLabel(start, end)}). Devuelve SOLO JSON:\n` +
      `{"title":"<título descriptivo ≤80 chars>","summary":"<resumen de 2-4 oraciones>","keywords":["<kw1>","<kw2>","<kw3>"]}\n\n` +
      `Fragmento:\n${snippet}\n\nResponde SOLO con el JSON.`;

    const parsed = safeJsonParse(await callLLM(prompt, database));
    const parsedTitle = cleanSectionTitle(parsed?.title);
    if (parsedTitle && isGenericSectionTitle(node.title)) {
      node.title = parsedTitle;
    }
    node.summary = normalizeWhitespace(parsed?.summary) || snippet.slice(0, 500);
    node.keywords = Array.isArray(parsed?.keywords)
      ? parsed.keywords.slice(0, 5).map((keyword) => normalizeWhitespace(keyword)).filter(Boolean)
      : [];
  }
}

async function extractCandidateSectionsFromPages(pageTexts, database, startPage = 0, endPage = pageTexts.length - 1) {
  const scopedPages = pageTexts.slice(startPage, endPage + 1);
  const heuristicCandidates = [];

  scopedPages.forEach((pageText, pageOffset) => {
    const physicalIndex = startPage + pageOffset;
    heuristicCandidates.push(...extractHeadingCandidatesFromPage(pageText, physicalIndex));
  });

  let candidates = dedupeSectionCandidates(heuristicCandidates, pageTexts.length);
  const totalScopedPages = endPage - startPage + 1;
  const totalScopedText = scopedPages.join('\n').length;

  if ((candidates.length <= 1 || totalScopedPages > MAX_SECTION_PAGES) && totalScopedText < 50000) {
    const llmCandidates = await extractSectionCandidatesWithLLM(pageTexts, database, startPage, endPage);
    if (llmCandidates.length > candidates.length) {
      candidates = dedupeSectionCandidates(llmCandidates, pageTexts.length);
    }
  }

  if (candidates.length === 0) {
    candidates = dedupeSectionCandidates(buildFallbackSectionCandidates(scopedPages).map((candidate) => ({
      ...candidate,
      physical_index: candidate.physical_index + startPage,
    })), pageTexts.length);
  }

  return candidates;
}

async function refineLargeNodesRecursively(node, pageTexts, database, depth = 0) {
  if (!node || depth >= MAX_RECURSIVE_DEPTH) return;
  const start = node.start_index ?? 0;
  const end = node.end_index ?? start;
  const pageSpan = end - start + 1;
  if (pageSpan < RECURSIVE_SECTION_PAGE_THRESHOLD) return;

  const candidates = await extractCandidateSectionsFromPages(pageTexts, database, start, end);
  const childTree = buildTreeFromSectionCandidates(candidates, pageTexts.length, end)
    .filter((child) => child.start_index >= start && child.end_index <= end)
    .filter((child) => !(child.start_index === start && child.end_index === end && cleanSectionTitle(child.title) === cleanSectionTitle(node.title)));

  if (childTree.length >= 2) {
    node.nodes = childTree;
    for (const child of childTree) {
      await refineLargeNodesRecursively(child, pageTexts, database, depth + 1);
    }
  }
}

/**
 * Index a PDF resource: extract text, chunk by pages, summarize with LLM.
 * @param {string} resourceId
 * @param {string} pdfPath
 * @param {{ database: object, windowManager: object, title?: string }} deps
 * @returns {Promise<{ success: boolean, tree_json?: string, error?: string }>}
 */
async function indexPDF(resourceId, pdfPath, deps) {
  const { database, windowManager, title: resourceTitle } = deps || {};

  setState(resourceId, 'processing', 0, 'Leyendo PDF…', windowManager, database);

  let extracted;
  try {
    extracted = await extractPDFPages(pdfPath);
  } catch (err) {
    const msg = `Error al leer el PDF: ${err.message}`;
    setState(resourceId, 'error', 0, msg, windowManager, database, msg);
    return { success: false, error: msg };
  }

  const { pages: pageTexts, numPages, isImageBased, isPasswordProtected } = extracted;

  // --- Handle password-protected PDFs ---
  if (isPasswordProtected) {
    const msg = 'El PDF está protegido con contraseña';
    const pwdTitle = resourceTitle || path.basename(pdfPath, path.extname(pdfPath)).replace(/[-_]/g, ' ');
    const tree = [{
      title: `PDF protegido con contraseña — ${pwdTitle}`,
      node_id: '0001',
      summary: `El PDF "${pwdTitle}" requiere contraseña para acceder al contenido. No es posible leer ni indexar el texto.`,
      start_index: 0,
      end_index: 0,
      nodes: [],
    }];
    setState(resourceId, 'done', 100, 'PDF protegido (sin texto)', windowManager, database);
    return { success: true, tree_json: JSON.stringify(tree) };
  }

  // Resolve the display name: prefer resource title, fall back to filename (strip hash if needed)
  const rawFilename = path.basename(pdfPath, path.extname(pdfPath));
  const displayName = resourceTitle || rawFilename.replace(/[-_]/g, ' ');

  // --- Handle image-based / scanned PDFs ---
  // Check total meaningful text across all pages
  const totalText = pageTexts.join('').replace(/\s/g, '');
  const effectivePages = pageTexts.filter(t => t.trim().length > 20);

  if (numPages > 0 && (isImageBased || totalText.length < 50)) {
    // PDF has no readable text layer — try LLM vision OCR first, then fall back to description
    setState(resourceId, 'processing', 15, 'PDF basado en imágenes — iniciando OCR con IA…', windowManager, database);

    const lib = await ensurePdfjs();
    const canvas = ensureNapiCanvas();
    let ocrText = '';
    let ocrAvailable = lib?.getDocument && canvas?.createCanvas;

    if (ocrAvailable) {
      try {
        const MAX_OCR_PAGES = 50;
        const PAGES_PER_OCR_BATCH = 3;
        const totalToProcess = Math.min(numPages, MAX_OCR_PAGES);

        // Reopen doc for rendering (extractPDFPages may have destroyed the previous one)
        const rawData = new Uint8Array(fs.readFileSync(pdfPath));
        const renderDoc = await lib.getDocument({ data: rawData, disableFontFace: true, useSystemFonts: true }).promise;

        const batchTexts = [];
        for (let i = 0; i < totalToProcess; i += PAGES_PER_OCR_BATCH) {
          const batchEnd = Math.min(i + PAGES_PER_OCR_BATCH, totalToProcess);
          const progress = 15 + Math.round((i / totalToProcess) * 65);
          setState(
            resourceId, 'processing', progress,
            `OCR IA — páginas ${i + 1}–${batchEnd} de ${totalToProcess}…`,
            windowManager, database
          );

          const pageImages = [];
          for (let pi = i; pi < batchEnd; pi++) {
            const base64 = await renderPageToBase64(renderDoc, pi);
            if (base64) pageImages.push({ pageIndex: pi, base64 });
          }

          if (pageImages.length > 0) {
            const batchText = await callOCRBatch(pageImages, database);
            if (batchText && batchText.trim()) batchTexts.push(batchText.trim());
          }
        }

        renderDoc.destroy();
        ocrText = batchTexts.join('\n\n');
      } catch (ocrErr) {
        console.warn('[DocIndexer] OCR via LLM vision failed:', ocrErr.message);
        // Broadcast failure so the badge shows a useful message
        setState(
          resourceId, 'processing', 80,
          `OCR falló: ${ocrErr.message.slice(0, 120)}`,
          windowManager, database
        );
        ocrAvailable = false;
      }
    }

    const hasOCRContent = ocrText && ocrText.replace(/\s/g, '').length > 50;

    if (hasOCRContent) {
      // OCR succeeded — chunk extracted text and summarize normally
      setState(resourceId, 'processing', 82, 'OCR completado — resumiendo contenido…', windowManager, database);

      resetNodeCounter();
      // Distribute OCR text proportionally across page ranges
      const charPerChunk = Math.max(1000, Math.ceil(ocrText.length / Math.ceil(numPages / PAGES_PER_CHUNK)));
      const ocrNodes = [];
      let charPos = 0;
      let pagePos = 0;

      while (charPos < ocrText.length) {
        const chunkText = ocrText.slice(charPos, charPos + charPerChunk).trim();
        const startPage = pagePos;
        const endPage = Math.min(pagePos + PAGES_PER_CHUNK - 1, numPages - 1);

        if (chunkText.length > 20) {
          const ci = ocrNodes.length;
          const progress = 82 + Math.round((ci / Math.ceil(ocrText.length / charPerChunk)) * 13);
          setState(
            resourceId, 'processing', Math.min(progress, 95),
            `Resumiendo sección OCR ${ci + 1}…`,
            windowManager, database
          );

          const snippet = chunkText.slice(0, 3000);
          const prompt =
            `Eres un asistente de análisis de documentos académicos. Dado el siguiente texto extraído por OCR ` +
            `(páginas ${startPage + 1}–${endPage + 1}), devuelve SOLO JSON:\n` +
            `{"title":"<título descriptivo ≤80 chars>","summary":"<resumen de 2-4 oraciones con ` +
            `conceptos clave, argumentos y conclusiones>","keywords":["<kw1>","<kw2>","<kw3>"]}\n\n` +
            `Texto OCR:\n${snippet}\n\nResponde SOLO con el JSON.`;

          let title = `Páginas ${startPage + 1}–${endPage + 1}`;
          let summary = '';
          let keywords = [];
          try {
            const raw = await callLLM(prompt, database);
            const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.title) title = String(parsed.title).slice(0, 200);
            if (parsed.summary) summary = String(parsed.summary).slice(0, 1000);
            if (Array.isArray(parsed.keywords)) keywords = parsed.keywords.slice(0, 5).map(String);
          } catch { /* use defaults */ }

          ocrNodes.push({
            title,
            node_id: nextNodeId(),
            summary: summary || snippet.slice(0, 300),
            keywords,
            start_index: startPage,
            end_index: endPage,
            nodes: [],
          });
        }

        charPos += charPerChunk;
        pagePos += PAGES_PER_CHUNK;
      }

      setState(resourceId, 'done', 100, 'Listo para IA (con OCR)', windowManager, database);
      return { success: true, tree_json: JSON.stringify(ocrNodes, null, 0) };
    }

    // OCR not available or returned empty — fall back to description based on title
    setState(resourceId, 'processing', 85, 'OCR no disponible — generando descripción…', windowManager, database);

    const prompt =
      `El usuario tiene un documento PDF titulado "${displayName}" con ${numPages} páginas. ` +
      `El PDF está basado en imágenes escaneadas sin capa de texto extraíble. ` +
      `Genera un JSON con este formato exacto:\n` +
      `{"title": "<título inferido del nombre>", "summary": "<descripción en 2-3 oraciones basada en el nombre del archivo>"}\n` +
      `Responde SOLO con el JSON.`;

    let title = displayName;
    let summary = `PDF de ${numPages} páginas basado en imágenes escaneadas. El texto no pudo extraerse automáticamente. Para leer el contenido sería necesario OCR manual.`;

    try {
      const raw = await callLLM(prompt, database);
      const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.title) title = String(parsed.title).slice(0, 200);
      if (parsed.summary) summary = String(parsed.summary).slice(0, 800);
    } catch { /* use fallback */ }

    const tree = [{
      title: title || displayName,
      node_id: '0001',
      summary: `[PDF basado en imágenes — "${displayName}" — ${numPages} páginas — OCR no disponible]\n\n${summary}`,
      start_index: 0,
      end_index: numPages - 1,
      nodes: [],
    }];

    setState(resourceId, 'done', 100, 'PDF basado en imágenes (sin OCR)', windowManager, database);
    return { success: true, tree_json: JSON.stringify(tree) };
  }

  // --- Normal PDF with text ---
  setState(
    resourceId,
    'processing',
    10,
    `${effectivePages.length} de ${numPages} páginas con texto — detectando estructura…`,
    windowManager,
    database
  );

  const candidates = await extractCandidateSectionsFromPages(pageTexts, database);
  let finalTree = buildTreeFromSectionCandidates(candidates, pageTexts.length, pageTexts.length - 1);

  if (finalTree.length === 0) {
    finalTree = buildTreeFromSectionCandidates(buildFallbackSectionCandidates(pageTexts), pageTexts.length, pageTexts.length - 1);
  }

  setState(resourceId, 'processing', 25, 'Refinando capítulos largos…', windowManager, database);
  for (const node of finalTree) {
    await refineLargeNodesRecursively(node, pageTexts, database);
  }

  resetNodeCounter();
  assignNodeIds(finalTree);
  await summarizeTreeNodes(finalTree, pageTexts, database, resourceId, windowManager);

  setState(resourceId, 'processing', 99, 'Guardando índice…', windowManager, database);

  const treeJson = JSON.stringify(finalTree, null, 0);

  setState(resourceId, 'done', 100, 'Listo para IA', windowManager, database);
  return { success: true, tree_json: treeJson };
}

// ---------------------------------------------------------------------------
// Markdown / Note indexing
// ---------------------------------------------------------------------------

/**
 * Parse H1-H6 headers from markdown and build a section list.
 * @param {string} content
 * @returns {Array<{ level, title, text }>}
 */
function parseMarkdownSections(content) {
  const lines = content.split('\n');
  const headerPattern = /^(#{1,6})\s+(.+)$/;
  const codeBlockPattern = /^```/;

  const sectionBoundaries = []; // { lineIndex, level, title }
  let inCodeBlock = false;

  lines.forEach((line, idx) => {
    if (codeBlockPattern.test(line.trim())) { inCodeBlock = !inCodeBlock; return; }
    if (inCodeBlock) return;
    const m = line.trim().match(headerPattern);
    if (m) sectionBoundaries.push({ lineIndex: idx, level: m[1].length, title: m[2].trim() });
  });

  if (sectionBoundaries.length === 0) {
    // No headers — treat whole document as one node
    return [{ level: 1, title: 'Contenido', text: content.trim() }];
  }

  const sections = sectionBoundaries.map((boundary, i) => {
    const startLine = boundary.lineIndex;
    const endLine = i + 1 < sectionBoundaries.length
      ? sectionBoundaries[i + 1].lineIndex
      : lines.length;
    const text = lines.slice(startLine, endLine).join('\n').trim();
    return { level: boundary.level, title: boundary.title, text };
  });

  return sections;
}

/**
 * Build a hierarchical tree from flat sections (based on header level).
 * @param {Array<{ level, title, text }>} sections
 * @returns {Array}
 */
function buildTreeFromSections(sections) {
  const root = [];
  const stack = []; // [{ node, level }]

  for (const section of sections) {
    const node = {
      title: section.title,
      node_id: nextNodeId(),
      summary: section.text.slice(0, 500),
      line_num: 0,
      nodes: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.nodes.push(node);
    }

    stack.push({ node, level: section.level });
  }

  return root;
}

/**
 * Index a note/markdown resource: parse headers, build tree.
 * No LLM needed for structure — headers give us the tree directly.
 * @param {string} resourceId
 * @param {string} content    Markdown or plain text
 * @param {string} title      Document title (optional)
 * @param {{ database: object, windowManager: object }} deps
 * @returns {Promise<{ success: boolean, tree_json?: string, error?: string }>}
 */
async function indexMarkdown(resourceId, content, title, deps) {
  const { database, windowManager } = deps || {};

  if (!content || !content.trim()) {
    const msg = 'Contenido vacío';
    setState(resourceId, 'error', 0, msg, windowManager, database, msg);
    return { success: false, error: msg };
  }

  setState(resourceId, 'processing', 10, 'Analizando estructura…', windowManager, database);

  const fullContent = title ? `# ${title}\n\n${content}` : content;

  resetNodeCounter();
  const sections = parseMarkdownSections(fullContent);

  setState(resourceId, 'processing', 60, `${sections.length} secciones encontradas…`, windowManager, database);

  const tree = buildTreeFromSections(sections);

  setState(resourceId, 'processing', 95, 'Guardando índice…', windowManager, database);

  const treeJson = JSON.stringify(tree, null, 0);

  setState(resourceId, 'done', 100, 'Listo para IA', windowManager, database);
  return { success: true, tree_json: treeJson };
}

/**
 * Index a generic text-based resource by coercing it into markdown.
 * This keeps a single tree format for notes, notebooks, processed URLs,
 * DOCX/PPT text extracts, and similar content-bearing resources.
 * @param {string} resourceId
 * @param {string} content
 * @param {string} title
 * @param {{ database: object, windowManager: object }} deps
 * @returns {Promise<{ success: boolean, tree_json?: string, error?: string }>}
 */
async function indexTextResource(resourceId, content, title, deps) {
  const safeTitle = String(title || 'Contenido').trim();
  const body = String(content || '').trim();
  return indexMarkdown(resourceId, body, safeTitle, deps);
}

// ---------------------------------------------------------------------------
// Search (replaces Python _llm_search)
// ---------------------------------------------------------------------------

/**
 * Flatten a hierarchical tree into a flat list of nodes.
 * @param {Array|object} tree
 * @returns {Array<object>}
 */
function flattenTree(tree) {
  const nodes = [];
  function walk(item) {
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (!item || typeof item !== 'object') return;
    const { nodes: children, ...node } = item;
    nodes.push(node);
    if (Array.isArray(children)) children.forEach(walk);
  }
  walk(tree);
  return nodes;
}

function flattenTreeWithAncestors(tree) {
  const nodes = [];
  function walk(item, ancestors = []) {
    if (Array.isArray(item)) {
      item.forEach((child) => walk(child, ancestors));
      return;
    }
    if (!item || typeof item !== 'object') return;
    const { nodes: children, ...node } = item;
    nodes.push({
      ...node,
      ancestors,
      level: ancestors.length,
      path: [...ancestors.map((ancestor) => ancestor.title), node.title].filter(Boolean),
    });
    if (Array.isArray(children)) {
      const nextAncestors = [...ancestors, { title: node.title, node_id: node.node_id }];
      children.forEach((child) => walk(child, nextAncestors));
    }
  }
  walk(tree, []);
  return nodes;
}

/**
 * Reasoning-based search across multiple document trees.
 * Uses the configured LLM to rank sections by relevance.
 * @param {string} query
 * @param {Array<{ resource_id: string, tree_json: string }>} trees
 * @param {number} topK
 * @param {object} database
 * @returns {Promise<{ success: boolean, results?: Array, error?: string }>}
 */
async function search(query, trees, topK, database) {
  if (!trees || trees.length === 0) return { success: true, results: [] };

  try {
    const allResults = [];

    for (const treeEntry of trees) {
      const { resource_id, tree_json } = treeEntry;
      if (!tree_json) continue;

      let tree;
      try { tree = JSON.parse(tree_json); } catch { continue; }

      const flatNodes = flattenTreeWithAncestors(tree);
      if (flatNodes.length === 0) continue;

      const sections = flatNodes.map((n, i) =>
        `${i}. [${n.title || ''}] págs. ${(n.start_index ?? 0) + 1}-${(n.end_index ?? n.start_index ?? 0) + 1}: ${(n.summary || '').slice(0, 200)}`
      ).join('\n');

      const prompt =
        `Eres un motor de búsqueda de documentos. Dado el query: "${query}"\n\n` +
        `Clasifica estas secciones del documento por relevancia (las más relevantes primero).\n` +
        `Devuelve SOLO JSON: {"indices": [2, 0, 1, ...]}\n\n` +
        `Secciones:\n${sections}\n\nResponde SOLO con el JSON.`;

      let indices = flatNodes.map((_, i) => i).slice(0, topK);
      try {
        const raw = await callLLM(prompt, database);
        const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.indices)) indices = parsed.indices;
      } catch { /* use default order */ }

      for (let rank = 0; rank < Math.min(indices.length, topK); rank++) {
        const idx = indices[rank];
        if (idx < 0 || idx >= flatNodes.length) continue;
        const n = flatNodes[idx];
        const pages = [];
        const start = n.start_index ?? 0;
        const end = n.end_index ?? start;
        for (let p = start; p <= end; p++) pages.push(p);
        allResults.push({
          resource_id,
          pages,
          text: n.summary || '',
          node_id: n.node_id || '',
          node_title: n.title || '',
          node_path: Array.isArray(n.path) ? n.path : [],
          page_range: pageRangeLabel(start, end),
          score: Math.max(0, 1.0 - rank * (0.5 / Math.max(topK, 1))),
        });
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    return { success: true, results: allResults.slice(0, topK * trees.length) };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Public state query
// ---------------------------------------------------------------------------

/**
 * Get in-memory indexing state for a resource.
 * @param {string} resourceId
 * @returns {{ status: string, progress: number, step: string } | null}
 */
function getState(resourceId) {
  return state.get(resourceId) || null;
}

/**
 * Check if a resource is currently being indexed.
 * @param {string} resourceId
 * @returns {boolean}
 */
function isProcessing(resourceId) {
  return state.get(resourceId)?.status === 'processing';
}

// ---------------------------------------------------------------------------
// Outline formatter
// ---------------------------------------------------------------------------

/**
 * Find a node in the tree by node_id.
 * @param {Array|object} tree
 * @param {string} nodeId
 * @returns {object|null}
 */
function findNodeById(tree, nodeId) {
  const result = findNodeByIdWithPath(tree, nodeId);
  return result ? result.node : null;
}

/**
 * Find a node in the tree by node_id, with its ancestor path.
 * @param {Array|object} tree
 * @param {string} nodeId
 * @returns {{ node: object, path: string[] }|null}
 */
function findNodeByIdWithPath(tree, nodeId) {
  if (!tree || !nodeId) return null;
  const normalized = String(nodeId).trim();
  function walk(item, ancestors) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = walk(child, ancestors);
        if (found) return found;
      }
      return null;
    }
    if (!item || typeof item !== 'object') return null;
    if (String(item.node_id || '').trim() === normalized) {
      const path = [...ancestors.map((a) => a.title), item.title].filter(Boolean);
      return { node: item, path };
    }
    const nextAncestors = [...ancestors, { title: item.title }];
    for (const child of item.nodes || []) {
      const found = walk(child, nextAncestors);
      if (found) return found;
    }
    return null;
  }
  return walk(Array.isArray(tree) ? tree : [tree], []);
}

/**
 * Build a compact structure array from the tree for programmatic use.
 * @param {Array} tree
 * @returns {Array<{ node_id: string, title: string, page_range: string, children: Array }>}
 */
function buildStructureArray(tree) {
  if (!Array.isArray(tree)) return [];
  return tree.map((node) => {
    const start = node.start_index ?? 0;
    const end = node.end_index ?? start;
    const pageRange = `p.${start + 1}–${end + 1}`;
    const children = buildStructureArray(node.nodes || []);
    return {
      node_id: node.node_id || '',
      title: node.title || 'Sección',
      page_range: pageRange,
      children,
    };
  });
}

/**
 * Format a hierarchical tree as a readable outline string (includes node_id for navigation).
 * @param {Array} tree
 * @param {number} [depth]
 * @returns {string}
 */
function formatTreeAsOutline(tree, depth = 0) {
  if (!Array.isArray(tree)) return '';
  return tree.map(node => {
    const indent = '  '.repeat(depth);
    const range = node.start_index != null
      ? ` (p.${node.start_index + 1}–${(node.end_index ?? node.start_index) + 1})` : '';
    const nodeIdPart = node.node_id ? ` [node_id: ${node.node_id}]` : '';
    const line = `${indent}• ${node.title || 'Sección'}${range}${nodeIdPart}`;
    const keywords = node.keywords?.length ? ` [${node.keywords.slice(0, 3).join(', ')}]` : '';
    const sub = node.nodes?.length
      ? '\n' + formatTreeAsOutline(node.nodes, depth + 1) : '';
    return line + keywords + sub;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  indexPDF,
  indexMarkdown,
  indexTextResource,
  search,
  getState,
  isProcessing,
  flattenTree,
  flattenTreeWithAncestors,
  formatTreeAsOutline,
  buildStructureArray,
  findNodeById,
  findNodeByIdWithPath,
  countTreeNodes,
};
