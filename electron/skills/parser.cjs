/* eslint-disable no-console */
/**
 * Parse SKILL.md with YAML frontmatter (Agent Skills / Claude Code format).
 */
const matter = require('gray-matter');

const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Normalize frontmatter keys from various casings
 * @param {Record<string, unknown>} data
 */
function normalizeFrontmatter(data) {
  const d = data && typeof data === 'object' ? { ...data } : {};
  const pick = (a, b) => (a !== undefined ? a : b);
  return {
    name: pick(d.name, d.Name),
    description: pick(d.description, d.Description),
    when_to_use: pick(d.when_to_use, d.whenToUse),
    'argument-hint': pick(d['argument-hint'], d.argument_hint, d.argumentHint),
    arguments: pick(d.arguments, d.Arguments),
    'disable-model-invocation': pick(d['disable-model-invocation'], d.disableModelInvocation),
    'user-invocable': pick(d['user-invocable'], d.userInvocable),
    'allowed-tools': pick(d['allowed-tools'], d.allowedTools),
    model: d.model,
    effort: d.effort,
    context: d.context,
    agent: d.agent,
    hooks: d.hooks,
    paths: d.paths,
    shell: d.shell,
  };
}

/**
 * @param {string} dirName - folder name (skill id for non-plugin)
 * @param {string} raw - file content
 * @param {{ scope: string, pluginId?: string }} meta
 */
function parseSkillMarkdown(dirName, raw, meta) {
  const parsed = matter(String(raw || ''));
  const fm = normalizeFrontmatter(parsed.data);
  const slashName =
    typeof fm.name === 'string' && fm.name.trim()
      ? fm.name.trim().toLowerCase()
      : dirName.toLowerCase();
  if (slashName && !NAME_RE.test(slashName)) {
    console.warn(`[Skills] Invalid frontmatter name "${slashName}" in ${meta.scope}, using dir ${dirName}`);
  }
  const id =
    meta.pluginId != null
      ? `${meta.pluginId}:${dirName}`
      : dirName;

  const description = typeof fm.description === 'string' ? fm.description : '';
  const whenToUse = typeof fm.when_to_use === 'string' ? fm.when_to_use : '';
  const argumentHint = typeof fm['argument-hint'] === 'string' ? fm['argument-hint'] : '';
  let argsList = [];
  if (Array.isArray(fm.arguments)) {
    argsList = fm.arguments.map((x) => String(x));
  } else if (typeof fm.arguments === 'string' && fm.arguments.trim()) {
    argsList = fm.arguments.trim().split(/\s+/);
  }
  const disableModelInvocation = fm['disable-model-invocation'] === true;
  const userInvocable = fm['user-invocable'] !== false;
  let allowedTools = [];
  if (Array.isArray(fm['allowed-tools'])) {
    allowedTools = fm['allowed-tools'].map((x) => String(x));
  } else if (typeof fm['allowed-tools'] === 'string' && fm['allowed-tools'].trim()) {
    allowedTools = fm['allowed-tools'].trim().split(/\s+/);
  }
  let pathGlobs = [];
  if (Array.isArray(fm.paths)) {
    pathGlobs = fm.paths.map((x) => String(x));
  } else if (typeof fm.paths === 'string' && fm.paths.trim()) {
    pathGlobs = [fm.paths.trim()];
  }
  return {
    id,
    dirName,
    scope: meta.scope,
    pluginId: meta.pluginId,
    slashName: NAME_RE.test(slashName) ? slashName : dirName,
    name: typeof fm.name === 'string' && fm.name.trim() ? fm.name.trim() : dirName,
    description,
    when_to_use: whenToUse,
    argument_hint: argumentHint,
    arguments: argsList,
    disable_model_invocation: disableModelInvocation,
    user_invocable: userInvocable,
    allowed_tools: allowedTools,
    model: typeof fm.model === 'string' ? fm.model : null,
    effort: typeof fm.effort === 'string' ? fm.effort : null,
    context: typeof fm.context === 'string' ? fm.context : null,
    agent: typeof fm.agent === 'string' ? fm.agent : null,
    hooks: fm.hooks,
    paths: pathGlobs,
    shell: fm.shell === 'powershell' ? 'powershell' : 'bash',
    body: String(parsed.content || '').trimStart(),
  };
}

/**
 * @param {string} filePath - absolute path to SKILL.md
 * @param {{ scope: string, dirName: string, pluginId?: string }} meta
 */
function parseSkillFile(filePath, raw, meta) {
  return parseSkillMarkdown(meta.dirName, raw, meta);
}

module.exports = {
  parseSkillMarkdown,
  parseSkillFile,
  NAME_RE,
};
