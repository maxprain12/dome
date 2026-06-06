/**
 * @dome/agent-core — local skills discovery (Tarea 4).
 *
 * Reads `~/.dome/skills/<id>/SKILL.md`, parses the frontmatter, and
 * returns a `SkillSummary[]` for injection into the system prompt.
 *
 * Replaces the deepagents wrapper in `electron/skills/index.cjs`
 * (the deepagents middleware itself — `createSkillsMiddleware` —
 * stays in `@dome/app` for the legacy runtime; this module is the
 * Dome-native replacement and is what the new `runAgentLoop` calls).
 *
 * Discovery is local-only: we do not fetch from GitHub or any other
 * remote. The installer (`electron/skills/install.cjs`) is the
 * component that pulls skills into the local directory; once
 * installed, the skill is just a folder on disk and this module
 * picks it up.
 *
 * Errors per individual skill are logged to stderr and swallowed so
 * a single broken `SKILL.md` cannot take down the whole list — the
 * model should see every usable skill, not a global failure.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { SkillSummary } from '../types.js';

import { parseSkillMdFrontmatter } from './frontmatter.js';

/**
 * Absolute path to the user skills directory. Honored env override:
 *   - `DOME_SKILLS_DIR` — points at a custom location (used by tests
 *     and by advanced users who want to keep skills out of `~/.dome`).
 *
 * Default: `~/.dome/skills`, matching the legacy
 * `electron/skills/index.cjs` behavior.
 */
export const USER_SKILLS_DIR: string =
  process.env.DOME_SKILLS_DIR || path.join(os.homedir(), '.dome', 'skills');

/**
 * Return the user skills directory path. The function form is for
 * symmetry with the legacy `userSkillsDir()` export and for cases
 * where the caller wants to defer the lookup (mostly tests).
 */
export function userSkillsDir(): string {
  return USER_SKILLS_DIR;
}

/**
 * List every skill in `dir` (default: `userSkillsDir()`).
 *
 * Each subdirectory of `dir` is treated as a potential skill. The
 * parser looks for `SKILL.md` inside it; if the file is missing the
 * subdirectory is silently skipped (this is the "no SKILL.md →
 * omitted" contract from the plan). If the file is present but has
 * no `name:` in its frontmatter, the skill is also skipped (an
 * unnamed skill is unusable — the model could not reference it).
 *
 * Any other error (EISDIR, EACCES, parse failure) is logged to
 * stderr via `console.warn` and the loop continues with the next
 * skill. The returned array never throws.
 *
 * @param dir Absolute path to scan. Defaults to `userSkillsDir()`.
 * @returns The discovered skills. Empty array if `dir` does not
 *   exist, is empty, or contains only broken entries.
 */
export async function listSkills(dir?: string): Promise<SkillSummary[]> {
  const root = dir ?? userSkillsDir();

  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch (err) {
    // Directory missing or unreadable — not an error, just no
    // skills. A warning helps users notice a misconfigured env var.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    console.warn(
      `[skills] listSkills: cannot read ${root}: ${(err as Error).message}`,
    );
    return [];
  }

  const skills: SkillSummary[] = [];
  for (const entry of entries) {
    const subdir = path.join(root, entry);
    const skillMdPath = path.join(subdir, 'SKILL.md');

    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillMdPath);
    } catch {
      // Subdirectory has no SKILL.md — skip silently.
      continue;
    }
    if (!stat.isFile()) continue;

    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, 'utf8');
    } catch (err) {
      console.warn(
        `[skills] listSkills: cannot read ${skillMdPath}: ${(err as Error).message}`,
      );
      continue;
    }

    let meta: Record<string, string>;
    try {
      meta = parseSkillMdFrontmatter(content);
    } catch (err) {
      console.warn(
        `[skills] listSkills: frontmatter parse failed for ${skillMdPath}: ${(err as Error).message}`,
      );
      continue;
    }

    const name = (meta.name ?? '').trim();
    if (!name) {
      // Frontmatter present but no `name:` — unusable. Skip without
      // a warning (this is the documented "no name → skip" case from
      // the plan; the legacy deepagents behavior is the same).
      continue;
    }

    const description = (
      meta.description ??
      meta.when_to_use ??
      meta.name ??
      ''
    ).trim();

    skills.push({
      name,
      description,
      path: path.resolve(skillMdPath),
    });
  }

  return skills;
}
