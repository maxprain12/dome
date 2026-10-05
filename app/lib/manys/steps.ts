import { useEffect, useMemo, useRef } from 'react';
import { request } from './api';
import { useLiveRuns, type LiveRuns } from './liveRuns';

/** One tool call as a person follows it: started, then finished well or not. */
export interface ManyStep { id: string; tool: string; operation: string | null; host: string | null; done: boolean; ok: boolean | null }

const KEEP = 12;

/** The most recent tool calls of one Many across its turns, oldest first. */
export function stepsOf(runs: LiveRuns, manyId: string): ManyStep[] {
  return Object.values(runs)
    .filter((run) => run.manyId === manyId)
    .sort((a, b) => a.touched - b.touched)
    .flatMap((run) => run.items.flatMap((item) => (item.kind === 'tool'
      ? [{ id: item.callId, tool: item.tool, operation: item.operation, host: item.host, done: item.done, ok: item.ok }]
      : [])))
    .slice(-KEEP);
}

/**
 * What a Many is doing, from the live feed. The feed only knows what happens while the window is
 * open, so the recent history is read once; tasks in flight stay open for the feed to continue.
 */
export function useManySteps(manyId: string, inFlight: string[] = []): ManyStep[] {
  const runs = useLiveRuns((state) => state.runs);
  const flight = useRef(inFlight);
  flight.current = inFlight;
  useEffect(() => {
    if (!manyId) return undefined;
    let stopped = false;
    void request<{ steps?: { sequence: number; task_id: string | null; data: Record<string, unknown> }[] }>(`/${manyId}/steps`)
      .then((result) => {
        if (!stopped && Array.isArray(result?.steps)) useLiveRuns.getState().hydrate(result.steps, manyId, flight.current);
      })
      .catch(() => { /* progress is optional */ });
    return () => { stopped = true; };
  }, [manyId]);
  return useMemo(() => stepsOf(runs, manyId), [runs, manyId]);
}

const LABELS: Record<string, string> = {
  vault_search: 'searchLibrary',
  vault_read: 'readLibrary',
  vault_write: 'writeLibrary',
  vault_blob: 'readFile',
  vault_deliver_file: 'deliverFile',
  web_research: 'webResearch',
  computer_read: 'lookComputer',
  computer_snapshot: 'lookComputer',
  computer_screenshot: 'lookComputer',
  computer_navigate: 'computerNavigate',
  computer_click: 'computerClick',
  computer_type: 'computerType',
  computer_key: 'computerKey',
  computer_scroll: 'computerScroll',
  computer_files_list: 'computerFiles',
  computer_files_read: 'computerFiles',
  computer_files_write: 'computerWriteFile',
  computer_exec: 'computerExec',
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
