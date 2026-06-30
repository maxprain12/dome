/* eslint-disable no-console */
/**
 * PPT Tools Handler - Main Process
 *
 * PPTX creation: PptxGenJS (JSON spec in main process; agent scripts via Node runner).
 * Slide text extraction: Python extract_ppt.py (venv).
 */

const fs = require('fs');

const database = require('../core/database.cjs');
const fileStorage = require('../storage/file-storage.cjs');
const documentStaging = require('../documents/document-staging.cjs');
const documentGenerator = require('../documents/document-generator.cjs');
const { normalizePptxBuffer } = require('../documents/pptx-normalize.cjs');

let windowManagerRef = null;
function setWindowManager(wm) {
  windowManagerRef = wm;
}

function resolveProjectId(projectId) {
  if (projectId) return projectId;
  try {
    const queries = database.getQueries();
    const lastSetting = queries.getSetting.get('last_project_id');
    if (lastSetting?.value) {
      const proj = queries.getProjectById.get(lastSetting.value);
      if (proj) return proj.id;
    }
    const first = database.getDB().prepare('SELECT id FROM projects LIMIT 1').get();
    if (first) return first.id;
  } catch (_) {}
  return null;
}

function broadcastResourceCreated(resource) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:created', resource);
  }
}

function isPptResource(resource) {
  if (!resource) return false;
  const mime = resource.file_mime_type || '';
  const filename = (resource.original_filename || resource.title || '').toLowerCase();
  return (
    resource.type === 'ppt' ||
    resource.type === 'document' ||
    mime.includes('presentationml') ||
    mime.includes('ms-powerpoint') ||
    filename.endsWith('.pptx') ||
    filename.endsWith('.ppt')
  );
}

function getFullPathForResource(resource) {
  const vaultStore = require('../storage/vault-store.cjs');
  const resolved = vaultStore.getResourceFilePath(resource, database.getQueries(), fileStorage);
  return resolved && fs.existsSync(resolved) ? resolved : null;
}

function looksLikePythonPptScript(script) {
  if (!script || typeof script !== 'string') return false;
  const s = script;
  return (
    /from\s+pptx\s+import/i.test(s) ||
    /\bimport\s+pptx\b/i.test(s) ||
    /prs\.save\s*\(\s*os\.environ/i.test(s) ||
    /\bpython-pptx\b/i.test(s)
  );
}

/**
 * Create a new PPT resource from a JSON spec or PptxGenJS script.
 * @param {string} projectId - Project ID
 * @param {string} title - Resource title
 * @param {Object} spec - { title, slides: [...] } when script is not provided
 * @param {Object} [options] - { folder_id?, script? }
 * @returns {Promise<Object>}
 */
async function pptCreate(projectId, title, spec = {}, options = {}) {
  try {
    let result;
    if (options.script && typeof options.script === 'string') {
      if (looksLikePythonPptScript(options.script)) {
        return {
          success: false,
          error:
            'Python/python-pptx is not supported for ppt_create. Use a PptxGenJS script (require("pptxgenjs"), await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })) or pass spec (JSON) without script.',
        };
      }
      const SCRIPT_SIZE_LIMIT = 60_000; // ~60 KB; well above typical scripts, catches truly huge payloads
      if (options.script.length > SCRIPT_SIZE_LIMIT) {
        return {
          success: false,
          error:
            `PptxGenJS script is ${Math.round(options.script.length / 1024)} KB — exceeds the ${SCRIPT_SIZE_LIMIT / 1024} KB limit. ` +
            'Shorten the script: use a helper function for repeated elements (accent bars, slide templates), reduce the number of slides, or inline less content per slide. ' +
            'Typical working scripts are 4–10 KB.',
        };
      }
      result = await documentGenerator.generatePptFromNodeScript(options.script);
      // Enrich syntax-error messages so the model knows the script was malformed, not a runtime issue
      if (!result.success && result.error) {
        const isSyntaxError =
          /unexpected end of input|unexpected token|syntaxerror|is not defined|cannot find module/i.test(result.error);
        if (isSyntaxError) {
          result = {
            success: false,
            error:
              `Script syntax error: ${result.error}. ` +
              'Check that all braces/brackets are balanced, the script ends with `await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })`, ' +
              'and there are no truncated lines. Keep scripts under 10 KB to avoid truncation.',
          };
        }
      }
    } else {
      // Parse spec if model accidentally serialized it as a string
      if (typeof spec === 'string') {
        try { spec = JSON.parse(spec); } catch (_) { spec = {}; }
      }
      const hasSpec = spec && Array.isArray(spec.slides) && spec.slides.length > 0;
      if (!hasSpec) {
        const diagSpec = typeof spec === 'object' ? JSON.stringify(spec).slice(0, 200) : String(spec).slice(0, 100);
        const issue = !spec
          ? 'spec is null/undefined'
          : !spec.slides
          ? `spec.slides is missing (received keys: ${Object.keys(spec || {}).join(', ') || 'none'})`
          : !Array.isArray(spec.slides)
          ? `spec.slides is not an array (got ${typeof spec.slides})`
          : 'spec.slides is empty (0 slides)';
        return {
          success: false,
          error:
            `ppt_create: ${issue}. ` +
            'Pass `spec` as a JSON object with a non-empty `slides` array, OR pass a PptxGenJS `script` string. ' +
            `Received spec: ${diagSpec}. ` +
            'Load skill `ppt-creator` for the full script template.',
        };
      }
      result = await documentGenerator.generatePptFromSpec(spec);
    }
    if (!result.success || !result.buffer) {
      return { success: false, error: result.error || 'Failed to generate PPT' };
    }

    try {
      result.buffer = await normalizePptxBuffer(result.buffer);
    } catch (normErr) {
      console.warn('[PptTools] normalizePptxBuffer failed (non-fatal):', normErr?.message);
    }

    const { validatePptxBuffer } = require('../documents/pptx-validate.cjs');
    const pptCheck = await validatePptxBuffer(result.buffer, { minSlides: 1 });
    if (!pptCheck.ok) {
      return {
        success: false,
        error:
          `${pptCheck.error} ` +
          'Ensure the script calls pres.addSlide() for every slide and ends with ' +
          '`await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH })` (or `await pres.write({ outputType: "nodebuffer" })`).',
      };
    }

    const filename = (title || 'Untitled').replace(/\.pptx$/i, '') + '.pptx';

    // Stage → validate → promote (no orphans on failure)
    const staged = documentStaging.stageBuffer(result.buffer, filename);
    const validation = await documentStaging.validateStaging(staged.stagingId, 'ppt');
    if (!validation.ok) {
      documentStaging.discardStaging(staged.stagingId);
      return { success: false, error: `Generated PPTX failed validation: ${validation.error}` };
    }
    const importResult = documentStaging.promoteToLibrary(staged.stagingId, 'ppt');

    const resolvedProjectId = resolveProjectId(projectId);
    if (!resolvedProjectId) {
      fileStorage.deleteFile(importResult.internalPath);
      return { success: false, error: 'No active project found. Please open a project before creating a presentation.' };
    }

    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const contentText = ((options.script ? '' : spec.title) || title || '').substring(0, 500);

    const queries = database.getQueries();
    try {
      queries.createResourceWithFile.run(
        resourceId,
        resolvedProjectId,
        'ppt',
        (title || 'Untitled').replace(/\.pptx$/i, '') || 'Untitled',
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
        now
      );
    } catch (dbErr) {
      fileStorage.deleteFile(importResult.internalPath);
      throw dbErr;
    }

    if (options.folder_id) {
      const folder = queries.getResourceById.get(options.folder_id);
      const isValidFolder = folder && folder.type === 'folder';
      if (isValidFolder) {
        try {
          queries.moveResourceToFolder.run(options.folder_id, now, resourceId);
          const { syncVaultAfterMoveToFolder } = require('../storage/vault-sync.cjs');
          syncVaultAfterMoveToFolder(resourceId, { database, fileStorage });
        } catch (moveErr) {
          console.warn('[PptTools] moveResourceToFolder failed (resource created with internal_path):', moveErr?.message);
        }
      } else {
        console.warn('[PptTools] folder_id invalid or not a folder, skipping move:', options.folder_id);
      }
    }

    const resource = queries.getResourceById.get(resourceId);
    broadcastResourceCreated(resource);

    return {
      success: true,
      resource: {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        project_id: resource.project_id,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
      },
    };
  } catch (error) {
    console.error('[PptTools] pptCreate error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get the absolute file path for a PPT resource.
 */
async function pptGetFilePath(resourceId) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isPptResource(resource)) {
      return { success: false, error: 'Resource is not a PowerPoint file (pptx/ppt)' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'PPT file not found on disk' };
    }

    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      file_path: fullPath,
    };
  } catch (error) {
    console.error('[PptTools] pptGetFilePath error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Render slide PNGs for visual QA (uses hidden BrowserWindow + pptx-preview).
 */
async function pptGetSlideImages(resourceId) {
  try {
    const pathResult = await pptGetFilePath(resourceId);
    if (!pathResult.success || !pathResult.file_path) {
      return { success: false, error: pathResult.error || 'Failed to get file path' };
    }
    return documentGenerator.extractPptImages(pathResult.file_path);
  } catch (error) {
    console.error('[PptTools] pptGetSlideImages error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Export PPT to base64 or destination path.
 */
async function pptExport(resourceId, options = {}) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isPptResource(resource)) {
      return { success: false, error: 'Resource is not a PowerPoint file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'PPT file not found on disk' };
    }

    const buffer = await fs.promises.readFile(fullPath);

    if (options.destination_path) {
      await fs.promises.writeFile(options.destination_path, buffer);
      return {
        success: true,
        resource_id: resourceId,
        format: 'pptx',
        destination: options.destination_path,
      };
    }

    return {
      success: true,
      resource_id: resourceId,
      format: 'pptx',
      data: buffer.toString('base64'),
    };
  } catch (error) {
    console.error('[PptTools] pptExport error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get slide content (text) from a PPT resource.
 */
async function pptGetSlides(resourceId) {
  try {
    const pathResult = await pptGetFilePath(resourceId);
    if (!pathResult.success || !pathResult.file_path) {
      return { success: false, error: pathResult.error || 'Failed to get file path' };
    }

    const result = await documentGenerator.extractPptSlides(pathResult.file_path);
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to extract slides' };
    }

    return {
      success: true,
      resource_id: resourceId,
      title: pathResult.title,
      slides: result.slides || [],
    };
  } catch (error) {
    console.error('[PptTools] pptGetSlides error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  setWindowManager,
  pptCreate,
  pptGetFilePath,
  pptExport,
  pptGetSlides,
  pptGetSlideImages,
};
