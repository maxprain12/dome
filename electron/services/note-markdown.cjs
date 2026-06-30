/**
 * Note markdown I/O for agent tools (main process).
 * Vault `.md` mirror is the source of truth; legacy TipTap JSON in `resources.content`
 * is converted on read.
 */
const vaultStore = require('../storage/vault-store.cjs');
const { stripTags } = require('./resource-text.cjs');

function looksLikeMarkdown(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.replace(/^\uFEFF/, '').trim();
  if (!t) return false;
  if (/^#{1,6}\s/m.test(t)) return true;
  if (/\|[^\n]+\|/m.test(t)) return true;
  if (/```|`[^`]+`/.test(t)) return true;
  if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__/.test(t)) return true;
  if (/^[\s]*[-*]\s/m.test(t)) return true;
  if (/^[\s]*\d+\.\s/m.test(t)) return true;
  if (/^[\s]*>\s/m.test(t)) return true;
  if (/(^|\n)[\s]*(-{3,}|\*{3,}|_{3,})[\s]*($|\n)/.test(t)) return true;
  if (/\[.+?\]\(.+?\)/.test(t)) return true;
  if (/!\[.*?\]\(.+?\)/.test(t)) return true;
  return false;
}

function parseTipTapDocJson(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
      return parsed;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function inlineMarksToMarkdown(node) {
  if (!node || node.type !== 'text' || typeof node.text !== 'string') return '';
  let text = node.text;
  const marks = Array.isArray(node.marks) ? node.marks : [];
  for (const mark of marks) {
    if (mark.type === 'bold') text = `**${text}**`;
    else if (mark.type === 'italic') text = `*${text}*`;
    else if (mark.type === 'code') text = `\`${text}\``;
    else if (mark.type === 'strike') text = `~~${text}~~`;
  }
  return text;
}

function inlineNodeToMarkdown(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return inlineMarksToMarkdown(node);
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') {
    const id = node.attrs?.id || '';
    const label = node.attrs?.label || id;
    return `@[${label}](${id})`;
  }
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => inlineNodeToMarkdown(child)).join('');
}

function blockNodesToMarkdown(nodes) {
  if (!Array.isArray(nodes)) return '';
  return nodes.map((node) => blockNodeToMarkdown(node)).filter(Boolean).join('\n\n');
}

function blockNodeToMarkdown(node) {
  if (!node || typeof node !== 'object') return '';
  const type = node.type;

  if (type === 'paragraph') {
    const inner = inlineNodeToMarkdown(node);
    return inner.trim() ? inner : '';
  }

  if (type === 'heading') {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return `${'#'.repeat(level)} ${inlineNodeToMarkdown(node).trim()}`;
  }

  if (type === 'horizontalRule') return '---';

  if (type === 'codeBlock') {
    const lang = node.attrs?.language || '';
    const code = inlineNodeToMarkdown(node);
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  if (type === 'bulletList') {
    const items = Array.isArray(node.content) ? node.content : [];
    return items
      .map((item) => {
        const body = blockNodesToMarkdown(item.content).replace(/\n/g, '\n  ');
        return `- ${body}`;
      })
      .join('\n');
  }

  if (type === 'orderedList') {
    const items = Array.isArray(node.content) ? node.content : [];
    return items
      .map((item, idx) => {
        const body = blockNodesToMarkdown(item.content).replace(/\n/g, '\n   ');
        return `${idx + 1}. ${body}`;
      })
      .join('\n');
  }

  if (type === 'listItem') {
    return blockNodesToMarkdown(node.content);
  }

  if (type === 'blockquote') {
    const inner = blockNodesToMarkdown(node.content);
    return inner
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  }

  if (type === 'table') {
    const rows = Array.isArray(node.content) ? node.content : [];
    const mdRows = rows.map((row) => tableRowToMarkdown(row));
    if (mdRows.length >= 2 && !/^\|?\s*:?-{3,}/.test(mdRows[1])) {
      const colCount = (mdRows[0].match(/\|/g) || []).length - 1;
      const sep = `| ${Array.from({ length: Math.max(1, colCount) }, () => '---').join(' | ')} |`;
      mdRows.splice(1, 0, sep);
    }
    return mdRows.join('\n');
  }

  if (type === 'image') {
    const src = node.attrs?.src || node.attrs?.alt || 'image';
    const alt = node.attrs?.alt || 'image';
    return `![${alt}](${src})`;
  }

  if (type === 'caption') {
    return blockNodesToMarkdown(node.content);
  }

  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => blockNodeToMarkdown(child)).filter(Boolean).join('\n');
}

function tableRowToMarkdown(row) {
  const cells = Array.isArray(row?.content) ? row.content : [];
  const values = cells.map((cell) => blockNodesToMarkdown(cell.content).replace(/\|/g, '\\|').replace(/\n/g, ' '));
  return `| ${values.join(' | ')} |`;
}

function tiptapDocToMarkdown(doc) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return '';
  return blockNodesToMarkdown(doc.content).replace(/\n{3,}/g, '\n\n').trim();
}

function tiptapJsonToMarkdown(content) {
  const doc = parseTipTapDocJson(content);
  return doc ? tiptapDocToMarkdown(doc) : null;
}

function coerceAgentInputToMarkdown(rawContent) {
  const text = String(rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const doc = parseTipTapDocJson(text);
  if (doc) return tiptapDocToMarkdown(doc);
  return text;
}

function normalizeAgentNoteInput(rawContent, { title, isCreate = false, queries, metadata = {} } = {}) {
  const linkedResourceIds = new Set();
  let text = coerceAgentInputToMarkdown(rawContent);

  const explicitSourceIds = [
    metadata.sourceResourceId,
    metadata.source_resource_id,
    metadata.originResourceId,
    metadata.origin_resource_id,
  ].filter((value) => typeof value === 'string' && value.trim());

  const resolveResourceMention = (resourceId) => {
    const resource = queries?.getResourceById?.get(resourceId);
    if (!resource) return null;
    linkedResourceIds.add(resource.id);
    const label = String(resource.title || resource.id).replace(/[\]]/g, '');
    return `@[${label}](${resource.id})`;
  };

  text = text
    .split('\n')
    .map((line) => {
      const origin = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(nota origen|source note|original note)(?:\*\*)?\s*[:|]\s*([A-Za-z0-9_-]{8,})\s*$/i);
      if (!origin) return line;
      const mention = resolveResourceMention(origin[2]);
      return mention ? `> **Nota origen:** ${mention}` : line;
    })
    .join('\n');

  for (const sourceId of explicitSourceIds) {
    if (text.includes(String(sourceId))) continue;
    const mention = resolveResourceMention(String(sourceId));
    if (mention) {
      text = `> **Nota origen:** ${mention}\n\n${text}`;
    }
  }

  if (isCreate && !/^#\s+/m.test(text) && title) {
    text = `# ${String(title).trim()}\n\n${text}`;
  }

  const lines = text.split('\n');
  const normalizedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    normalizedLines.push(isTableRow ? line.replace(/\s*\|\s*/g, ' | ').replace(/^\s*/, '').replace(/\s*$/, '') : line);
    const next = lines[i + 1] || '';
    if (isTableRow && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next) && /^\s*\|.*\|\s*$/.test(next)) {
      const columns = line.split('|').filter(Boolean).length;
      normalizedLines.push(`| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    }
  }

  return {
    markdown: normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    linkedResourceIds: Array.from(linkedResourceIds),
  };
}

function readNoteMarkdownForAgent(resource, { database, fileStorage }) {
  if (resource.vault_path) {
    const mirror = vaultStore.readNoteMarkdown({ id: resource.id }, { database, fileStorage });
    if (mirror.success && typeof mirror.markdown === 'string') {
      return mirror.markdown;
    }
  }

  const raw = String(resource.content || '').trim();
  if (!raw) return '';

  const fromJson = tiptapJsonToMarkdown(raw);
  if (fromJson) return fromJson;

  if (looksLikeMarkdown(raw)) return raw;

  if (raw.startsWith('<')) return stripTags(raw);

  return raw;
}

function writeNoteMarkdownFromAgent(
  { id, markdown, title, metadata },
  { database, fileStorage, semanticIndexScheduler },
) {
  const queries = database.getQueries();
  const existing = queries.getResourceById.get(id);
  if (!existing) return { success: false, error: 'Resource not found' };
  if (existing.type !== 'note') return { success: false, error: 'Not a note' };

  const now = Date.now();
  const resolvedTitle = title !== undefined ? String(title).trim() : existing.title;
  const resolvedMetadata = metadata !== undefined ? metadata : existing.metadata;
  const body = typeof markdown === 'string' ? markdown : '';

  const mirrorResult = vaultStore.writeNoteMarkdown({ id, markdown: body }, { database, fileStorage });
  if (!mirrorResult.success) {
    return mirrorResult;
  }

  queries.updateResource.run(resolvedTitle, body, resolvedMetadata, now, id);

  if (semanticIndexScheduler) {
    semanticIndexScheduler.init(database);
    if (semanticIndexScheduler.shouldIndex?.(existing)) {
      semanticIndexScheduler.scheduleSemanticReindex(id);
    }
  }

  return {
    success: true,
    markdown: body,
    title: resolvedTitle,
    updated_at: now,
    vaultPath: mirrorResult.vaultPath,
  };
}

module.exports = {
  looksLikeMarkdown,
  parseTipTapDocJson,
  tiptapDocToMarkdown,
  tiptapJsonToMarkdown,
  coerceAgentInputToMarkdown,
  normalizeAgentNoteInput,
  readNoteMarkdownForAgent,
  writeNoteMarkdownFromAgent,
};
