/**
 * Studio output content validators (main process).
 * P-002: validate and normalize shapes at the IPC boundary before persisting.
 */

const VALID_STUDIO_TYPES = new Set([
  'mindmap',
  'quiz',
  'guide',
  'faq',
  'timeline',
  'table',
  'flashcards',
  'audio',
  'video',
  'research',
]);

const CONTENTLESS_TYPES = new Set(['flashcards']);

const PASSTHROUGH_TYPES = new Set(['audio', 'video', 'research']);

const TRUE_STRINGS = new Set(['true', 'verdadero', 'v', 'yes', 'sí', 'si', 't']);
const FALSE_STRINGS = new Set(['false', 'falso', 'f', 'no']);

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Normalize quiz `correct` to a 0-based integer index.
 * @param {unknown} correct
 * @param {'multiple_choice'|'true_false'} type
 * @param {string[]|undefined} options
 * @returns {number|null}
 */
function normalizeQuizCorrect(correct, type, options) {
  if (type === 'true_false') {
    if (options && options.length >= 2) {
      const fromOptions = normalizeQuizCorrect(correct, 'multiple_choice', options);
      if (fromOptions !== null && fromOptions <= 1) return fromOptions;
    }

    if (typeof correct === 'boolean') {
      return correct ? 0 : 1;
    }
    if (typeof correct === 'number' && Number.isFinite(correct)) {
      const n = Math.trunc(correct);
      if (n === 0 || n === 1) return n;
      return null;
    }
    if (typeof correct === 'string') {
      const lower = correct.trim().toLowerCase();
      if (TRUE_STRINGS.has(lower)) return 0;
      if (FALSE_STRINGS.has(lower)) return 1;
      const parsed = Number.parseInt(lower, 10);
      if (!Number.isNaN(parsed) && (parsed === 0 || parsed === 1)) return parsed;
    }
    return null;
  }

  if (type !== 'multiple_choice') {
    return null;
  }

  const opts = Array.isArray(options) ? options.map((o) => trimString(o)).filter(Boolean) : [];
  if (opts.length < 2) return null;

  if (typeof correct === 'number' && Number.isFinite(correct)) {
    const n = Math.trunc(correct);
    if (n >= 0 && n < opts.length) return n;
    // 1-based: last option when AI uses options.length (e.g. 4 options, correct: 4)
    if (n >= 1 && n === opts.length) return n - 1;
    return null;
  }

  if (typeof correct === 'boolean') {
    return correct ? 0 : 1;
  }

  if (typeof correct === 'string') {
    const trimmed = correct.trim();
    if (!trimmed) return null;

    const letterMatch = /^[A-Za-z]$/.exec(trimmed);
    if (letterMatch) {
      const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < opts.length) return idx;
    }

    const asNum = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(asNum)) {
      if (asNum >= 0 && asNum < opts.length) return asNum;
      if (asNum >= 1 && asNum <= opts.length) return asNum - 1;
    }

    const lower = trimmed.toLowerCase();
    const matchIdx = opts.findIndex((o) => o.toLowerCase() === lower);
    if (matchIdx >= 0) return matchIdx;
  }

  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, content: object|null, normalized: object|null, errors: string[] }}
 */
function validateQuizContent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['quiz: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const questionsRaw = input.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['quiz: questions array is required and must not be empty'] };
  }

  /** @type {Array<Record<string, unknown>>} */
  const questions = [];
  let qIndex = 0;

  for (const item of questionsRaw) {
    qIndex += 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`quiz: question ${qIndex} is not an object`);
      continue;
    }

    const q = /** @type {Record<string, unknown>} */ (item);
    const questionText = trimString(q.question);
    if (!questionText) {
      errors.push(`quiz: question ${qIndex} missing question text`);
      continue;
    }

    const typeRaw = trimString(q.type).toLowerCase();
    if (typeRaw !== 'multiple_choice' && typeRaw !== 'true_false') {
      errors.push(`quiz: question ${qIndex} has unsupported type "${q.type}"`);
      continue;
    }

    const id = trimString(q.id) || `q${questions.length + 1}`;
    const explanation = trimString(q.explanation) || '';
    const correctRaw = q.correct ?? q.correct_answer ?? q.answer;

    if (typeRaw === 'multiple_choice') {
      const optionsRaw = q.options;
      if (!Array.isArray(optionsRaw)) {
        errors.push(`quiz: question ${qIndex} missing options array`);
        continue;
      }
      const options = optionsRaw.map((o) => trimString(o)).filter(Boolean);
      if (options.length < 2) {
        errors.push(`quiz: question ${qIndex} needs at least 2 options`);
        continue;
      }

      const correctIdx = normalizeQuizCorrect(correctRaw, 'multiple_choice', options);
      if (correctIdx === null) {
        errors.push(`quiz: question ${qIndex} has invalid correct answer`);
        continue;
      }

      questions.push({
        id,
        type: 'multiple_choice',
        question: questionText,
        options,
        correct: correctIdx,
        explanation,
        ...(q.source_citation && typeof q.source_citation === 'object'
          ? { source_citation: q.source_citation }
          : {}),
      });
    } else {
      const tfOptions = Array.isArray(q.options)
        ? q.options.map((o) => trimString(o)).filter(Boolean)
        : undefined;
      const correctIdx = normalizeQuizCorrect(
        correctRaw,
        'true_false',
        tfOptions && tfOptions.length >= 2 ? tfOptions : undefined,
      );
      if (correctIdx === null) {
        errors.push(`quiz: question ${qIndex} has invalid true/false correct value`);
        continue;
      }

      questions.push({
        id,
        type: 'true_false',
        question: questionText,
        correct: correctIdx,
        explanation,
        ...(q.source_citation && typeof q.source_citation === 'object'
          ? { source_citation: q.source_citation }
          : {}),
      });
    }
  }

  if (questions.length === 0) {
    return {
      ok: false,
      content: null,
      normalized: null,
      errors: errors.length ? errors : ['quiz: no valid questions after normalization'],
    };
  }

  const normalized = { type: 'quiz', questions };
  return { ok: true, content: normalized, normalized, errors };
}

/**
 * @param {unknown} raw
 */
function validateMindmapContent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['mindmap: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const nodesRaw = input.nodes;
  const edgesRaw = input.edges;

  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['mindmap: nodes array is required'] };
  }

  /** @type {Map<string, { id: string, label: string, description?: string }>} */
  const nodeMap = new Map();
  for (let i = 0; i < nodesRaw.length; i++) {
    const n = nodesRaw[i];
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
      errors.push(`mindmap: node ${i + 1} is not an object`);
      continue;
    }
    const node = /** @type {Record<string, unknown>} */ (n);
    const id = trimString(node.id) || `node-${i + 1}`;
    const label = trimString(node.label);
    if (!label) {
      errors.push(`mindmap: node ${id} missing label`);
      continue;
    }
    const description = trimString(node.description);
    nodeMap.set(id, description ? { id, label, description } : { id, label });
  }

  if (nodeMap.size === 0) {
    return { ok: false, content: null, normalized: null, errors: errors.length ? errors : ['mindmap: no valid nodes'] };
  }

  /** @type {Array<{ id: string, source: string, target: string, label?: string }>} */
  const edges = [];
  if (Array.isArray(edgesRaw)) {
    for (let i = 0; i < edgesRaw.length; i++) {
      const e = edgesRaw[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      const edge = /** @type {Record<string, unknown>} */ (e);
      const source = trimString(edge.source);
      const target = trimString(edge.target);
      if (!source || !target) continue;
      if (!nodeMap.has(source) || !nodeMap.has(target)) continue;
      const id = trimString(edge.id) || `edge-${i + 1}`;
      const label = trimString(edge.label);
      edges.push(label ? { id, source, target, label } : { id, source, target });
    }
  }

  const normalized = {
    type: 'mindmap',
    nodes: Array.from(nodeMap.values()),
    edges,
  };
  return { ok: true, content: normalized, normalized, errors };
}

/**
 * @param {unknown} raw
 */
function validateGuideContent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['guide: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const sectionsRaw = input.sections;
  if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['guide: sections array is required'] };
  }

  const sections = [];
  for (let i = 0; i < sectionsRaw.length; i++) {
    const s = sectionsRaw[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const sec = /** @type {Record<string, unknown>} */ (s);
    const title = trimString(sec.title);
    const content = trimString(sec.content);
    if (title && content) sections.push({ title, content });
  }

  if (sections.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['guide: no valid sections'] };
  }

  const normalized = { type: 'guide', sections };
  return { ok: true, content: normalized, normalized, errors: [] };
}

/**
 * @param {unknown} raw
 */
function validateFaqContent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['faq: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const pairsRaw = input.pairs;
  if (!Array.isArray(pairsRaw) || pairsRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['faq: pairs array is required'] };
  }

  const pairs = [];
  for (const p of pairsRaw) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const pair = /** @type {Record<string, unknown>} */ (p);
    const question = trimString(pair.question);
    const answer = trimString(pair.answer);
    if (question && answer) {
      const entry = { question, answer };
      const sourceId = trimString(pair.source_id);
      if (sourceId) entry.source_id = sourceId;
      pairs.push(entry);
    }
  }

  if (pairs.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['faq: no valid pairs'] };
  }

  const normalized = { type: 'faq', pairs };
  return { ok: true, content: normalized, normalized, errors: [] };
}

/**
 * @param {unknown} raw
 */
function validateTimelineContent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['timeline: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const eventsRaw = input.events;
  if (!Array.isArray(eventsRaw) || eventsRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['timeline: events array is required'] };
  }

  const events = [];
  for (const ev of eventsRaw) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue;
    const event = /** @type {Record<string, unknown>} */ (ev);
    const date = trimString(event.date);
    const title = trimString(event.title);
    const description = trimString(event.description);
    if (date && title && description) {
      const entry = { date, title, description };
      const sourceId = trimString(event.source_id);
      if (sourceId) entry.source_id = sourceId;
      events.push(entry);
    }
  }

  if (events.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['timeline: no valid events'] };
  }

  const normalized = { type: 'timeline', events };
  return { ok: true, content: normalized, normalized, errors: [] };
}

/**
 * @param {unknown} raw
 */
function validateTableContent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, content: null, normalized: null, errors: ['table: content must be an object'] };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const columnsRaw = input.columns;
  const rowsRaw = input.rows;

  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['table: columns array is required'] };
  }

  const columns = [];
  const keys = new Set();
  for (let i = 0; i < columnsRaw.length; i++) {
    const c = columnsRaw[i];
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const col = /** @type {Record<string, unknown>} */ (c);
    const key = trimString(col.key) || `col${i + 1}`;
    const label = trimString(col.label) || key;
    if (keys.has(key)) continue;
    keys.add(key);
    columns.push({ key, label });
  }

  if (columns.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['table: no valid columns'] };
  }

  const columnKeys = columns.map((c) => c.key);
  const rows = [];
  if (Array.isArray(rowsRaw)) {
    for (const r of rowsRaw) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const row = /** @type {Record<string, unknown>} */ (r);
      /** @type {Record<string, string|number>} */
      const normalizedRow = {};
      let hasValue = false;
      for (const key of columnKeys) {
        const val = row[key];
        if (val != null && val !== '') {
          normalizedRow[key] = typeof val === 'number' ? val : trimString(val);
          hasValue = true;
        } else {
          normalizedRow[key] = '';
        }
      }
      if (hasValue) rows.push(normalizedRow);
    }
  }

  if (rows.length === 0) {
    return { ok: false, content: null, normalized: null, errors: ['table: no valid rows'] };
  }

  const normalized = { type: 'table', columns, rows };
  return { ok: true, content: normalized, normalized, errors: [] };
}

/**
 * Parse content input (string or object).
 * @param {unknown} contentInput
 * @returns {{ parsed: object|null, parseError: string|null }}
 */
function parseContentInput(contentInput) {
  if (contentInput == null || contentInput === '') {
    return { parsed: null, parseError: null };
  }
  if (typeof contentInput === 'object' && !Array.isArray(contentInput)) {
    return { parsed: /** @type {object} */ (contentInput), parseError: null };
  }
  if (typeof contentInput === 'string') {
    try {
      const parsed = JSON.parse(contentInput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { parsed, parseError: null };
      }
      return { parsed: null, parseError: 'content JSON must be an object' };
    } catch (e) {
      return { parsed: null, parseError: e instanceof Error ? e.message : 'invalid JSON' };
    }
  }
  return { parsed: null, parseError: 'content must be a JSON object or string' };
}

/**
 * Validate and normalize studio output content before persisting.
 * @param {string} type - studio_outputs.type
 * @param {unknown} contentInput - raw content (string JSON or object)
 * @returns {{ ok: boolean, content: string|null, normalized: object|null, errors: string[] }}
 */
function validateAndNormalizeStudioContent(type, contentInput) {
  if (!VALID_STUDIO_TYPES.has(type)) {
    return { ok: false, content: null, normalized: null, errors: [`unknown studio type: ${type}`] };
  }

  if (CONTENTLESS_TYPES.has(type)) {
    return { ok: true, content: contentInput == null ? null : (typeof contentInput === 'string' ? contentInput : JSON.stringify(contentInput)), normalized: null, errors: [] };
  }

  if (PASSTHROUGH_TYPES.has(type)) {
    const { parsed, parseError } = parseContentInput(contentInput);
    if (parseError) {
      return { ok: false, content: null, normalized: null, errors: [parseError] };
    }
    const str = parsed ? JSON.stringify(parsed) : (typeof contentInput === 'string' ? contentInput : null);
    return { ok: true, content: str, normalized: parsed, errors: [] };
  }

  const { parsed, parseError } = parseContentInput(contentInput);
  if (parseError) {
    return { ok: false, content: null, normalized: null, errors: [parseError] };
  }
  if (!parsed) {
    return { ok: false, content: null, normalized: null, errors: ['studio.validation_no_items'] };
  }

  /** @type {{ ok: boolean, content: object|null, normalized: object|null, errors: string[] }} */
  let result;
  switch (type) {
    case 'quiz':
      result = validateQuizContent(parsed);
      break;
    case 'mindmap':
      result = validateMindmapContent(parsed);
      break;
    case 'guide':
      result = validateGuideContent(parsed);
      break;
    case 'faq':
      result = validateFaqContent(parsed);
      break;
    case 'timeline':
      result = validateTimelineContent(parsed);
      break;
    case 'table':
      result = validateTableContent(parsed);
      break;
    default:
      result = { ok: false, content: null, normalized: null, errors: [`unsupported validation for type: ${type}`] };
  }

  if (!result.ok || !result.normalized) {
    return {
      ok: false,
      content: null,
      normalized: null,
      errors: result.errors.length ? result.errors : ['studio.validation_no_items'],
    };
  }

  return {
    ok: true,
    content: JSON.stringify(result.normalized),
    normalized: result.normalized,
    errors: result.errors,
  };
}

module.exports = {
  VALID_STUDIO_TYPES,
  normalizeQuizCorrect,
  validateAndNormalizeStudioContent,
  validateQuizContent,
  validateMindmapContent,
  validateGuideContent,
  validateFaqContent,
  validateTimelineContent,
  validateTableContent,
};
