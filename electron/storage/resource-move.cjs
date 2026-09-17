/**
 * Shared move-to-folder guards used by db:resources:moveToFolder.
 * Renderer mirrors the same rules for immediate drop feedback.
 */

function validateMoveToFolder({ resource, folder, folderId, subtreeIds = [] }) {
  if (!resource) {
    return { ok: false, error: 'Resource not found' };
  }

  if (!folderId) {
    return { ok: true };
  }

  if (!folder) {
    return { ok: false, error: 'Folder not found' };
  }
  if (folder.type !== 'folder') {
    return { ok: false, error: 'Target is not a folder' };
  }
  if (resource.id === folderId) {
    return { ok: false, error: 'Cannot move folder into itself' };
  }
  if (resource.project_id && folder.project_id && resource.project_id !== folder.project_id) {
    return { ok: false, error: 'Cannot move to a folder in another project' };
  }
  if (resource.type === 'folder' && Array.isArray(subtreeIds) && subtreeIds.includes(folderId)) {
    return { ok: false, error: 'Cannot move folder into its descendant' };
  }

  return { ok: true };
}

module.exports = { validateMoveToFolder };
