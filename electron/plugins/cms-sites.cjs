'use strict';

function parseConfig(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function applyContentPathOptions(template, github) {
  const paths = github?.contentPaths;
  if (!template?.fields || !paths || typeof paths !== 'object') return template;
  const collections = [];
  const languages = [];
  for (const key of Object.keys(paths)) {
    const [collection = '', language = ''] = String(key).split('/');
    if (collection && !collections.includes(collection)) collections.push(collection);
    if (language && !languages.includes(language)) languages.push(language);
  }
  collections.sort((left, right) => left.localeCompare(right));
  languages.sort((left, right) => left.localeCompare(right));
  if (!collections.length && !languages.length) return template;
  return {
    ...template,
    fields: template.fields.map((field) => {
      if (field.id === 'collection' && field.type === 'select' && collections.length) {
        return { ...field, options: collections };
      }
      if (field.id === 'language' && field.type === 'select' && languages.length) {
        return { ...field, options: languages };
      }
      return field;
    }),
  };
}

function cmsSitesFromGrant(grant) {
  if (!grant || grant.pluginId !== 'dome-cms') return null;
  if (Array.isArray(grant.sites) && grant.sites.length > 0) return grant.sites;
  if (!grant.projectId) return [];
  const repo = typeof grant.github?.repo === 'string' ? grant.github.repo.trim() : '';
  return [{
    id: 'legacy',
    name: repo || 'Site',
    projectId: grant.projectId,
    ...(grant.github ? { github: grant.github } : {}),
  }];
}

function pruneCmsGrantForVault(row, deletedProjectId) {
  const config = parseConfig(row?.config_json);
  if (!Array.isArray(config.sites)) return null;
  const remaining = config.sites.filter((site) => site && site.projectId !== deletedProjectId);
  const touched = remaining.length !== config.sites.length || row.project_id === deletedProjectId;
  if (!touched) return null;
  if (remaining.length === 0) return { action: 'delete' };
  const next = remaining[0];
  return {
    action: 'update',
    projectId: next.projectId,
    configJson: JSON.stringify({
      ...config,
      sites: remaining,
      ...(next.github ? { github: next.github } : {}),
    }),
  };
}

module.exports = {
  applyContentPathOptions,
  cmsSitesFromGrant,
  pruneCmsGrantForVault,
};
