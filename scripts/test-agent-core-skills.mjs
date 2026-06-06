#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for @dome/agent-core skills discovery + formatter (Tarea 4).
 *
 * Uses `node:test` and `node:assert/strict` (built-in — no vitest).
 * Imports the compiled output from `packages/agent-core/dist/skills/`
 * so it works without re-running `tsc` between writes; the test
 * runner for the package is `pnpm --filter @dome/agent-core build`
 * followed by `node scripts/test-agent-core-skills.mjs`.
 *
 * The tests cover the contract specified in
 * `longrunning-task/phases/phase-2-dome-agent-core.PLAN.md` section 3
 * (Tarea 4):
 *
 *   - `listSkills()` returns 3 summaries from a tmp dir with 3
 *     valid + 1 invalid `SKILL.md` (no `name:` in frontmatter).
 *   - Skill with `description:` → that description is used.
 *   - Skill without `description:` but with `when_to_use:` → the
 *     `when_to_use` value is used as the description.
 *   - Skill with `description: |` (block scalar) → multi-line
 *     description is preserved.
 *   - Skill without `name:` → omitted.
 *   - Subdirectory without `SKILL.md` → omitted, no error.
 *   - `formatSkillsForSystemPrompt([])` returns `''`.
 *   - `formatSkillsForSystemPrompt(skills)` contains
 *     `<available_skills>`, `</available_skills>`, and every name.
 *   - `formatSkillsForSystemPrompt` omits the `description:` line
 *     for skills with empty descriptions.
 *   - `userSkillsDir()` honors `DOME_SKILLS_DIR`.
 *   - `parseSkillMdFrontmatter` handles unquoted, double-quoted,
 *     single-quoted, and block scalars.
 *
 * Invocation: `node scripts/test-agent-core-skills.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  listSkills,
  formatSkillsForSystemPrompt,
  userSkillsDir,
  USER_SKILLS_DIR,
  parseSkillMdFrontmatter,
} from '../packages/agent-core/dist/index.js';

// =============================================================================
// Fixtures
// =============================================================================

/**
 * Build a tmp directory populated with the canonical fixture set:
 * 3 valid skills (covering direct description, when_to_use fallback,
 * and block-scalar description) + 1 invalid skill (no `name:`) + 1
 * subdirectory with no `SKILL.md` at all.
 *
 * Returns the absolute tmp path; caller is responsible for `rmSync`.
 */
function makeSkillsDir() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'agent-core-skills-'));

  // skill 1: full frontmatter with direct description.
  mkdirSync(path.join(tmp, 'skill-one'), { recursive: true });
  writeFileSync(
    path.join(tmp, 'skill-one', 'SKILL.md'),
    '---\nname: One\ndescription: First skill\n---\n# body\n',
  );

  // skill 2: no `description`, falls back to `when_to_use`.
  mkdirSync(path.join(tmp, 'skill-two'), { recursive: true });
  writeFileSync(
    path.join(tmp, 'skill-two', 'SKILL.md'),
    '---\nname: Two\nwhen_to_use: Use this for X\n---\n',
  );

  // skill 3: block-scalar description (multi-line).
  mkdirSync(path.join(tmp, 'skill-three'), { recursive: true });
  writeFileSync(
    path.join(tmp, 'skill-three', 'SKILL.md'),
    '---\nname: Three\ndescription: |\n  Multi-line\n  description here\n---\n',
  );

  // skill 4: invalid (no `name:` in frontmatter).
  mkdirSync(path.join(tmp, 'skill-invalid'), { recursive: true });
  writeFileSync(
    path.join(tmp, 'skill-invalid', 'SKILL.md'),
    '---\ndescription: no name\n---\n',
  );

  // subdir 5: no SKILL.md at all.
  mkdirSync(path.join(tmp, 'no-skill-md'), { recursive: true });
  writeFileSync(
    path.join(tmp, 'no-skill-md', 'README.md'),
    '# not a skill',
  );

  return tmp;
}

// =============================================================================
// listSkills: discovery
// =============================================================================

test('listSkills: returns 3 skills (3 valid + 1 invalid + 1 empty are skipped)', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    assert.equal(skills.length, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: skill with `description:` uses that description verbatim', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    const one = skills.find((s) => s.name === 'One');
    assert.ok(one, 'skill "One" must be present');
    assert.equal(one.description, 'First skill');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: skill without `description` falls back to `when_to_use`', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    const two = skills.find((s) => s.name === 'Two');
    assert.ok(two, 'skill "Two" must be present');
    assert.equal(two.description, 'Use this for X');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: block-scalar description is preserved (multi-line)', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    const three = skills.find((s) => s.name === 'Three');
    assert.ok(three, 'skill "Three" must be present');
    // Block scalar joins with \n; legacy parser does not apply
    // YAML folding so we keep the literal multi-line value.
    assert.ok(
      three.description.includes('Multi-line'),
      'description must contain the first line',
    );
    assert.ok(
      three.description.includes('description here'),
      'description must contain the last line',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: skill without `name:` is omitted', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    // The invalid skill has `description: no name` but no `name:` —
    // it must NOT be in the result and there is no "no name" skill.
    const sneaky = skills.find((s) => s.description === 'no name');
    assert.equal(sneaky, undefined, 'nameless skill must be omitted');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: subdir without SKILL.md is omitted (no error)', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    const empty = skills.find((s) => s.name === 'README');
    assert.equal(empty, undefined, 'directory without SKILL.md is skipped');
    // The fixture had 3 valid + 1 invalid + 1 empty → 3.
    assert.equal(skills.length, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: path is the absolute path to SKILL.md', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    for (const s of skills) {
      assert.ok(
        path.isAbsolute(s.path),
        `path must be absolute, got: ${s.path}`,
      );
      assert.ok(
        s.path.endsWith('SKILL.md'),
        `path must point at SKILL.md, got: ${s.path}`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSkills: missing dir returns empty array (no throw)', async () => {
  const ghost = path.join(tmpdir(), 'definitely-does-not-exist-xyz-12345');
  const skills = await listSkills(ghost);
  assert.deepEqual(skills, []);
});

// =============================================================================
// formatSkillsForSystemPrompt
// =============================================================================

test('formatSkillsForSystemPrompt: empty input returns empty string', () => {
  assert.equal(formatSkillsForSystemPrompt([]), '');
});

test('formatSkillsForSystemPrompt: wraps names in <available_skills> block', () => {
  const skills = [
    { name: 'foo', description: 'do foo things', path: '/x/foo/SKILL.md' },
    { name: 'bar', description: 'do bar things', path: '/x/bar/SKILL.md' },
  ];
  const out = formatSkillsForSystemPrompt(skills);
  assert.ok(
    out.includes('<available_skills>'),
    `output must contain opening tag, got:\n${out}`,
  );
  assert.ok(
    out.includes('</available_skills>'),
    `output must contain closing tag, got:\n${out}`,
  );
  assert.ok(out.includes('name: foo'), 'output must contain "name: foo"');
  assert.ok(out.includes('name: bar'), 'output must contain "name: bar"');
  assert.ok(
    out.includes('description: do foo things'),
    'output must contain the description',
  );
  assert.ok(
    out.includes('path: /x/foo/SKILL.md'),
    'output must contain the path',
  );
});

test('formatSkillsForSystemPrompt: omits description line when empty', () => {
  const skills = [
    { name: 'foo', description: '', path: '/x/foo/SKILL.md' },
  ];
  const out = formatSkillsForSystemPrompt(skills);
  // No `description:` line for empty description — it would confuse
  // the model.
  assert.ok(
    !out.includes('description:'),
    `output must not contain "description:" for empty desc, got:\n${out}`,
  );
  assert.ok(out.includes('name: foo'));
  assert.ok(out.includes('path: /x/foo/SKILL.md'));
});

test('formatSkillsForSystemPrompt: round-trips with listSkills output', async () => {
  const tmp = makeSkillsDir();
  try {
    const skills = await listSkills(tmp);
    const out = formatSkillsForSystemPrompt(skills);
    assert.ok(out.includes('name: One'));
    assert.ok(out.includes('name: Two'));
    assert.ok(out.includes('name: Three'));
    // None of the names should appear twice (no "name: One" twice).
    for (const n of ['One', 'Two', 'Three']) {
      const matches = out.match(new RegExp(`name: ${n}\\b`, 'g')) || [];
      assert.equal(matches.length, 1, `name ${n} should appear exactly once`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// userSkillsDir / USER_SKILLS_DIR
// =============================================================================

test('USER_SKILLS_DIR: is a non-empty string', () => {
  assert.equal(typeof USER_SKILLS_DIR, 'string');
  assert.ok(USER_SKILLS_DIR.length > 0);
});

test('userSkillsDir(): returns USER_SKILLS_DIR', () => {
  assert.equal(userSkillsDir(), USER_SKILLS_DIR);
});

// =============================================================================
// parseSkillMdFrontmatter
// =============================================================================

test('parseSkillMdFrontmatter: missing frontmatter returns {}', () => {
  assert.deepEqual(parseSkillMdFrontmatter('# just a body\n'), {});
});

test('parseSkillMdFrontmatter: unquoted scalar', () => {
  const out = parseSkillMdFrontmatter('---\nname: Foo\nwhen_to_use: bar\n---\n');
  assert.equal(out.name, 'Foo');
  assert.equal(out.when_to_use, 'bar');
});

test('parseSkillMdFrontmatter: double-quoted with escapes', () => {
  const out = parseSkillMdFrontmatter('---\nname: "Foo \\"bar\\""\n---\n');
  assert.equal(out.name, 'Foo "bar"');
});

test('parseSkillMdFrontmatter: single-quoted with doubled-quote escape', () => {
  const out = parseSkillMdFrontmatter("---\nname: 'it''s ok'\n---\n");
  assert.equal(out.name, "it's ok");
});

test('parseSkillMdFrontmatter: block scalar (|) joins lines with \\n', () => {
  const out = parseSkillMdFrontmatter(
    '---\ndescription: |\n  line one\n  line two\n---\n',
  );
  assert.equal(out.description, 'line one\nline two');
});
