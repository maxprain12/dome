import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileEditIcon, TerminalIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeText } from '@/components/shared/SafeText';
import './diff-preview.css';

/** One line of a unified diff, as produced by `electron/coding/edit-diff.cjs`. */
export type DiffLine = {
  type: ' ' | '-' | '+';
  text: string;
  oldNum: number | null;
  newNum: number | null;
};

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type DiffResult = {
  file_path?: string;
  lines_added?: number;
  lines_removed?: number;
  diff_hunks?: DiffHunk[];
  diff_truncated?: boolean;
  created?: boolean;
  unchanged?: boolean;
};

/** Hunks shown before the card collapses behind a "show all" toggle. */
const COLLAPSE_AFTER_LINES = 24;

function isDiffLine(value: unknown): value is DiffLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<DiffLine>;
  return (line.type === ' ' || line.type === '-' || line.type === '+') && typeof line.text === 'string';
}

/**
 * Read the structured diff off a `file_edit` / `file_write` tool result.
 * Returns null for anything that is not a diff-bearing result.
 */
export function parseDiffResult(result: unknown): DiffResult | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  if (!Array.isArray(row.diff_hunks)) return null;

  const hunks: DiffHunk[] = [];
  for (const raw of row.diff_hunks) {
    if (!raw || typeof raw !== 'object') continue;
    const hunk = raw as Record<string, unknown>;
    if (!Array.isArray(hunk.lines)) continue;
    hunks.push({
      oldStart: Number(hunk.oldStart) || 0,
      oldLines: Number(hunk.oldLines) || 0,
      newStart: Number(hunk.newStart) || 0,
      newLines: Number(hunk.newLines) || 0,
      lines: hunk.lines.filter(isDiffLine),
    });
  }
  if (hunks.length === 0 && row.unchanged !== true) return null;

  return {
    file_path: typeof row.file_path === 'string' ? row.file_path : undefined,
    lines_added: Number(row.lines_added) || 0,
    lines_removed: Number(row.lines_removed) || 0,
    diff_hunks: hunks,
    diff_truncated: row.diff_truncated === true,
    created: row.created === true,
    unchanged: row.unchanged === true,
  };
}

/**
 * Render a file edit as a real diff instead of a byte count, so the user can
 * see what the agent changed without leaving the chat.
 */
export function DiffPreview({
  diff,
  t,
}: {
  diff: DiffResult;
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  const hunks = diff.diff_hunks ?? [];
  const totalLines = useMemo(
    () => hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0),
    [hunks],
  );
  const collapsible = totalLines > COLLAPSE_AFTER_LINES;

  const visibleHunks = useMemo(() => {
    if (!collapsible || expanded) return hunks;
    const out: DiffHunk[] = [];
    let budget = COLLAPSE_AFTER_LINES;
    for (const hunk of hunks) {
      if (budget <= 0) break;
      out.push(hunk.lines.length <= budget ? hunk : { ...hunk, lines: hunk.lines.slice(0, budget) });
      budget -= hunk.lines.length;
    }
    return out;
  }, [collapsible, expanded, hunks]);

  const fileName = diff.file_path ? diff.file_path.split('/').slice(-1)[0] : '';

  return (
    <div className="dome-diff">
      <div className="dome-diff-header">
        <HugeiconsIcon icon={FileEditIcon} size={13} className="shrink-0 text-muted-foreground" />
        <SafeText className="dome-diff-path" title={diff.file_path}>
          {fileName || diff.file_path || ''}
        </SafeText>
        {diff.created ? (
          <Badge variant="mint" className="h-4 shrink-0 px-1.5 text-[10px]">
            {t('chat.diff_created', { defaultValue: 'new' })}
          </Badge>
        ) : null}
        {(diff.lines_added ?? 0) > 0 ? (
          <span className="dome-diff-stat dome-diff-stat-add">+{diff.lines_added}</span>
        ) : null}
        {(diff.lines_removed ?? 0) > 0 ? (
          <span className="dome-diff-stat dome-diff-stat-del">−{diff.lines_removed}</span>
        ) : null}
      </div>

      {diff.unchanged ? (
        <p className="dome-diff-empty">
          {t('chat.diff_unchanged', { defaultValue: 'File already had this content — nothing written.' })}
        </p>
      ) : (
        <div className="dome-diff-body">
          {visibleHunks.map((hunk) => (
            <div key={`${hunk.oldStart}:${hunk.newStart}`} className="dome-diff-hunk">
              <div className="dome-diff-hunk-header">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>
              {hunk.lines.map((line, i) => (
                <div
                  key={`${hunk.newStart}:${i}:${line.type}`}
                  className="dome-diff-line"
                  data-kind={line.type === '+' ? 'add' : line.type === '-' ? 'del' : 'ctx'}
                >
                  <span className="dome-diff-num">{line.oldNum ?? ''}</span>
                  <span className="dome-diff-num">{line.newNum ?? ''}</span>
                  <span className="dome-diff-sign">{line.type === ' ' ? '' : line.type}</span>
                  <span className="dome-diff-text">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {collapsible || diff.diff_truncated ? (
        <div className="dome-diff-footer">
          {collapsible ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)}>
              {expanded
                ? t('chat.diff_collapse', { defaultValue: 'Show less' })
                : t('chat.diff_expand', { defaultValue: 'Show full diff' })}
            </Button>
          ) : null}
          {diff.diff_truncated ? (
            <span className="dome-diff-note">
              {t('chat.diff_truncated', { defaultValue: 'Diff truncated' })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type ShellResult = {
  command: string;
  cwd?: string | null;
  output: string;
  exitCode?: number;
  truncated?: boolean;
  cancelled?: boolean;
};

/** Read a `shell_exec` result, whether it succeeded, failed or was cancelled. */
export function parseShellResult(result: unknown): ShellResult | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  if (typeof row.command !== 'string' || typeof row.output !== 'string') return null;
  return {
    command: row.command,
    cwd: typeof row.cwd === 'string' ? row.cwd : null,
    output: row.output,
    exitCode: typeof row.exitCode === 'number' ? row.exitCode : undefined,
    truncated: row.truncated === true,
    cancelled: row.status === 'cancelled',
  };
}

/** Terminal-style card for a shell command and its combined output. */
export function ShellPreview({
  shell,
  t,
}: {
  shell: ShellResult;
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string;
}) {
  const failed = typeof shell.exitCode === 'number' && shell.exitCode !== 0;

  return (
    <div className="dome-shell">
      <div className="dome-shell-header">
        <HugeiconsIcon icon={TerminalIcon} size={13} className="shrink-0 text-muted-foreground" />
        <SafeText className="dome-shell-command" title={shell.command}>
          $ {shell.command}
        </SafeText>
        {shell.cancelled ? (
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
            {t('chat.shell_cancelled', { defaultValue: 'cancelled' })}
          </Badge>
        ) : null}
        {failed ? (
          <Badge variant="destructive" className="h-4 shrink-0 px-1.5 text-[10px]">
            exit {shell.exitCode}
          </Badge>
        ) : null}
      </div>
      {shell.output.trim() ? (
        <pre className="dome-shell-output">{shell.output}</pre>
      ) : (
        <p className="dome-diff-empty">
          {t('chat.shell_no_output', { defaultValue: 'No output.' })}
        </p>
      )}
      {shell.truncated ? (
        <div className="dome-diff-footer">
          <span className="dome-diff-note">
            {t('chat.shell_truncated', { defaultValue: 'Output truncated — full transcript saved to disk.' })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
