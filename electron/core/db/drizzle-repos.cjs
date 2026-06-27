/* eslint-disable no-console */
/**
 * Drizzle-backed repositories for pilot domains (settings, tags).
 * Falls back is not needed — @dome/db is a required workspace dependency.
 */
const { getDrizzle, invalidateDrizzle } = require('./drizzle-bridge.cjs');
const { settingsRepo, tagsRepo } = require('@dome/db');

function tagRowToSnake(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.createdAt,
  };
}

function tagWithCountToSnake(row) {
  return {
    ...tagRowToSnake(row),
    resource_count: row.resourceCount,
  };
}

function resourceRowToSnake(row) {
  if (!row) return row;
  return {
    id: row.id,
    project_id: row.projectId,
    type: row.type,
    title: row.title,
    content: row.content,
    file_path: row.filePath,
    internal_path: row.internalPath,
    file_mime_type: row.fileMimeType,
    file_size: row.fileSize,
    file_hash: row.fileHash,
    thumbnail_data: row.thumbnailData,
    original_filename: row.originalFilename,
    folder_id: row.folderId,
    metadata: row.metadata,
    vault_path: row.vaultPath,
    content_text: row.contentText,
    content_hash: row.contentHash,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 */
function createSettingsRepo(sqlite) {
  const db = getDrizzle(sqlite);
  return {
    get(key) {
      return settingsRepo.getSetting(db, key);
    },
    set(key, value, updatedAt = Date.now()) {
      settingsRepo.setSetting(db, key, value, updatedAt);
    },
    delete(key) {
      settingsRepo.deleteSetting(db, key);
    },
  };
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 */
function createTagsRepo(sqlite) {
  const db = getDrizzle(sqlite);
  return {
    getByResource(resourceId) {
      return tagsRepo.getTagsByResource(db, resourceId).map(tagRowToSnake);
    },
    getAllWithCount(projectId) {
      const rows =
        typeof projectId === 'string' && projectId
          ? tagsRepo.getAllTagsWithCountByProject(db, projectId)
          : tagsRepo.getAllTagsWithCount(db);
      return rows.map(tagWithCountToSnake);
    },
    getResourcesByTag(tagId, projectId) {
      const rows =
        typeof projectId === 'string' && projectId
          ? tagsRepo.getResourcesByTagInProject(db, tagId, projectId)
          : tagsRepo.getResourcesByTag(db, tagId);
      return rows.map(resourceRowToSnake);
    },
    findByNameInsensitive(name) {
      return tagRowToSnake(tagsRepo.findTagByNameInsensitive(db, name));
    },
    insert({ id, name, color, createdAt }) {
      tagsRepo.insertTag(db, { id, name, color, createdAt });
    },
    getById(id) {
      return tagRowToSnake(tagsRepo.getTagById(db, id));
    },
    attach(resourceId, tagId) {
      tagsRepo.attachTagToResource(db, resourceId, tagId);
    },
    detach(resourceId, tagId) {
      tagsRepo.detachTagFromResource(db, resourceId, tagId);
    },
  };
}

module.exports = {
  createSettingsRepo,
  createTagsRepo,
  invalidateDrizzleRepos: invalidateDrizzle,
};
