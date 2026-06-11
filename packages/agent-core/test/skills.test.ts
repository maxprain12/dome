import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkills } from '../src/harness/skills.js';
import { formatSkillsForSystemPrompt } from '../src/harness/system-prompt.js';
import { NodeExecutionEnv } from '../src/harness/env/nodejs.js';

let root: string;
const env = new NodeExecutionEnv({ cwd: tmpdir() });

function writeSkill(dir: string, frontmatter: string, body = 'Do the thing.') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dome-skills-test-'));
  writeSkill(join(root, 'good'), 'name: good-skill\ndescription: A valid skill', 'Body of good skill.');
  writeSkill(join(root, 'second'), 'name: second-skill\ndescription: Another valid skill');
  // Invalid: missing frontmatter entirely
  mkdirSync(join(root, 'broken'), { recursive: true });
  writeFileSync(join(root, 'broken', 'SKILL.md'), 'no frontmatter here');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loadSkills', () => {
  it('loads valid SKILL.md files recursively', async () => {
    const { skills } = await loadSkills(env, root);
    const names = skills.map((s) => s.name).sort();
    expect(names).toContain('good-skill');
    expect(names).toContain('second-skill');
  });

  it('reports diagnostics for invalid skill files without throwing', async () => {
    const { skills, diagnostics } = await loadSkills(env, root);
    expect(skills.some((s) => s.filePath.includes('broken'))).toBe(false);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('skips missing directories silently', async () => {
    const { skills, diagnostics } = await loadSkills(env, join(root, 'does-not-exist'));
    expect(skills).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  it('keeps skill body content and file path', async () => {
    const { skills } = await loadSkills(env, root);
    const good = skills.find((s) => s.name === 'good-skill');
    expect(good?.content).toContain('Body of good skill.');
    expect(good?.filePath).toContain('SKILL.md');
  });
});

describe('formatSkillsForSystemPrompt', () => {
  it('returns an empty string for no skills', () => {
    expect(formatSkillsForSystemPrompt([])).toBe('');
  });

  it('lists loaded skills with their descriptions', async () => {
    const { skills } = await loadSkills(env, root);
    const prompt = formatSkillsForSystemPrompt(skills);
    expect(prompt).toContain('<available_skills>');
    expect(prompt).toContain('good-skill');
    expect(prompt).toContain('A valid skill');
  });

  it('hides skills with disableModelInvocation', async () => {
    const { skills } = await loadSkills(env, root);
    const hidden = skills.map((s) => ({ ...s, disableModelInvocation: true }));
    expect(formatSkillsForSystemPrompt(hidden)).toBe('');
  });
});
