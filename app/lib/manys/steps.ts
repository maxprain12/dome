import { useEffect, useRef, useState } from 'react';
import { request } from './api';

export interface ManyStepRow {
  sequence: number;
  task_id: string | null;
  data: { tool: string; operation: string | null; host: string | null; phase: 'start' | 'end'; ok: boolean | null };
}

/** One tool call as a person follows it: started, then finished well or not. */
export interface ManyStep { id: string; tool: string; operation: string | null; host: string | null; done: boolean; ok: boolean | null }

const KEEP = 12;
const POLL_MS = 2000;

/** Folds start/end events into one entry per call. Ends are matched to the latest open start of the same tool. */
export function foldSteps(current: ManyStep[], rows: ManyStepRow[]): ManyStep[] {
  const next = [...current];
  for (const row of rows) {
    const { tool, operation, host, phase, ok } = row.data;
    if (phase === 'start') {
      next.push({ id: String(row.sequence), tool, operation, host, done: false, ok: null });
      continue;
    }
    let index = -1;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (!next[i].done && next[i].tool === tool) { index = i; break; }
    }
    if (index >= 0) next[index] = { ...next[index], done: true, ok };
    else next.push({ id: String(row.sequence), tool, operation, host, done: true, ok });
  }
  return next.slice(-KEEP);
}

/** Follows what a Many is doing while it works. Progress is optional: errors are ignored. */
export function useManySteps(manyId: string, active: boolean): ManyStep[] {
  const [steps, setSteps] = useState<ManyStep[]>([]);
  const cursor = useRef<number | null>(null);

  useEffect(() => {
    cursor.current = null;
    setSteps([]);
  }, [manyId]);

  useEffect(() => {
    if (!active || !manyId) {
      cursor.current = null;
      setSteps([]);
      return undefined;
    }
    let stopped = false;
    const poll = async () => {
      try {
        const after = cursor.current;
        const path = `/${manyId}/steps${after === null ? '' : `?after=${after}`}`;
        const result = await request<{ steps?: ManyStepRow[] }>(path);
        if (stopped || !Array.isArray(result?.steps) || result.steps.length === 0) return;
        const rows = result.steps;
        cursor.current = rows[rows.length - 1].sequence;
        setSteps((current) => foldSteps(after === null ? [] : current, rows));
      } catch {
        /* progress is optional */
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [manyId, active]);

  return steps;
}

const LABELS: Record<string, string> = {
  vault_search: 'searchLibrary',
  vault_read: 'readLibrary',
  vault_write: 'writeLibrary',
  vault_blob: 'readFile',
  vault_deliver_file: 'deliverFile',
  web_research: 'webResearch',
  computer_read: 'lookComputer',
  propose_action: 'proposeAction',
  execute_approved: 'runApproved',
  credentials_list: 'credentials',
  skill_read: 'skill',
  mcp_tools: 'mcpTools',
  mcp_call: 'mcpCall',
};

/** i18n key under `manys.steps` for a tool, with a generic fallback for tools added later. */
export function stepKey(tool: string): string {
  return LABELS[tool] ?? 'generic';
}

/** The part of a step worth naming to a person: a skill name or the MCP tool, never a server id. */
export function stepDetail(step: Pick<ManyStep, 'tool' | 'operation'>): string {
  if (!step.operation) return '';
  return step.tool === 'mcp_call' ? step.operation.slice(step.operation.lastIndexOf('/') + 1) : step.operation;
}
