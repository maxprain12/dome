'use strict';

/**
 * Line diffing for the edit/write tools.
 *
 * Replaces the previous `generateSimpleDiff`, which walked both files in
 * lockstep and gave up at the first divergence: a one-line insertion near the
 * top made every following line look changed, so neither the model nor the user
 * could tell what an edit actually did.
 *
 * This computes a real diff (Myers, with common prefix/suffix trimming and a
 * bounded edit distance) and returns both structured hunks — for the UI to
 * render — and a unified patch string for the tool result.
 *
 * Equivalent in role to pi's `core/tools/edit-diff.ts`, which delegates to the
 * `diff` npm package; implemented here to avoid the dependency.
 */

const DEFAULT_CONTEXT_LINES = 3;
/** Above this edit distance we stop refining and emit a block replacement. */
const MAX_EDIT_DISTANCE = 4000;

/**
 * @typedef {{ type: ' ' | '-' | '+', text: string, oldNum: number | null, newNum: number | null }} DiffLine
 * @typedef {{ oldStart: number, oldLines: number, newStart: number, newLines: number, lines: DiffLine[] }} DiffHunk
 */

function splitLines(content) {
  const lines = String(content ?? '').split('\n');
  // A trailing newline yields a final empty element that is not a real line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Myers O(ND) diff over two line arrays, returning edit operations.
 * Falls back to "delete everything, insert everything" past the distance cap so
 * a pathological input cannot stall the main process.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{ type: 'equal' | 'delete' | 'insert', text: string }>}
 */
function diffLineOps(a, b) {
  const n = a.length;
  const m = b.length;

  // Trim the common prefix/suffix first — most edits touch a tiny region.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) {
    suffix += 1;
  }

  const midA = a.slice(prefix, n - suffix);
  const midB = b.slice(prefix, m - suffix);

  const ops = [];
  for (let i = 0; i < prefix; i += 1) ops.push({ type: 'equal', text: a[i] });
  ops.push(...diffMiddle(midA, midB));
  for (let i = n - suffix; i < n; i += 1) ops.push({ type: 'equal', text: a[i] });
  return ops;
}

function blockReplace(a, b) {
  return [
    ...a.map((text) => ({ type: 'delete', text })),
    ...b.map((text) => ({ type: 'insert', text })),
  ];
}

function diffMiddle(a, b) {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return b.map((text) => ({ type: 'insert', text }));
  if (b.length === 0) return a.map((text) => ({ type: 'delete', text }));

  return myersWalk(a, b);
}

/**
 * Walk the Myers edit graph up to MAX_EDIT_DISTANCE, returning ops.
 * Extracted from {@link diffMiddle} to keep its cognitive complexity low.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{ type: 'equal' | 'delete' | 'insert', text: string }>}
 */
function myersWalk(a, b) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  /** Snapshot of the frontier per edit-distance, used to walk the path back. */
  const trace = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      if (advanceDiagonal(v, offset, k, d, a, b, n, m)) {
        return backtrack(trace, a, b, d, offset);
      }
    }
  }

  // Past the cap: correct, just coarse.
  return blockReplace(a, b);
}

/**
 * Move the (x, y) frontier one step along diagonal `k` at edit-distance `d`,
 * extending through any run of equal lines. Mutates `v[idx]`.
 *
 * @returns {boolean} true once both files are fully consumed
 */
function advanceDiagonal(v, offset, k, d, a, b, n, m) {
  const idx = k + offset;
  let x;
  if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
    x = v[idx + 1]; // move down (insertion from b)
  } else {
    x = v[idx - 1] + 1; // move right (deletion from a)
  }
  let y = x - k;
  while (x < n && y < m && a[x] === b[y]) {
    x += 1;
    y += 1;
  }
  v[idx] = x;
  return x >= n && y >= m;
}

function backtrack(trace, a, b, d, offset) {
  const ops = [];
  let x = a.length;
  let y = b.length;

  for (let step = d; step > 0; step -= 1) {
    const v = trace[step];
    const k = x - y;
    const idx = k + offset;
    const down = k === -step || (k !== step && v[idx - 1] < v[idx + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      ops.push({ type: 'equal', text: a[x] });
    }

    if (down) {
      y -= 1;
      ops.push({ type: 'insert', text: b[y] });
    } else {
      x -= 1;
      ops.push({ type: 'delete', text: a[x] });
    }
  }

  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    ops.push({ type: 'equal', text: a[x] });
  }

  return ops.reverse();
}

/**
 * Group edit operations into unified-diff hunks with surrounding context.
 *
 * @param {string} oldContent
 * @param {string} newContent
 * @param {{ contextLines?: number }} [options]
 * @returns {{ hunks: DiffHunk[], added: number, removed: number, firstChangedLine: number | undefined }}
 */
function computeDiff(oldContent, newContent, options = {}) {
  const contextLines = Number.isInteger(options.contextLines)
    ? Math.max(0, options.contextLines)
    : DEFAULT_CONTEXT_LINES;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const ops = diffLineOps(oldLines, newLines);

  // Annotate every op with its line numbers in each file.
  const annotated = [];
  let oldNum = 0;
  let newNum = 0;
  for (const op of ops) {
    if (op.type === 'equal') {
      oldNum += 1;
      newNum += 1;
      annotated.push({ type: ' ', text: op.text, oldNum, newNum });
    } else if (op.type === 'delete') {
      oldNum += 1;
      annotated.push({ type: '-', text: op.text, oldNum, newNum: null });
    } else {
      newNum += 1;
      annotated.push({ type: '+', text: op.text, oldNum: null, newNum });
    }
  }

  const changedIdx = annotated
    .map((line, i) => (line.type === ' ' ? -1 : i))
    .filter((i) => i >= 0);

  const added = annotated.filter((l) => l.type === '+').length;
  const removed = annotated.filter((l) => l.type === '-').length;

  if (changedIdx.length === 0) {
    return { hunks: [], added: 0, removed: 0, firstChangedLine: undefined };
  }

  // Merge changed regions whose context windows touch into one hunk.
  const hunks = [];
  let start = Math.max(0, changedIdx[0] - contextLines);
  let end = Math.min(annotated.length - 1, changedIdx[0] + contextLines);

  for (const idx of changedIdx.slice(1)) {
    if (idx - contextLines <= end + 1) {
      end = Math.min(annotated.length - 1, idx + contextLines);
    } else {
      hunks.push(buildHunk(annotated.slice(start, end + 1)));
      start = Math.max(0, idx - contextLines);
      end = Math.min(annotated.length - 1, idx + contextLines);
    }
  }
  hunks.push(buildHunk(annotated.slice(start, end + 1)));

  const firstChanged = annotated[changedIdx[0]];
  return {
    hunks,
    added,
    removed,
    // Deletions have no line in the new file; report where they happened.
    firstChangedLine: firstChanged.newNum ?? Math.max(1, firstChanged.oldNum ?? 1),
  };
}

function buildHunk(lines) {
  const oldNums = lines.filter((l) => l.oldNum !== null).map((l) => l.oldNum);
  const newNums = lines.filter((l) => l.newNum !== null).map((l) => l.newNum);
  return {
    oldStart: oldNums.length > 0 ? oldNums[0] : 0,
    oldLines: oldNums.length,
    newStart: newNums.length > 0 ? newNums[0] : 0,
    newLines: newNums.length,
    lines,
  };
}

/**
 * Render hunks as a standard unified patch.
 * @param {string} filePath
 * @param {DiffHunk[]} hunks
 * @returns {string}
 */
function formatUnifiedPatch(filePath, hunks) {
  if (hunks.length === 0) return '';
  const out = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const hunk of hunks) {
    out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines) out.push(`${line.type}${line.text}`);
  }
  return out.join('\n');
}

/**
 * Full diff payload for a tool result: structured hunks for the UI plus a
 * unified patch, capped so a huge rewrite cannot blow the context budget.
 *
 * @param {string} filePath
 * @param {string} oldContent
 * @param {string} newContent
 * @param {{ contextLines?: number, maxPatchLines?: number }} [options]
 */
function buildEditDiff(filePath, oldContent, newContent, options = {}) {
  const maxPatchLines = Number.isInteger(options.maxPatchLines) ? options.maxPatchLines : 400;
  const { hunks, added, removed, firstChangedLine } = computeDiff(oldContent, newContent, options);

  let patch = formatUnifiedPatch(filePath, hunks);
  let patchTruncated = false;
  const patchLines = patch ? patch.split('\n') : [];
  if (patchLines.length > maxPatchLines) {
    patch = `${patchLines.slice(0, maxPatchLines).join('\n')}\n… [diff truncated: ${patchLines.length - maxPatchLines} more lines]`;
    patchTruncated = true;
  }

  return { hunks, added, removed, firstChangedLine, patch, patchTruncated };
}

module.exports = {
  DEFAULT_CONTEXT_LINES,
  MAX_EDIT_DISTANCE,
  buildEditDiff,
  computeDiff,
  formatUnifiedPatch,
  splitLines,
};
