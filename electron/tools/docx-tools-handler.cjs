/* eslint-disable no-console */
/**
 * DOCX Tools Handler — Main process
 *
 * CRUD for Word (.docx) library resources: read (mammoth), create/update
 * (docx-js structured content or markdown/HTML via html-to-docx), delete.
 * Page layout follows US Letter + Arial defaults from the Dome docx skill.
 */

const fs = require('fs');
const crypto = require('crypto');

const database = require('../core/database.cjs');
const fileStorage = require('../storage/file-storage.cjs');
const documentStaging = require('../documents/document-staging.cjs');
const documentExtractor = require('../documents/document-extractor.cjs');
const docxConverter = require('../documents/docx-converter.cjs');
const semanticIndexScheduler = require('../storage/semantic-index-scheduler.cjs');

let mammoth = null;
try {
  mammoth = require('mammoth');
} catch (e) {
  console.warn('[DocxTools] mammoth not available:', e?.message);
}

let windowManagerRef = null;

function setWindowManager(wm) {
  windowManagerRef = wm;
}

function broadcastResourceCreated(resource) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:created', resource);
  }
}

function broadcastResourceUpdated(resourceId, updates) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:updated', { id: resourceId, updates: updates || { updated_at: Date.now() } });
  }
}

function broadcastResourceDeleted(resourceId) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:deleted', { id: resourceId });
  }
}

function isDocxResource(resource) {
  if (!resource) return false;
  const mime = (resource.file_mime_type || '').toLowerCase();
  const filename = (resource.original_filename || resource.title || '').toLowerCase();
  if (filename.endsWith('.pptx') || filename.endsWith('.xlsx') || filename.endsWith('.xls')) return false;
  if (filename.endsWith('.docx')) return true;
  if (mime.includes('wordprocessingml') && !mime.includes('spreadsheetml') && !mime.includes('presentationml')) {
    return true;
  }
  if (filename.endsWith('.doc') && (mime.includes('msword') || mime.includes('word'))) return true;
  return resource.type === 'document' && filename.endsWith('.docx');
}

function getFullPathForResource(resource) {
  const vaultStore = require('../storage/vault-store.cjs');
  const resolved = vaultStore.getResourceFilePath(resource, database.getQueries(), fileStorage);
  return resolved && fs.existsSync(resolved) ? resolved : null;
}

function normalizeContentBlocks(options) {
  if (Array.isArray(options.blocks) && options.blocks.length > 0) {
    return options.blocks.map((raw) => {
      const t = String(raw.type || 'paragraph').toLowerCase();
      const type = t === 'heading' || t === 'h' ? 'heading' : 'paragraph';
      const level = typeof raw.level === 'number' ? raw.level : parseInt(String(raw.level || '1'), 10);
      return { type, level: Number.isFinite(level) ? level : 1, text: raw.text != null ? String(raw.text) : '' };
    });
  }
  const body = options.body != null ? String(options.body) : '';
  if (!body.trim()) return [{ type: 'paragraph', text: '' }];
  return body
    .split(/\n\n+/)
    .map((chunk) => ({ type: 'paragraph', level: 1, text: chunk.replace(/\r\n/g, '\n').trim() }))
    .filter((b) => b.text.length > 0 || options.allow_empty);
}

/**
 * @param {import('docx')} docx
 * @param {{ type: string, level: number, text: string }[]} blocks
 */
function paragraphsFromBlocks(docx, blocks) {
  const { Paragraph, TextRun, HeadingLevel } = docx;
  const children = [];

  for (const b of blocks) {
    const raw = String(b.text ?? '').replace(/\r\n/g, '\n');
    if (b.type === 'heading') {
      const lvl = Math.min(6, Math.max(1, Number(b.level) || 1));
      const hlKey = `HEADING_${lvl}`;
      const hl = HeadingLevel[hlKey] || HeadingLevel.HEADING_1;
      children.push(
        new Paragraph({
          heading: hl,
          children: [new TextRun({ text: raw, font: 'Arial' })],
        }),
      );
    } else {
      const lines = raw.length ? raw.split('\n') : [''];
      for (const line of lines) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Arial', size: 24 })],
          }),
        );
      }
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '', font: 'Arial', size: 24 })] }));
  }
  return children;
}

async function buildStructuredDocxBuffer(options) {
  const docx = require('docx');
  const { Document, Packer } = docx;
  const blocks = normalizeContentBlocks({ ...options, allow_empty: true });
  const children = paragraphsFromBlocks(docx, blocks);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 24 },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 160, after: 160 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

async function markdownToHtml(md) {
  const { marked } = await import('marked');
  const src = String(md || '').trim();
  if (!src) return '<p></p>';
  const html = marked.parse(src);
  return typeof html === 'string' ? html : String(html);
}

async function buildDocxBufferFromOptions(options) {
  const htmlIn = options.html && String(options.html).trim();
  if (htmlIn) {
    const buffer = await docxConverter.htmlToDocxBuffer(htmlIn);
    if (!buffer) return null;
    return buffer;
  }
  if (options.markdown && String(options.markdown).trim()) {
    const html = await markdownToHtml(options.markdown);
    return docxConverter.htmlToDocxBuffer(html);
  }
  return buildStructuredDocxBuffer(options);
}

function scheduleReindex(resourceId) {
  try {
    semanticIndexScheduler.init(database);
    const resource = database.getQueries().getResourceById.get(resourceId);
    if (resource && semanticIndexScheduler.shouldIndex(resource)) {
      semanticIndexScheduler.scheduleSemanticReindex(resourceId);
    }
  } catch (e) {
    console.warn('[DocxTools] semantic reindex schedule failed:', e?.message);
  }
}

async function docxGet(resourceId, options = {}) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isDocxResource(resource)) {
      return { success: false, error: 'Resource is not a Word .docx document' };
    }
    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'DOCX file not found on disk' };
    }

    const format = String(options.format || 'text').toLowerCase();
    const maxChars = Math.min(Number(options.max_chars) || 100000, 500000);

    if (format === 'html') {
      if (!mammoth) {
        return { success: false, error: 'HTML extraction requires mammoth' };
      }
      const r = await mammoth.convertToHtml({ path: fullPath });
      return {
        success: true,
        resource_id: resourceId,
        title: resource.title,
        format: 'html',
        html: r.value,
        messages: r.messages,
      };
    }

    const text = await documentExtractor.extractDocxText(fullPath, maxChars);
    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      format: 'text',
      text: text || '',
    };
  } catch (error) {
    console.error('[DocxTools] docxGet error:', error);
    return { success: false, error: error.message };
  }
}

async function docxGetFilePath(resourceId) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isDocxResource(resource)) {
      return { success: false, error: 'Resource is not a Word .docx document' };
    }
    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'DOCX file not found on disk' };
    }
    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      file_path: fullPath,
    };
  } catch (error) {
    console.error('[DocxTools] docxGetFilePath error:', error);
    return { success: false, error: error.message };
  }
}

async function docxCreate(projectId, title, options = {}) {
  try {
    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const buffer = await buildDocxBufferFromOptions(options || {});
    if (!buffer || !buffer.length) {
      return { success: false, error: 'Failed to generate DOCX (empty buffer)' };
    }

    const safeTitle = (title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').substring(0, 120);
    const filename = `${safeTitle.replace(/\.docx$/i, '')}.docx`;

    // Stage → validate → promote (no orphans on failure)
    const staged = documentStaging.stageBuffer(buffer, filename);
    const validation = await documentStaging.validateStaging(staged.stagingId, 'document');
    if (!validation.ok) {
      documentStaging.discardStaging(staged.stagingId);
      return { success: false, error: `Generated DOCX failed validation: ${validation.error}` };
    }
    const importResult = documentStaging.promoteToLibrary(staged.stagingId, 'document');

    const resourceId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    const fullPath = fileStorage.getFullPath(importResult.internalPath);
    let contentText = '';
    try {
      contentText = (await documentExtractor.extractDocxText(fullPath, 50000)) || '';
    } catch {
      contentText = '';
    }

    try {
      queries.createResourceWithFile.run(
        resourceId,
        projectId,
        'document',
        safeTitle.replace(/\.docx$/i, '') || 'Untitled',
        contentText,
        null,
        importResult.internalPath,
        importResult.mimeType,
        importResult.size,
        importResult.hash,
        null,
        filename,
        null,
        now,
        now,
      );
    } catch (dbErr) {
      fileStorage.deleteFile(importResult.internalPath);
      throw dbErr;
    }

    if (options.folder_id) {
      const folder = queries.getResourceById.get(options.folder_id);
      if (folder && folder.type === 'folder') {
        try {
          queries.moveResourceToFolder.run(options.folder_id, now, resourceId);
        } catch (moveErr) {
          console.warn('[DocxTools] moveResourceToFolder failed:', moveErr?.message);
        }
      }
    }

    const resource = queries.getResourceById.get(resourceId);
    broadcastResourceCreated(resource);
    scheduleReindex(resourceId);

    return {
      success: true,
      resource: {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        project_id: resource.project_id,
      },
    };
  } catch (error) {
    console.error('[DocxTools] docxCreate error:', error);
    return { success: false, error: error.message };
  }
}

async function docxUpdate(resourceId, options = {}) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isDocxResource(resource)) {
      return { success: false, error: 'Resource is not a Word .docx document' };
    }
    if (!resource.internal_path) {
      return { success: false, error: 'Resource has no file on disk' };
    }

    const wantsFileRewrite = !!(
      (options.markdown && String(options.markdown).trim())
      || (options.html && String(options.html).trim())
      || options.body != null
      || (Array.isArray(options.blocks) && options.blocks.length > 0)
    );

    const newTitle =
      options.title != null && String(options.title).trim()
        ? String(options.title).trim().replace(/\.docx$/i, '')
        : resource.title;

    const now = Date.now();

    if (!wantsFileRewrite) {
      if (options.title == null || !String(options.title).trim()) {
        return { success: false, error: 'Provide markdown, html, body, blocks, or title to update' };
      }
      queries.updateResource.run(newTitle, resource.content, resource.metadata, now, resourceId);
      broadcastResourceUpdated(resourceId, { title: newTitle, updated_at: now });
      scheduleReindex(resourceId);
      return { success: true, resource_id: resourceId, title: newTitle, updated: 'metadata' };
    }

    const buffer = await buildDocxBufferFromOptions(options);
    if (!buffer || !buffer.length) {
      return { success: false, error: 'Failed to build DOCX buffer' };
    }

    fileStorage.overwriteFile(resource.internal_path, buffer);
    const fullPath = fileStorage.getFullPath(resource.internal_path);
    let contentText = resource.content;
    try {
      contentText = (await documentExtractor.extractDocxText(fullPath, 50000)) || resource.content;
    } catch {
      /* keep */
    }

    queries.updateResource.run(newTitle, contentText, resource.metadata, now, resourceId);
    broadcastResourceUpdated(resourceId, {
      title: newTitle,
      content: contentText,
      updated_at: now,
    });
    scheduleReindex(resourceId);

    return { success: true, resource_id: resourceId, title: newTitle };
  } catch (error) {
    console.error('[DocxTools] docxUpdate error:', error);
    return { success: false, error: error.message };
  }
}

async function docxDelete(resourceId, options = {}) {
  try {
    if (!options.confirm) {
      return {
        success: false,
        status: 'needs_confirmation',
        error: 'Set confirm=true after the user agrees to delete the Word document.',
      };
    }

    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isDocxResource(resource)) {
      return { success: false, error: 'Resource is not a Word .docx document' };
    }

    if (resource.internal_path) {
      try {
        fileStorage.deleteFile(resource.internal_path);
      } catch (e) {
        console.warn('[DocxTools] file delete:', e?.message);
      }
    }

    queries.deleteResource.run(resourceId);
    broadcastResourceDeleted(resourceId);

    return {
      success: true,
      deleted: { id: resourceId, title: resource.title, type: resource.type },
    };
  } catch (error) {
    console.error('[DocxTools] docxDelete error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  setWindowManager,
  docxGet,
  docxGetFilePath,
  docxCreate,
  docxUpdate,
  docxDelete,
};
