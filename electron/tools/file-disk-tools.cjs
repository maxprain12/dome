'use strict';

/**
 * Native disk filesystem tools for the agent harness (read/grep/find/edit).
 * Handlers used by ai-tools-handler.cjs / tool-dispatcher.
 */

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const nodePath = require('node:path');
const {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  GREP_MAX_LINE_LENGTH,
  formatSize,
  truncateHead,
  truncateLine,
} = require('./tool-output-truncate.cjs');
const { buildEditDiff } = require('../coding/edit-diff.cjs');

const { DEFAULT_EXCLUDES } = (() => {
  try {
    const tree = require('./file-tree.cjs');
    return { DEFAULT_EXCLUDES: tree.DEFAULT_EXCLUDES || ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'] };
  } catch {
    return { DEFAULT_EXCLUDES: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'] };
  }
})();
const EXCLUDE_DIR_SET = new Set(DEFAULT_EXCLUDES);

const GREP_DEFAULT_LIMIT = 100;
const FIND_DEFAULT_LIMIT = 1000;
const READ_DEFAULT_LIMIT = 200;

function resolveFilePath(args) {
  const filePath =
    (typeof args.file_path === 'string' && args.file_path) ||
    (typeof args.path === 'string' && args.path) ||
    '';
  return filePath.trim();
}

function splitLines(content) {
  if (content.length === 0) return [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (content.endsWith('\n') || content.endsWith('\r\n')) {
    // keep trailing empty line semantics consistent with Pi splitLinesForCounting for pagination
  }
  if (lines.length > 0 && lines[lines.length - 1] === '' && (content.endsWith('\n') || content.endsWith('\r'))) {
    lines.pop();
  }
  return lines;
}

/**
 * Resolve 1-based offset. Accepts Pi `offset` or legacy `start_line` (0-based).
 */
function resolveReadOffset(args) {
  if (typeof args.offset === 'number' && Number.isFinite(args.offset)) {
    return Math.max(1, Math.floor(args.offset));
  }
  if (typeof args.start_line === 'number' && Number.isFinite(args.start_line)) {
    return Math.max(1, Math.floor(args.start_line) + 1);
  }
  return 1;
}

function resolveReadLimit(args) {
  if (typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0) {
    return Math.floor(args.limit);
  }
  // No explicit limit → read from offset then truncateHead (no hard page default)
  if (args.limit === undefined && args.offset === undefined && args.start_line === undefined) {
    return null;
  }
  return READ_DEFAULT_LIMIT;
}

async function fileRead(args = {}) {
  const filePath = resolveFilePath(args);
  if (!filePath) return { status: 'error', error: 'file_path is required' };
  try {
    const resolved = nodePath.resolve(filePath);
    const raw = fs.readFileSync(resolved, 'utf8');
    const allLines = splitLines(raw);
    const totalLines = allLines.length;
    const offset = resolveReadOffset(args);
    const limit = resolveReadLimit(args);
    const startIdx = Math.min(Math.max(0, offset - 1), totalLines);
    let pageLines =
      limit == null ? allLines.slice(startIdx) : allLines.slice(startIdx, startIdx + limit);
    let content = pageLines.join('\n');
    let truncated = false;
    let truncatedBy = null;
    let notice = null;

    const head = truncateHead(content, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
    if (head.truncated) {
      content = head.content;
      pageLines = splitLines(content);
      truncated = true;
      truncatedBy = head.truncatedBy;
    }

    const endLine = startIdx + pageLines.length;
    const moreRemain = endLine < totalLines || (limit == null && head.truncated);
    if (moreRemain || truncated) {
      const nextOffset = endLine + 1;
      const parts = [];
      if (truncated) {
        parts.push(
          `Output truncated (${truncatedBy || 'limit'}; max ${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}).`,
        );
      }
      if (endLine < totalLines) {
        parts.push(`Use offset=${nextOffset} to continue (total_lines=${totalLines}).`);
      }
      notice = parts.join(' ');
    }

    return {
      status: 'success',
      file_path: filePath,
      content,
      offset,
      end_line: endLine,
      total_lines: totalLines,
      truncated,
      truncated_by: truncatedBy,
      notice,
      size: Buffer.byteLength(content, 'utf8'),
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function whichBin(name) {
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const first = String(out).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function shouldSkipDir(name) {
  return name.startsWith('.') || EXCLUDE_DIR_SET.has(name);
}

function walkFiles(dir, visitor) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const e of entries) {
    if (e.isDirectory() && shouldSkipDir(e.name)) continue;
    const full = nodePath.join(dir, e.name);
    if (e.isDirectory()) {
      if (!walkFiles(full, visitor)) return false;
    } else if (!visitor(full, e.name)) {
      return false;
    }
  }
  return true;
}

function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/§§/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchGlob(filePath, glob) {
  if (!glob) return true;
  const base = nodePath.basename(filePath);
  const posix = filePath.split(nodePath.sep).join('/');
  const re = globToRegExp(glob);
  return re.test(base) || re.test(posix);
}

/**
 * Convert an absolute file path into a path relative to the search root,
 * using forward slashes for portable display in rg output. Falls back to the
 * basename when the relative path escapes the search root or `path.relative`
 * throws (e.g. on different drives on Windows).
 */
function relativePosixPath(full, searchPath) {
  try {
    const relative = nodePath.relative(searchPath, full);
    if (relative && !relative.startsWith('..')) return relative.split(nodePath.sep).join('/');
  } catch { /* ignore */ }
  return nodePath.basename(full);
}

/**
 * For a match at `matchIdx`, push the surrounding context window into
 * `outputLines` in `rel:LINENO:[+-]TEXT` format. Each emitted line is
 * `truncateLine`-clipped; the caller is notified via `markLineTruncated()`
 * whenever any line was cut so it can flag the result.
 */
function appendContextLines(lines, matchIdx, context, rel, outputLines, markLineTruncated) {
  const start = Math.max(0, matchIdx - context);
  const end = Math.min(lines.length - 1, matchIdx + context);
  for (let j = start; j <= end; j += 1) {
    const { text: clipped, wasTruncated } = truncateLine(lines[j]);
    if (wasTruncated) markLineTruncated();
    const prefix = j === matchIdx ? '' : (j < matchIdx ? '-' : '+');
    outputLines.push(`${rel}:${j + 1}:${prefix}${clipped}`);
  }
}

async function fileGrepWithRg(args, rgPath) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const searchPath = nodePath.resolve(
    (typeof args.path === 'string' && args.path) ||
      (typeof args.directory === 'string' && args.directory) ||
      '.',
  );
  const glob = typeof args.glob === 'string' ? args.glob : undefined;
  const ignoreCase = args.ignoreCase === true || args.ignore_case === true;
  const literal = args.literal === true;
  const context =
    typeof args.context === 'number' && args.context > 0 ? Math.floor(args.context) : 0;
  const limit = Math.max(
    1,
    typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : GREP_DEFAULT_LIMIT,
  );

  return new Promise((resolve) => {
    const rgArgs = ['--json', '--line-number', '--color=never', '--hidden'];
    if (ignoreCase) rgArgs.push('--ignore-case');
    if (literal) rgArgs.push('--fixed-strings');
    if (glob) rgArgs.push('--glob', glob);
    if (context > 0) {
      rgArgs.push('-C', String(context));
    }
    rgArgs.push('--', pattern, searchPath);

    const child = spawn(rgPath, rgArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const rl = createInterface({ input: child.stdout });
    let matchCount = 0;
    let matchLimitReached = false;
    let linesTruncated = false;
    const outputLines = [];

    const stop = (dueToLimit) => {
      if (!child.killed) {
        if (dueToLimit) matchLimitReached = true;
        child.kill();
      }
    };

    rl.on('line', (line) => {
      if (matchLimitReached) return;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.type !== 'match') return;
      const data = ev.data || {};
      const pathText = data.path?.text || data.path || '';
      const lineNum = data.line_number;
      const textRaw = data.lines?.text ?? '';
      const text = String(textRaw).replace(/\n$/, '');
      const { text: clipped, wasTruncated } = truncateLine(text);
      if (wasTruncated) linesTruncated = true;
      const rel = (() => {
        try {
          const relative = nodePath.relative(searchPath, pathText);
          if (relative && !relative.startsWith('..')) return relative.split(nodePath.sep).join('/');
        } catch { /* ignore */ }
        return nodePath.basename(pathText);
      })();
      outputLines.push(`${rel}:${lineNum}:${clipped}`);
      matchCount += 1;
      if (matchCount >= limit) stop(true);
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', () => {
      rl.close();
      let body = outputLines.join('\n');
      const head = truncateHead(body);
      let truncated = head.truncated;
      if (head.truncated) body = head.content;
      const noticeParts = [];
      if (matchLimitReached) noticeParts.push(`Match limit ${limit} reached.`);
      if (truncated) {
        noticeParts.push(`Output truncated (max ${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}).`);
      }
      if (linesTruncated) noticeParts.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars.`);
      resolve({
        status: 'success',
        engine: 'rg',
        pattern,
        path: searchPath,
        count: matchCount,
        match_limit_reached: matchLimitReached ? limit : null,
        truncated,
        lines_truncated: linesTruncated,
        notice: noticeParts.length ? noticeParts.join(' ') : null,
        content: body,
        stderr: stderr.trim() || undefined,
      });
    });

    child.on('error', (err) => {
      resolve({ status: 'error', error: err.message });
    });
  });
}

async function fileGrepFallback(args) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const searchPath = nodePath.resolve(
    (typeof args.path === 'string' && args.path) ||
      (typeof args.directory === 'string' && args.directory) ||
      '.',
  );
  const glob = typeof args.glob === 'string' ? args.glob : undefined;
  const ignoreCase = args.ignoreCase === true || args.ignore_case === true;
  const literal = args.literal === true;
  const context =
    typeof args.context === 'number' && args.context > 0 ? Math.floor(args.context) : 0;
  const limit = Math.max(
    1,
    typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : GREP_DEFAULT_LIMIT,
  );

  let re;
  try {
    re = new RegExp(literal ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern, ignoreCase ? 'i' : '');
  } catch (err) {
    return { status: 'error', error: `Invalid pattern: ${err.message}` };
  }

  if (!fs.existsSync(searchPath)) return { status: 'error', error: 'Path not found' };

  const outputLines = [];
  let matchCount = 0;
  let matchLimitReached = false;
  let linesTruncated = false;

  const considerFile = (full) => {
    if (matchLimitReached) return false;
    if (!matchGlob(full, glob)) return true;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      return true;
    }
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rel = relativePosixPath(full, searchPath);

    for (let i = 0; i < lines.length; i += 1) {
      if (!re.test(lines[i])) continue;
      appendContextLines(lines, i, context, rel, outputLines, () => {
        linesTruncated = true;
      });
      matchCount += 1;
      if (matchCount >= limit) {
        matchLimitReached = true;
        return false;
      }
    }
    return true;
  };

  const stat = fs.statSync(searchPath);
  if (stat.isFile()) {
    considerFile(searchPath);
  } else {
    walkFiles(searchPath, (full) => considerFile(full));
  }

  let body = outputLines.join('\n');
  const head = truncateHead(body);
  const truncated = head.truncated;
  if (truncated) body = head.content;

  return {
    status: 'success',
    engine: 'fallback',
    pattern,
    path: searchPath,
    count: matchCount,
    match_limit_reached: matchLimitReached ? limit : null,
    truncated,
    lines_truncated: linesTruncated,
    notice: matchLimitReached ? `Match limit ${limit} reached.` : null,
    content: body,
  };
}

async function fileGrep(args = {}) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  if (!pattern) return { status: 'error', error: 'pattern is required' };
  const rgPath = whichBin('rg');
  if (rgPath) {
    try {
      return await fileGrepWithRg(args, rgPath);
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
  return fileGrepFallback(args);
}

async function fileFindWithFd(args, fdPath) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const searchPath = nodePath.resolve(
    (typeof args.path === 'string' && args.path) ||
      (typeof args.directory === 'string' && args.directory) ||
      '.',
  );
  const limit = Math.max(
    1,
    typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : FIND_DEFAULT_LIMIT,
  );

  return new Promise((resolve) => {
    const child = spawn(
      fdPath,
      ['--glob', '--hidden', '--no-require-git', '--max-results', String(limit), pattern, searchPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const rl = createInterface({ input: child.stdout });
    const matches = [];
    rl.on('line', (line) => {
      const t = line.trim();
      if (t) matches.push(t);
    });
    let stderr = '';
    child.stderr?.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('close', () => {
      rl.close();
      const resultLimitReached = matches.length >= limit ? limit : null;
      let body = matches.join('\n');
      const head = truncateHead(body);
      if (head.truncated) body = head.content;
      resolve({
        status: 'success',
        engine: 'fd',
        pattern,
        path: searchPath,
        count: matches.length,
        result_limit_reached: resultLimitReached,
        truncated: head.truncated,
        content: body,
        matches: matches.map((p) => ({ path: p, name: nodePath.basename(p) })),
        stderr: stderr.trim() || undefined,
      });
    });
    child.on('error', (err) => resolve({ status: 'error', error: err.message }));
  });
}

async function fileFindFallback(args) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  const searchPath = nodePath.resolve(
    (typeof args.path === 'string' && args.path) ||
      (typeof args.directory === 'string' && args.directory) ||
      '.',
  );
  const limit = Math.max(
    1,
    typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : FIND_DEFAULT_LIMIT,
  );
  if (!fs.existsSync(searchPath)) return { status: 'error', error: 'Path not found' };

  const re = globToRegExp(pattern.includes('*') || pattern.includes('?') || pattern.includes('/') ? pattern : `**/${pattern}`);
  const matches = [];
  walkFiles(searchPath, (full, name) => {
    const posix = full.split(nodePath.sep).join('/');
    const rel = nodePath.relative(searchPath, full).split(nodePath.sep).join('/');
    if (re.test(name) || re.test(rel) || re.test(posix) || globToRegExp(pattern).test(name)) {
      matches.push(full);
      if (matches.length >= limit) return false;
    }
    return true;
  });

  let body = matches.join('\n');
  const head = truncateHead(body);
  if (head.truncated) body = head.content;
  return {
    status: 'success',
    engine: 'fallback',
    pattern,
    path: searchPath,
    count: matches.length,
    result_limit_reached: matches.length >= limit ? limit : null,
    truncated: head.truncated,
    content: body,
    matches: matches.map((p) => ({ path: p, name: nodePath.basename(p) })),
  };
}

async function fileFind(args = {}) {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  if (!pattern) return { status: 'error', error: 'pattern is required' };
  const fdPath = whichBin('fd') || whichBin('fdfind');
  if (fdPath) {
    try {
      return await fileFindWithFd(args, fdPath);
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
  // Prefer rg --files when available
  const rgPath = whichBin('rg');
  if (rgPath) {
    const searchPath = nodePath.resolve(
      (typeof args.path === 'string' && args.path) ||
        (typeof args.directory === 'string' && args.directory) ||
        '.',
    );
    const limit = Math.max(
      1,
      typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : FIND_DEFAULT_LIMIT,
    );
    return new Promise((resolve) => {
      const child = spawn(rgPath, ['--files', '--hidden', '-g', pattern, searchPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const rl = createInterface({ input: child.stdout });
      const matches = [];
      rl.on('line', (line) => {
        const t = line.trim();
        if (!t) return;
        matches.push(t);
        if (matches.length >= limit && !child.killed) child.kill();
      });
      child.on('close', () => {
        rl.close();
        let body = matches.slice(0, limit).join('\n');
        const head = truncateHead(body);
        if (head.truncated) body = head.content;
        resolve({
          status: 'success',
          engine: 'rg-files',
          pattern,
          path: searchPath,
          count: Math.min(matches.length, limit),
          result_limit_reached: matches.length >= limit ? limit : null,
          truncated: head.truncated,
          content: body,
          matches: matches.slice(0, limit).map((p) => ({ path: p, name: nodePath.basename(p) })),
        });
      });
      child.on('error', () => {
        resolve(fileFindFallback(args));
      });
    });
  }
  return fileFindFallback(args);
}

/* ── edit (Pi edit-diff, without `diff` package) ─────────────────────── */

function detectLineEnding(content) {
  const crlfIdx = content.indexOf('\r\n');
  const lfIdx = content.indexOf('\n');
  if (lfIdx === -1) return '\n';
  if (crlfIdx === -1) return '\n';
  return crlfIdx < lfIdx ? '\r\n' : '\n';
}

function normalizeToLF(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function restoreLineEndings(text, ending) {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

function stripBom(content) {
  return content.startsWith('\uFEFF')
    ? { bom: '\uFEFF', text: content.slice(1) }
    : { bom: '', text: content };
}

function normalizeForFuzzyMatch(text) {
  return text
    .normalize('NFKC')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ');
}

function fuzzyFindText(content, oldText) {
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
  if (fuzzyIndex === -1) {
    return {
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }
  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true,
    contentForReplacement: fuzzyContent,
  };
}

function countOccurrences(content, oldText) {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  return fuzzyContent.split(fuzzyOldText).length - 1;
}

function applyEditsToNormalizedContent(normalizedContent, edits, path) {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
  }));

  for (let i = 0; i < normalizedEdits.length; i += 1) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw new Error(
        edits.length === 1
          ? `oldText must not be empty in ${path}.`
          : `edits[${i}].oldText must not be empty in ${path}.`,
      );
    }
  }

  const initialMatches = normalizedEdits.map((edit) => fuzzyFindText(normalizedContent, edit.oldText));
  const baseContent = initialMatches.some((m) => m.usedFuzzyMatch)
    ? normalizeForFuzzyMatch(normalizedContent)
    : normalizedContent;

  const matchedEdits = [];
  for (let i = 0; i < normalizedEdits.length; i += 1) {
    const edit = normalizedEdits[i];
    const matchResult = fuzzyFindText(baseContent, edit.oldText);
    if (!matchResult.found) {
      throw new Error(
        edits.length === 1
          ? `Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`
          : `Could not find edits[${i}] in ${path}. The oldText must match exactly including all whitespace and newlines.`,
      );
    }
    const occurrences = countOccurrences(baseContent, edit.oldText);
    if (occurrences > 1) {
      throw new Error(
        edits.length === 1
          ? `Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
          : `Found ${occurrences} occurrences of edits[${i}] in ${path}. Each oldText must be unique.`,
      );
    }
    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      newText: edit.newText,
    });
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i += 1) {
    const previous = matchedEdits[i - 1];
    const current = matchedEdits[i];
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target disjoint regions.`,
      );
    }
  }

  let newContent = baseContent;
  for (let i = matchedEdits.length - 1; i >= 0; i -= 1) {
    const edit = matchedEdits[i];
    newContent =
      newContent.substring(0, edit.matchIndex) +
      edit.newText +
      newContent.substring(edit.matchIndex + edit.matchLength);
  }

  if (baseContent === newContent) {
    throw new Error(`No changes made to ${path}. The replacement produced identical content.`);
  }

  return { baseContent, newContent };
}

const fileMutationQueues = new Map();

function withFileMutationQueue(filePath, fn) {
  const key = nodePath.resolve(filePath);
  const prev = fileMutationQueues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (fileMutationQueues.get(key) === next) fileMutationQueues.delete(key);
  });
  fileMutationQueues.set(key, next);
  return next;
}

async function fileEdit(args = {}) {
  const filePath = resolveFilePath(args);
  if (!filePath) return { status: 'error', error: 'file_path / path is required' };

  let edits = Array.isArray(args.edits) ? args.edits : null;
  if (!edits && typeof args.oldText === 'string' && typeof args.newText === 'string') {
    edits = [{ oldText: args.oldText, newText: args.newText }];
  }
  if (!edits || edits.length === 0) {
    return { status: 'error', error: 'edits[] (or legacy oldText/newText) is required' };
  }
  const normalizedEdits = edits.map((e) => ({
    oldText: typeof e?.oldText === 'string' ? e.oldText : '',
    newText: typeof e?.newText === 'string' ? e.newText : '',
  }));

  try {
    return await withFileMutationQueue(filePath, async () => {
      const resolved = nodePath.resolve(filePath);
      const original = fs.readFileSync(resolved, 'utf8');
      const { bom, text } = stripBom(original);
      const ending = detectLineEnding(text);
      const normalized = normalizeToLF(text);
      const { baseContent, newContent } = applyEditsToNormalizedContent(
        normalized,
        normalizedEdits,
        filePath,
      );
      const restored = bom + restoreLineEndings(newContent, ending);
      fs.writeFileSync(resolved, restored, 'utf8');
      const diff = buildEditDiff(filePath, baseContent, newContent);
      return {
        status: 'success',
        file_path: filePath,
        edits_applied: normalizedEdits.length,
        first_changed_line: diff.firstChangedLine,
        lines_added: diff.added,
        lines_removed: diff.removed,
        diff: diff.patch,
        // Structured form for the UI's diff card; the patch above is for the model.
        diff_hunks: diff.hunks,
        diff_truncated: diff.patchTruncated,
        bytes_written: Buffer.byteLength(restored, 'utf8'),
      };
    });
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Write a whole file, returning the same structured diff as `file_edit` so the
 * user sees what a rewrite actually changed instead of just a byte count.
 * Creating a new file reports every line as added.
 */
async function fileWrite(args = {}) {
  const filePath = resolveFilePath(args);
  if (!filePath) return { status: 'error', error: 'file_path / path is required' };
  const content = typeof args.content === 'string' ? args.content : '';

  try {
    return await withFileMutationQueue(filePath, async () => {
      const resolved = nodePath.resolve(filePath);
      let previous = '';
      let existed = false;
      try {
        previous = fs.readFileSync(resolved, 'utf8');
        existed = true;
      } catch {
        // New file — the diff below is a pure insertion.
      }

      if (existed && previous === content) {
        return {
          status: 'success',
          file_path: filePath,
          created: false,
          unchanged: true,
          notice: 'File already had this exact content; nothing was written.',
          bytes_written: Buffer.byteLength(content, 'utf8'),
        };
      }

      fs.mkdirSync(nodePath.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');

      const { text: previousText } = stripBom(previous);
      const { text: nextText } = stripBom(content);
      const diff = buildEditDiff(
        filePath,
        normalizeToLF(previousText),
        normalizeToLF(nextText),
      );
      return {
        status: 'success',
        file_path: filePath,
        created: !existed,
        unchanged: false,
        first_changed_line: diff.firstChangedLine,
        lines_added: diff.added,
        lines_removed: diff.removed,
        diff: diff.patch,
        diff_hunks: diff.hunks,
        diff_truncated: diff.patchTruncated,
        bytes_written: Buffer.byteLength(content, 'utf8'),
      };
    });
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  fileRead,
  fileGrep,
  fileFind,
  fileEdit,
  fileWrite,
  withFileMutationQueue,
  // exported for tests
  resolveReadOffset,
  applyEditsToNormalizedContent,
  GREP_DEFAULT_LIMIT,
  FIND_DEFAULT_LIMIT,
};
