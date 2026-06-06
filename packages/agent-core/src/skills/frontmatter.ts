/**
 * @dome/agent-core — YAML frontmatter parser for `SKILL.md` files.
 *
 * Minimal YAML frontmatter parser — a direct port of
 * `parseSkillMdFrontmatter` + `parseYamlScalarValue` from
 * `electron/skills/install.cjs` (lines 18-99). No external
 * dependencies, no full YAML feature set: this is the subset
 * `SKILL.md` files actually use.
 *
 * Supported features:
 *   - Top-level frontmatter delimited by `---` lines.
 *   - String-keyed scalar values, either:
 *       * unquoted  — `key: value`  (trimmed, no escapes)
 *       * double-quoted — `key: "value"` with `\\` escapes
 *       * single-quoted — `key: 'value'` with `''` escapes
 *   - Block scalars:
 *       * `key: |` — literal (multi-line, preserves newlines,
 *         lines indented with 2 spaces are stripped of the indent)
 *       * `key: >` — folded (parsed the same way as `|`; the legacy
 *         parser does not implement YAML folding rules, so the model
 *         sees the literal block — this matches the legacy output)
 *
 * The parser is intentionally permissive: any line that does not
 * match `key: value` is silently skipped. A malformed frontmatter
 * (missing closing `---`) returns an empty object.
 *
 * The legacy `install.cjs` parser is the source of truth for shape;
 * if a real `SKILL.md` parses differently here than in production,
 * the legacy parser is right and this one needs to catch up.
 */

/**
 * Parse a single YAML scalar value. Supports unquoted, double-quoted
 * (with `\\` escapes), and single-quoted (with `''` escapes) forms.
 *
 * @param raw The text after `key:` (already trimmed only on the
 *   side the regex stripped; the value itself is trimmed at the
 *   outer edge).
 * @returns The unescaped scalar value.
 */
function parseYamlScalarValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('"')) {
    let i = 1;
    let out = '';
    while (i < trimmed.length) {
      const ch = trimmed[i];
      if (ch === '\\' && i + 1 < trimmed.length) {
        out += trimmed[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') break;
      out += ch;
      i += 1;
    }
    return out;
  }

  if (trimmed.startsWith("'")) {
    let i = 1;
    let out = '';
    while (i < trimmed.length) {
      if (trimmed[i] === "'" && trimmed[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      if (trimmed[i] === "'") break;
      out += trimmed[i];
      i += 1;
    }
    return out;
  }

  return trimmed;
}

/**
 * Parse the YAML frontmatter at the top of a `SKILL.md` content
 * string. Returns a flat string→string map. Values are always
 * strings (no type coercion, no lists, no nested maps) — the
 * `SKILL.md` format only uses string scalars.
 *
 * Block scalars (`|` and `>`) are joined into a single string with
 * `\n` separators, lines stripped of their leading 2-space indent.
 * Empty lines inside a block scalar are kept as empty strings.
 *
 * @param content Full `SKILL.md` file contents.
 * @returns A record of frontmatter keys to string values. Empty if
 *   no frontmatter is found.
 */
export function parseSkillMdFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const lines = match[1]!.split('\n');

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]!;
    const keyMatch = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1]!;
    const valuePart = keyMatch[2] ?? '';

    if (valuePart === '|' || valuePart === '>') {
      const blockLines: string[] = [];
      idx += 1;
      while (
        idx < lines.length &&
        (lines[idx]!.startsWith('  ') || lines[idx]!.trim() === '')
      ) {
        blockLines.push(lines[idx]!.replace(/^  /, ''));
        idx += 1;
      }
      idx -= 1;
      result[key] = blockLines.join('\n').trimEnd();
      continue;
    }

    result[key] = parseYamlScalarValue(valuePart);
  }

  return result;
}
