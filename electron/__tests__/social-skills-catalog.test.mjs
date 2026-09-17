import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getElectronRoot } = require('../paths.cjs');

const here = path.dirname(fileURLToPath(import.meta.url));

describe('bundled social skills', () => {
  it('ships insights and operations playbooks with valid frontmatter', () => {
    const root = path.join(getElectronRoot(), 'skills', 'bundled');
    for (const id of ['dome-social-insights', 'dome-social-operations']) {
      const file = path.join(root, id, 'SKILL.md');
      assert.equal(fs.existsSync(file), true, file);
      const text = fs.readFileSync(file, 'utf8');
      assert.match(text, new RegExp(`^---\\nname: ${id}\\n`));
      assert.match(text, /\nwhen_to_use:/);
      assert.doesNotMatch(text, /dome-social-growth/);
    }
    assert.equal(fs.existsSync(path.join(root, 'dome-social-growth', 'SKILL.md')), false);
    const catalog = JSON.parse(fs.readFileSync(path.join(here, '../../public/skills.json'), 'utf8'));
    assert.deepEqual(
      catalog.map((item) => item.id).sort((a, b) => a.localeCompare(b)),
      ['dome-social-insights', 'dome-social-operations'],
    );
  });
});
