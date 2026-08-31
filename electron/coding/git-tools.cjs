'use strict';

/**
 * Local git tools for the coding agent.
 *
 * Dome could talk to the GitHub API but had no view of the working copy: the
 * agent could edit files and never see its own diff, and could not put the work
 * on a branch. These run `git` through the streaming executor, always at the
 * run's workspace root.
 *
 * Read operations are plain; mutations go through the same HITL gate as
 * `shell_exec` (they are listed in HITL_TOOL_NAMES). `git push` is deliberately
 * absent — publishing is a decision for the user, not the agent.
 */

const { executeBash } = require('./bash-executor.cjs');

/** Cap for diff/log output before the model has to narrow the request. */
const DIFF_MAX_LINES = 1200;
/**
 * git log field separator. It must be printable: the executor sanitizes control
 * characters out of command output, so an ASCII unit separator would be eaten
 * before we ever get to parse it.
 */
const FIELD_SEPARATOR = '<|dome|>';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Run a git subcommand at `cwd`.
 * @param {string[]} argv - already-safe argument list
 * @param {string} cwd
 * @param {{ signal?: AbortSignal }} [options]
 */
async function runGit(argv, cwd, options = {}) {
  if (!cwd) {
    return { ok: false, error: 'No coding workspace is open for this run.' };
  }
  const command = ['git', ...argv.map(shellQuote)].join(' ');
  try {
    const res = await executeBash(command, cwd, { signal: options.signal, timeoutSeconds: 120 });
    if (res.cancelled) return { ok: false, cancelled: true, error: 'Cancelled by the user.' };
    if (res.timedOut) return { ok: false, timedOut: true, error: 'git timed out after 120s.' };
    return {
      ok: res.exitCode === 0,
      exitCode: res.exitCode ?? 0,
      output: res.output,
      truncated: res.truncated,
      error: res.exitCode === 0 ? null : res.output.trim() || `git exited with ${res.exitCode}`,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function workspaceOf(toolContext) {
  return toolContext?.workspaceCwd || null;
}

function clipLines(text, maxLines = DIFF_MAX_LINES) {
  const lines = String(text ?? '').split('\n');
  if (lines.length <= maxLines) return { text, truncated: false };
  return {
    text: `${lines.slice(0, maxLines).join('\n')}\n… [truncated: ${lines.length - maxLines} more lines — narrow with a path argument]`,
    truncated: true,
  };
}

/**
 * Parse the `## branch...upstream [ahead N, behind M]` header line.
 */
function parseBranchHeader(header) {
  const branch = header.split('...')[0].trim();
  const aheadMatch = header.match(/ahead (\d+)/);
  const behindMatch = header.match(/behind (\d+)/);
  const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
  const behind = behindMatch ? Number(behindMatch[1]) : 0;
  return { branch, ahead, behind };
}

/**
 * Parse one `XY path` (or `XY from -> to`) file-status line.
 */
function parseFileLine(line) {
  const indexStatus = line[0];
  const workTreeStatus = line[1];
  let filePath = line.slice(3);
  let renamedFrom = null;
  if (filePath.includes(' -> ')) {
    const [from, to] = filePath.split(' -> ');
    renamedFrom = from;
    filePath = to;
  }
  return {
    path: filePath,
    staged: indexStatus !== ' ' && indexStatus !== '?',
    untracked: indexStatus === '?',
    indexStatus: indexStatus === ' ' ? null : indexStatus,
    workTreeStatus: workTreeStatus === ' ' ? null : workTreeStatus,
    renamedFrom,
  };
}

/**
 * Parse `git status --porcelain=v1 -b` into something the model can reason over
 * without re-deriving the two-letter status codes.
 */
function parseStatus(output) {
  const files = [];
  let branch = null;
  let ahead = 0;
  let behind = 0;

  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      const parsed = parseBranchHeader(line.slice(3));
      branch = parsed.branch;
      ahead = parsed.ahead;
      behind = parsed.behind;
      continue;
    }
    files.push(parseFileLine(line));
  }

  return { branch, ahead, behind, files };
}

async function gitStatus(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const res = await runGit(['status', '--porcelain=v1', '-b'], cwd, toolContext);
  if (!res.ok) return { status: 'error', error: res.error };
  const parsed = parseStatus(res.output);
  return {
    status: 'success',
    branch: parsed.branch,
    ahead: parsed.ahead,
    behind: parsed.behind,
    clean: parsed.files.length === 0,
    staged_count: parsed.files.filter((f) => f.staged).length,
    files: parsed.files,
  };
}

async function gitDiff(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const argv = ['diff'];
  if (args.staged === true || args.cached === true) argv.push('--staged');
  if (args.stat === true) argv.push('--stat');
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((p) => typeof p === 'string' && p.trim())
    : typeof args.path === 'string' && args.path.trim()
      ? [args.path.trim()]
      : [];
  if (paths.length > 0) argv.push('--', ...paths);

  const res = await runGit(argv, cwd, toolContext);
  if (!res.ok) return { status: 'error', error: res.error };
  const clipped = clipLines(res.output);
  return {
    status: 'success',
    staged: Boolean(args.staged || args.cached),
    empty: clipped.text.trim() === '',
    diff: clipped.text,
    truncated: clipped.truncated || res.truncated,
  };
}

async function gitLog(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const limitRaw = Number(args.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 20;
  // An explicit separator keeps the parse unambiguous when a subject contains
  // pipes, dashes or other punctuation.
  const format = ['%h', '%an', '%ad', '%s'].join(FIELD_SEPARATOR);
  const res = await runGit(
    ['log', `-${limit}`, `--pretty=format:${format}`, '--date=short'],
    cwd,
    toolContext,
  );
  if (!res.ok) return { status: 'error', error: res.error };
  const commits = String(res.output ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [hash, author, date, subject] = line.split(FIELD_SEPARATOR);
      return { hash, author, date, subject };
    });
  return { status: 'success', count: commits.length, commits };
}

async function gitBranchCreate(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { status: 'error', error: 'name is required' };

  // git itself rejects malformed refs; let it be the authority. Only a real
  // rejection means a bad name — a cancelled or failed pre-flight must report
  // what actually happened, not be relabelled as "invalid branch name".
  const check = await runGit(['check-ref-format', '--branch', name], cwd, toolContext);
  if (!check.ok) {
    if (typeof check.exitCode === 'number' && check.exitCode > 0) {
      return { status: 'error', error: `Invalid branch name: ${name}` };
    }
    return { status: 'error', error: check.error || 'Could not validate the branch name.' };
  }

  const from = typeof args.from === 'string' && args.from.trim() ? args.from.trim() : null;
  const argv = ['switch', '-c', name];
  if (from) argv.push(from);
  const res = await runGit(argv, cwd, toolContext);
  if (!res.ok) return { status: 'error', error: res.error };
  return { status: 'success', branch: name, from, output: res.output.trim() };
}

async function gitAdd(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((p) => typeof p === 'string' && p.trim())
    : typeof args.path === 'string' && args.path.trim()
      ? [args.path.trim()]
      : [];
  if (paths.length === 0) {
    return { status: 'error', error: 'paths[] is required — staging everything blindly is not allowed' };
  }
  const res = await runGit(['add', '--', ...paths], cwd, toolContext);
  if (!res.ok) return { status: 'error', error: res.error };
  return { status: 'success', staged: paths };
}

async function gitCommit(args = {}, toolContext = null) {
  const cwd = workspaceOf(toolContext);
  const message = typeof args.message === 'string' ? args.message.trim() : '';
  if (!message) return { status: 'error', error: 'message is required' };

  const staged = await runGit(['diff', '--cached', '--name-only'], cwd, toolContext);
  if (!staged.ok) return { status: 'error', error: staged.error };
  if (!staged.output.trim()) {
    return { status: 'error', error: 'Nothing staged. Call git_add first.' };
  }

  const res = await runGit(['commit', '-m', message], cwd, toolContext);
  if (!res.ok) return { status: 'error', error: res.error };

  const head = await runGit(['rev-parse', '--short', 'HEAD'], cwd, toolContext);
  return {
    status: 'success',
    commit: head.ok ? head.output.trim() : null,
    files: staged.output.trim().split('\n'),
    message,
  };
}

module.exports = {
  DIFF_MAX_LINES,
  gitAdd,
  gitBranchCreate,
  gitCommit,
  gitDiff,
  gitLog,
  gitStatus,
  parseStatus,
};
