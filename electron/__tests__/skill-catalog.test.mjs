import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadSkillCatalog, readRegisteredSkillFile } = require('../skills/index.cjs');
test('project precedence, stable nested ids, explicit-only skills and confined references', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-skills-'));
  const previous = process.env.DOME_SKILLS_DIR;
  const global = path.join(temp, 'global');
  const project = path.join(temp, 'project');
  process.env.DOME_SKILLS_DIR = global;
  function write(root, dir, name, body = 'complete body', explicit = false) {
    const folder = path.join(root, dir); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: useful skill\ndisable-model-invocation: ${explicit}\n---\n${body}`);
    return folder;
  }
  try {
    write(global, 'same', 'same', 'global');
    const nested = write(path.join(project, '.dome/skills'), 'group/different-folder', 'same', 'x'.repeat(9000), true);
    fs.writeFileSync(path.join(nested, 'reference.md'), 'auxiliary');
    fs.writeFileSync(path.join(temp, 'outside.md'), 'secret');
    fs.symlinkSync(path.join(temp, 'outside.md'), path.join(nested, 'escape.md'));
    fs.symlinkSync(project, path.join(project, '.dome/skills', 'cycle'));
    fs.symlinkSync(temp, path.join(global, 'outside'));
    const { skills, diagnostics } = await loadSkillCatalog(project);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, 'project:group/different-folder/SKILL.md');
    assert.equal(skills[0].disableModelInvocation, true);
    assert.equal(skills[0].content.length, 9000);
    assert.ok(diagnostics.some((d) => d.message.includes('collision')));
    assert.equal(readRegisteredSkillFile(skills[0].id, 'reference.md', project), 'auxiliary');
    assert.throws(() => readRegisteredSkillFile(skills[0].id, 'escape.md', project), /escapes/);
    assert.throws(() => readRegisteredSkillFile(skills[0].id, '../../../../../outside.md', project));
    await require('../skills/install.cjs').removeSkill(skills[0].id, project);
    assert.equal(fs.existsSync(skills[0].canonicalPath), false);
    const refreshed = await loadSkillCatalog(project);
    assert.equal(refreshed.skills[0].source, 'global');
  } finally {
    if (previous === undefined) delete process.env.DOME_SKILLS_DIR; else process.env.DOME_SKILLS_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
