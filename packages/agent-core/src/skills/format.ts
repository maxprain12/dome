/**
 * @dome/agent-core — `<available_skills>` block formatter.
 *
 * Renders a `SkillSummary[]` into the XML-ish block the model is
 * trained to recognize as a skills advertisement. The shape matches
 * pi's `formatSkillsForSystemPrompt` (anthropics/claude-code
 * convention) and the deepagents default format: one entry per
 * skill with `name`, `description`, and `path`. The harness reads
 * this block out of the system prompt and routes skill reads
 * through the `read` tool by path.
 *
 * Format reference (from pi's `packages/agent/src/skills.ts`):
 *
 *   <available_skills>
 *   - name: <name>
 *     description: <description>
 *     path: <path>
 *   - name: ...
 *   </available_skills>
 *
 * The model uses `name` to decide *which* skill to load and
 * `description` to decide *whether* to load it (semantic match
 * against the user request). `path` is the literal location the
 * tool will read.
 *
 * If `description` is empty for a skill, the `description:` line is
 * omitted entirely — emitting an empty `description: ` line would
 * confuse the model's parsing.
 */

import type { SkillSummary } from '../types.js';

const OPEN_TAG = '<available_skills>';
const CLOSE_TAG = '</available_skills>';

/**
 * Format a list of skills into the `<available_skills>` block.
 *
 * @param skills The skills to advertise. Empty array → empty string.
 * @returns A single string with the XML-ish block, ready to be
 *   appended to the system prompt. Empty string when no skills.
 */
export function formatSkillsForSystemPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) return '';

  const lines: string[] = [OPEN_TAG];
  for (const skill of skills) {
    lines.push(`- name: ${skill.name}`);
    if (skill.description) {
      lines.push(`  description: ${skill.description}`);
    }
    lines.push(`  path: ${skill.path}`);
  }
  lines.push(CLOSE_TAG);
  return lines.join('\n');
}
