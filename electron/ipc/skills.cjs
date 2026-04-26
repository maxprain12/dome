/* eslint-disable no-console */
/**
 * IPC: native file-based skills (SKILL.md) — list, get, render, save, project root, migration.
 */
const path = require('path');
const fs = require('fs');
const { shell } = require('electron');
const registry = require('../skills/registry.cjs');
const { renderSkillBody, splitArgs } = require('../skills/renderer.cjs');
const { migrateAiSkillsToFiles } = require('../skills/migrate.cjs');
const { getPersonalSkillsRoot, ensurePersonalSkillsRoot } = require('../skills/paths.cjs');
const skillWatcher = require('../skills/watcher.cjs');

function isPathInside(parent, child) {
  const a = path.resolve(parent);
  const b = path.resolve(child);
  return b === a || b.startsWith(a + path.sep);
}

function safeJoinUnderRoot(root, rel) {
  const resolved = path.resolve(root, rel);
  if (!isPathInside(root, resolved)) return null;
  return resolved;
}

function getDisableShellFromSettings(queries) {
  try {
    const row = queries.getSetting.get('disable_skill_shell_execution');
    return row?.value === '1' || row?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * @param {object} param0
 */
function register({ ipcMain, windowManager, database, validateSender, app }) {
  if (!app) {
    console.warn('[Skills] IPC: no app, skills disabled');
    return;
  }

  const queries = database.getQueries();
  const userData = app.getPath('userData');

  /** @type {string | null} */
  let projectRoot = null;
  try {
    const pr = queries.getSetting.get('skills_project_root');
    if (pr?.value && typeof pr.value === 'string' && pr.value.trim()) {
      projectRoot = path.resolve(pr.value.trim());
    }
  } catch {
    /* ignore */
  }

  registry.setContext(app, projectRoot);
  migrateAiSkillsToFiles(database.getDB(), queries, userData);
  const count = registry.reload();
  console.log(`[Skills] Registry loaded: ${count} skill(s), projectRoot=${projectRoot || '(none)'}`);

  const broadcastUpdate = () => {
    try {
      windowManager.broadcast('skills:updated', { ts: Date.now() });
    } catch (e) {
      console.warn('[Skills] broadcast:', e?.message);
    }
  };

  const reloadAll = () => {
    try {
      const pr = queries.getSetting.get('skills_project_root');
      projectRoot = pr?.value && String(pr.value).trim() ? path.resolve(String(pr.value).trim()) : null;
    } catch {
      /* keep */
    }
    registry.setContext(app, projectRoot);
    const n = registry.reload();
    broadcastUpdate();
    return n;
  };

  skillWatcher.start(
    () => {
      try {
        reloadAll();
      } catch (e) {
        console.warn('[Skills] Watcher reload:', e?.message);
      }
    },
    () => registry.collectWatchRoots(),
  );

  ipcMain.handle('skills:list', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const includeBody = payload && typeof payload === 'object' && payload.includeBody === true;
      const CATALOG_BUDGET = 1536;
      const rows = registry.list().map((rec) => {
        const desc = rec.description || '';
        const w = rec.when_to_use || '';
        const combined = `${desc} ${w}`.trim();
        const descCatalog =
          combined.length > CATALOG_BUDGET
            ? `${combined.slice(0, CATALOG_BUDGET - 1)}…`
            : combined;
        const row = {
          id: rec.id,
          name: rec.name,
          slug: rec.slashName,
          description: descCatalog,
          when_to_use: w,
          scope: rec.scope,
          argument_hint: rec.argument_hint,
          arguments: rec.arguments,
          user_invocable: rec.user_invocable,
          disable_model_invocation: rec.disable_model_invocation,
          paths: rec.paths,
          allowed_tools: rec.allowed_tools,
          model: rec.model,
          effort: rec.effort,
          context: rec.context,
          agent: rec.agent,
        };
        if (includeBody) {
          row.body = rec.body;
          row.filePath = rec.filePath;
          row.dirPath = rec.dirPath;
        }
        return row;
      });
      return { success: true, data: rows };
    } catch (error) {
      console.error('[Skills] list:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:get', (event, id) => {
    try {
      validateSender(event, windowManager);
      const rec = registry.getById(id) || registry.resolve(id);
      if (!rec) return { success: false, error: 'Skill not found' };
      let raw = rec.body;
      try {
        if (rec.filePath && fs.existsSync(rec.filePath)) {
          raw = fs.readFileSync(rec.filePath, 'utf8');
        }
      } catch {
        /* keep body */
      }
      return {
        success: true,
        data: {
          id: rec.id,
          name: rec.name,
          filePath: rec.filePath,
          dirPath: rec.dirPath,
          raw,
          frontmatter: {
            name: rec.name,
            description: rec.description,
            when_to_use: rec.when_to_use,
            argument_hint: rec.argument_hint,
            arguments: rec.arguments,
            disable_model_invocation: rec.disable_model_invocation,
            user_invocable: rec.user_invocable,
            paths: rec.paths,
            allowed_tools: rec.allowed_tools,
            model: rec.model,
            effort: rec.effort,
            context: rec.context,
            agent: rec.agent,
            shell: rec.shell,
          },
          body: rec.body,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:render', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { skillId, arguments: argsLine, sessionId, disableSkillShellExecution } = payload || {};
      const rec = registry.getById(skillId) || registry.resolve(String(skillId || ''));
      if (!rec) return { success: false, error: 'Skill not found' };
      const fromSettings = getDisableShellFromSettings(queries);
      const body = renderSkillBody(rec.body, {
        argumentsLine: argsLine != null ? String(argsLine) : '',
        namedArgs: rec.arguments,
        sessionId: sessionId != null ? String(sessionId) : '',
        skillDir: rec.dirPath,
        shell: rec.shell,
        disableSkillShellExecution: disableSkillShellExecution === true || fromSettings,
      });
      return {
        success: true,
        data: {
          body,
          id: rec.id,
          name: rec.name,
          context: rec.context,
          agent: rec.agent,
          model: rec.model,
          effort: rec.effort,
          allowed_tools: rec.allowed_tools,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:invoke', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { id, arguments: argsLine, sessionId } = payload || {};
      const rec = registry.getById(id) || registry.resolve(String(id || ''));
      if (!rec) return { success: false, error: 'Skill not found' };
      if (rec.user_invocable === false) {
        return { success: false, error: 'Skill is not user-invocable' };
      }
      const fromSettings = getDisableShellFromSettings(queries);
      const body = renderSkillBody(rec.body, {
        argumentsLine: argsLine != null ? String(argsLine) : '',
        namedArgs: rec.arguments,
        sessionId: sessionId != null ? String(sessionId) : '',
        skillDir: rec.dirPath,
        shell: rec.shell,
        disableSkillShellExecution: fromSettings,
      });
      const systemPromptBlock = `### ${rec.name || 'Skill'}\n${body}\n`;
      return {
        success: true,
        data: {
          systemPromptBlock,
          id: rec.id,
          name: rec.name,
          body,
          context: rec.context,
          agent: rec.agent,
          model: rec.model,
          effort: rec.effort,
          allowed_tools: rec.allowed_tools,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:reload', (event) => {
    try {
      validateSender(event, windowManager);
      const n = reloadAll();
      return { success: true, data: { count: n } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:openFolder', (event, skillId) => {
    try {
      validateSender(event, windowManager);
      const rec = registry.getById(skillId) || registry.resolve(String(skillId || ''));
      const p = rec?.dirPath || getPersonalSkillsRoot();
      void shell.openPath(p);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:openPersonalRoot', (event) => {
    try {
      validateSender(event, windowManager);
      const p = ensurePersonalSkillsRoot();
      void shell.openPath(p);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:setProjectRoot', (event, rootPath) => {
    try {
      validateSender(event, windowManager);
      const v = rootPath == null || rootPath === '' ? '' : String(rootPath).trim();
      if (v) {
        const abs = path.resolve(v);
        if (!fs.existsSync(abs)) {
          return { success: false, error: 'Path does not exist' };
        }
        queries.setSetting.run('skills_project_root', abs, Date.now());
        projectRoot = abs;
      } else {
        queries.setSetting.run('skills_project_root', '', Date.now());
        projectRoot = null;
      }
      registry.setContext(app, projectRoot);
      reloadAll();
      skillWatcher.stop();
      skillWatcher.start(
        () => {
          try {
            reloadAll();
          } catch (e) {
            console.warn('[Skills] Watcher reload:', e?.message);
          }
        },
        () => registry.collectWatchRoots(),
      );
      return { success: true, data: { projectRoot } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:getProjectRoot', (event) => {
    try {
      validateSender(event, windowManager);
      const pr = queries.getSetting.get('skills_project_root');
      const v = pr?.value && String(pr.value).trim() ? String(pr.value).trim() : null;
      return { success: true, data: { projectRoot: v } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:save', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { filePath, content } = payload || {};
      if (typeof filePath !== 'string' || typeof content !== 'string') {
        return { success: false, error: 'Invalid payload' };
      }
      const abs = path.resolve(filePath);
      const personal = getPersonalSkillsRoot();
      const proj = projectRoot ? path.join(projectRoot, '.dome', 'skills') : null;
      if (!isPathInside(personal, abs) && (proj == null || !isPathInside(proj, abs))) {
        return { success: false, error: 'Path not under allowed skill roots' };
      }
      fs.writeFileSync(abs, content, 'utf8');
      reloadAll();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('skills:create', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { slug } = payload || {};
      const s = String(slug || 'new-skill')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'new-skill';
    const personal = ensurePersonalSkillsRoot();
    const dir = path.join(personal, s);
    if (fs.existsSync(dir)) {
      return { success: false, error: 'Skill folder already exists' };
    }
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'SKILL.md');
    const template = `---
name: ${s}
description: "Describe when to use this skill (shown in the catalog)."
when_to_use: "Trigger phrases the model should look for"
disable-model-invocation: false
---

# ${s}

Add instructions for the model here. Use \`$ARGUMENTS\` for slash args, \`$0\` for the first arg.
`;
    fs.writeFileSync(filePath, template, 'utf8');
    reloadAll();
    return { success: true, data: { id: s, filePath, dirPath: dir } };
  } catch (error) {
    return { success: false, error: error.message };
  }
  });

  ipcMain.handle('skills:readFile', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { skillId, relativePath } = payload || {};
      const rec = registry.getById(skillId) || registry.resolve(String(skillId || ''));
      if (!rec?.dirPath) return { success: false, error: 'Skill not found' };
      const rel = String(relativePath || '').replace(/^\/+/, '').replace(/\.\./g, '');
      const full = path.resolve(rec.dirPath, rel);
      if (!isPathInside(rec.dirPath, full) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
        return { success: false, error: 'Invalid path' };
      }
      const text = fs.readFileSync(full, 'utf8');
      return { success: true, data: { content: text, path: full } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /** Import legacy JSON list [{ id, name, description, prompt, enabled }]: writes to ~/.dome/skills/ */
  ipcMain.handle('skills:importLegacy', (event, items) => {
    try {
      validateSender(event, windowManager);
      const list = Array.isArray(items) ? items : [];
      const personal = ensurePersonalSkillsRoot();
      let n = 0;
      for (const item of list) {
        if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
        const id = item.id.trim();
        const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
        const description = typeof item.description === 'string' ? item.description : '';
        const prompt = typeof item.prompt === 'string' ? item.prompt : '';
        const disable = item.enabled === false;
        const dir = path.join(personal, id);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const descYaml = description.includes('\n')
          ? `description: |\n${description
              .split('\n')
              .map((l) => `  ${l}`)
              .join('\n')}\n`
          : `description: ${JSON.stringify(description)}\n`;
        const md = `---
name: ${id}
${descYaml}disable-model-invocation: ${disable}
---

${prompt}
`;
        fs.writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf8');
        n += 1;
      }
      reloadAll();
      return { success: true, data: { count: n } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /** Install a marketplace-style skill: writes instructions into ~/.dome/skills/<id>/ */
  ipcMain.handle('skills:installFromManifest', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const { id, name, description, instructions } = payload || {};
      const skillId = String(id || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      if (!skillId) return { success: false, error: 'Invalid id' };
      const personal = ensurePersonalSkillsRoot();
      const dir = path.join(personal, skillId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'SKILL.md');
    const desc = typeof description === 'string' ? description : '';
    const inst = typeof instructions === 'string' ? instructions : '';
    const nm = typeof name === 'string' && name.trim() ? name.trim() : skillId;
    const body = `---
name: ${skillId}
description: ${JSON.stringify(desc || nm)}
---

${inst}
`;
    fs.writeFileSync(filePath, body, 'utf8');
    reloadAll();
    return { success: true, data: { id: skillId, filePath, dirPath: dir } };
  } catch (error) {
    return { success: false, error: error.message };
  }
  });
}

module.exports = { register };
