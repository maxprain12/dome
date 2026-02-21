/* eslint-disable no-console */
/**
 * PPT Tools Handler - Main Process
 *
 * Provides functions to create, read, and export PowerPoint (PPTX) resources.
 * Uses document-generator (Python + python-pptx) for creation and extraction.
 */

const fs = require('fs');

const database = require('./database.cjs');
const fileStorage = require('./file-storage.cjs');
const documentGenerator = require('./document-generator.cjs');

let windowManagerRef = null;
function setWindowManager(wm) {
  windowManagerRef = wm;
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
  if (!resource?.internal_path) return null;
  const fullPath = fileStorage.getFullPath(resource.internal_path);
  return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * Create a new PPT resource from a JSON spec or PptxGenJS script.
 * @param {string} projectId - Project ID
 * @param {string} title - Resource title
 * @param {Object} spec - { title, slides: [...] } (used when script is not provided)
 * @param {Object} [options] - { folder_id?, script? } - script: PptxGenJS JavaScript code
 * @returns {Promise<Object>}
 */
async function pptCreate(projectId, title, spec = {}, options = {}) {
  try {
    let result;
    if (options.script && typeof options.script === 'string') {
      result = await documentGenerator.generatePptFromScript(options.script);
    } else {
      result = await documentGenerator.generatePpt(spec);
    }
    if (!result.success || !result.buffer) {
      return { success: false, error: result.error || 'Failed to generate PPT' };
    }

    const filename = (title || 'Untitled').replace(/\.pptx$/i, '') + '.pptx';
    const importResult = await fileStorage.importFromBuffer(
      result.buffer,
      filename,
      'document'
    );

    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const contentText = ((options.script ? '' : spec.title) || title || '').substring(0, 500);

    const queries = database.getQueries();
    queries.createResourceWithFile.run(
      resourceId,
      projectId,
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

    if (options.folder_id) {
      const folder = queries.getResourceById.get(options.folder_id);
      const isValidFolder = folder && folder.type === 'folder';
      if (isValidFolder) {
        try {
          queries.moveResourceToFolder.run(options.folder_id, now, resourceId);
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

    const buffer = fs.readFileSync(fullPath);

    if (options.destination_path) {
      fs.writeFileSync(options.destination_path, buffer);
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
};
