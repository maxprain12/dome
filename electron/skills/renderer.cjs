/* eslint-disable no-console */
/**
 * Render SKILL.md body: $ARGUMENTS, $N, $name, ${CLAUDE_SESSION_ID}, ${CLAUDE_SKILL_DIR}
 * and inline `!`command`` / ```! blocks (optional; blocked when disableSkillShellExecution).
 */
const { execSync } = require('child_process');
const path = require('path');

/**
 * Shell-style split respecting double quotes
 * @param {string} line
 * @returns {string[]}
 */
function splitArgs(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {string} body
 * @param {{
 *   argumentsLine?: string,
 *   namedArgs?: string[],
 *   sessionId?: string,
 *   skillDir?: string,
 * }} ctx
 */
function substituteBody(body, ctx) {
  const argsLine = ctx.argumentsLine != null ? String(ctx.argumentsLine) : '';
  const parts = splitArgs(argsLine);
  const named = Array.isArray(ctx.namedArgs) ? ctx.namedArgs : [];
  let out = String(body || '');
  out = out.replace(/\$\{CLAUDE_SESSION_ID\}/g, ctx.sessionId || '');
  out = out.replace(/\$\{CLAUDE_SKILL_DIR\}/g, ctx.skillDir || '');
  out = out.replace(/\$ARGUMENTS\b/g, argsLine);
  out = out.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, i) => parts[Number(i)] ?? '');
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\$${i}\\b`, 'g');
    out = out.replace(re, parts[i] ?? '');
  }
  named.forEach((name, idx) => {
    if (!name) return;
    const re = new RegExp(`\\$${name}\\b`, 'g');
    out = out.replace(re, parts[idx] ?? '');
  });
  return out;
}

/**
 * Run inline `!`cmd` and fenced ```! blocks
 * @param {string} text
 * @param {{ skillDir: string, shell: 'bash'|'powershell', disableShell: boolean }} opts
 */
function runShellInjections(text, opts) {
  if (opts.disableShell) {
    return String(text || '').replace(/!`([^`]+)`/g, '[shell command execution disabled by policy]').replace(/```!\s*[\s\S]*?```/g, '[shell command execution disabled by policy]');
  }
  const cwd = opts.skillDir || process.cwd();
  const isWin = process.platform === 'win32';
  const run = (cmd) => {
    try {
      const out = execSync(cmd, {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
        shell: opts.shell === 'powershell' && isWin ? 'powershell.exe' : '/bin/bash',
        env: { ...process.env },
      });
      return String(out || '').trimEnd();
    } catch (e) {
      return `[shell error: ${e?.message || e}]`;
    }
  };

  let s = String(text || '');
  s = s.replace(/!`([^`]+)`/g, (_, cmd) => run(cmd.trim()));
  s = s.replace(/```!\s*\n([\s\S]*?)```/g, (_, block) => run(block.trim()));
  return s;
}

/**
 * Full render pipeline for a skill body
 * @param {string} body
 * @param {{
 *   argumentsLine?: string,
 *   namedArgs?: string[],
 *   sessionId?: string,
 *   skillDir?: string,
 *   shell?: 'bash'|'powershell',
 *   disableSkillShellExecution?: boolean,
 * }} opts
 */
function renderSkillBody(body, opts) {
  const sub = substituteBody(body, {
    argumentsLine: opts.argumentsLine,
    namedArgs: opts.namedArgs,
    sessionId: opts.sessionId,
    skillDir: opts.skillDir,
  });
  return runShellInjections(sub, {
    skillDir: opts.skillDir || '',
    shell: opts.shell || 'bash',
    disableShell: opts.disableSkillShellExecution === true,
  });
}

module.exports = {
  substituteBody,
  runShellInjections,
  renderSkillBody,
  splitArgs,
};
