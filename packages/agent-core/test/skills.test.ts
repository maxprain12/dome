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

describe('loadSkills with Windows-style paths (regression)', () => {
  // Reproduce a Windows ExecutionEnv: a drive-letter root and native
  // (backslash) paths from listDir/fileInfo. The real test FS is POSIX, so a
  // thin wrapper maps a fake `C:\\skills` root onto the temp dir and back.
  //
  // Before the fix, relativeEnvPath compared backslash paths with a forward
  // slash and leaked the ABSOLUTE path into ignoreMatcher.ignores(): on older
  // `ignore` versions that threw outright; on current ones it silently breaks
  // .gitignore matching (an ignored skill gets loaded). This test asserts the
  // ignore rule is honored, so it fails without the fix regardless of `ignore`
  // version.
  const WIN_ROOT = 'C:\\skills';
  let winRoot: string;
  let realRoot: string;

  beforeAll(() => {
    realRoot = mkdtempSync(join(tmpdir(), 'dome-skills-win-'));
    writeSkill(join(realRoot, 'visible'), 'name: visible-skill\ndescription: Should load');
    writeSkill(join(realRoot, 'secret'), 'name: secret-skill\ndescription: Should be ignored');
    writeFileSync(join(realRoot, '.gitignore'), 'secret/\n');
    winRoot = WIN_ROOT;
  });
  afterAll(() => rmSync(realRoot, { recursive: true, force: true }));

  const toReal = (p: string) => p.replace(/\\/g, '/').replace(WIN_ROOT.replace(/\\/g, '/'), realRoot);
  const toWin = (p: string) => WIN_ROOT + p.replace(realRoot, '').replace(/\//g, '\\');
  const mapInfo = (i: { path: string }) => ({ ...i, path: toWin(i.path) });

  const winEnv = {
    fileInfo: async (p: string) => {
      const r = await env.fileInfo(toReal(p));
      return r.ok ? { ok: true as const, value: mapInfo(r.value) } : r;
    },
    listDir: async (p: string) => {
      const r = await env.listDir(toReal(p));
      return r.ok ? { ok: true as const, value: r.value.map(mapInfo) } : r;
    },
    readTextFile: (p: string) => env.readTextFile(toReal(p)),
    canonicalPath: async (p: string) => {
      const r = await env.canonicalPath(toReal(p));
      return r.ok ? { ok: true as const, value: toWin(r.value) } : r;
    },
  } as unknown as typeof env;

  it('loads skills and honors .gitignore on Windows-style paths', async () => {
    const { skills } = await loadSkills(winEnv, winRoot);
    const names = skills.map((s) => s.name);
    expect(names).toContain('visible-skill');
    // Without the path fix, the absolute path bypasses the `secret/` rule and
    // this skill is wrongly loaded.
    expect(names).not.toContain('secret-skill');
  });
});
