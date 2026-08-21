import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileEditIcon, TerminalIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeText } from '@/components/shared/SafeText';
import { cn } from '@/lib/utils';

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

  const hunks = useMemo(() => diff.diff_hunks ?? [], [diff.diff_hunks]);
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
    <div className="overflow-hidden rounded-md border border-border bg-muted">
      <div className="flex min-w-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <HugeiconsIcon icon={FileEditIcon} size={13} className="shrink-0 text-muted-foreground" />
        <SafeText className="min-w-0 flex-1 font-mono text-[11.5px] text-foreground" title={diff.file_path}>
          {fileName || diff.file_path || ''}
        </SafeText>
        {diff.created ? (
          <Badge variant="mint" className="h-4 shrink-0 px-1.5 text-[10px]">
            {t('chat.diff_created', { defaultValue: 'new' })}
          </Badge>
        ) : null}
        {(diff.lines_added ?? 0) > 0 ? (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-success">+{diff.lines_added}</span>
        ) : null}
        {(diff.lines_removed ?? 0) > 0 ? (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-destructive">−{diff.lines_removed}</span>
        ) : null}
      </div>

      {diff.unchanged ? (
        <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">
          {t('chat.diff_unchanged', { defaultValue: 'File already had this content — nothing written.' })}
        </p>
      ) : (
        <div className="max-h-80 divide-y divide-border overflow-auto">
          {visibleHunks.map((hunk) => (
            <div key={`${hunk.oldStart}:${hunk.newStart}`}>
              <div className="bg-muted-foreground/8 px-2.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>
              {hunk.lines.map((line, i) => (
                <div
                  key={`${hunk.newStart}:${i}:${line.type}`}
                  className={cn(
                    'flex items-start gap-0 whitespace-pre font-mono text-[11.5px] leading-[1.55]',
                    line.type === '+' && 'bg-success/14',
                    line.type === '-' && 'bg-destructive/12',
                  )}
                >
                  <span className="w-[3.2em] shrink-0 select-none pr-1.5 text-right text-muted-foreground opacity-70">
                    {line.oldNum ?? ''}
                  </span>
                  <span className="w-[3.2em] shrink-0 select-none pr-1.5 text-right text-muted-foreground opacity-70">
                    {line.newNum ?? ''}
                  </span>
                  <span
                    className={cn(
                      'w-[1.2em] shrink-0 select-none text-center',
                      line.type === '+' && 'text-success',
                      line.type === '-' && 'text-destructive',
                    )}
                  >
                    {line.type === ' ' ? '' : line.type}
                  </span>
                  <span className="min-w-0 flex-1 pr-2.5 text-foreground">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {collapsible || diff.diff_truncated ? (
        <div className="flex items-center gap-2 border-t border-border px-2.5 py-1">
          {collapsible ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)}>
              {expanded
                ? t('chat.diff_collapse', { defaultValue: 'Show less' })
                : t('chat.diff_expand', { defaultValue: 'Show full diff' })}
            </Button>
          ) : null}
          {diff.diff_truncated ? (
            <span className="text-[11px] text-muted-foreground">
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
    <div className="overflow-hidden rounded-md border border-border bg-muted">
      <div className="flex min-w-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <HugeiconsIcon icon={TerminalIcon} size={13} className="shrink-0 text-muted-foreground" />
        <SafeText className="min-w-0 flex-1 font-mono text-[11.5px] text-foreground" title={shell.command}>
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
        <pre className="m-0 max-h-[280px] overflow-auto whitespace-pre px-2.5 py-2 font-mono text-[11.5px] leading-normal text-foreground">
          {shell.output}
        </pre>
      ) : (
        <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">
          {t('chat.shell_no_output', { defaultValue: 'No output.' })}
        </p>
      )}
      {shell.truncated ? (
        <div className="flex items-center gap-2 border-t border-border px-2.5 py-1">
          <span className="text-[11px] text-muted-foreground">
            {t('chat.shell_truncated', { defaultValue: 'Output truncated — full transcript saved to disk.' })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
