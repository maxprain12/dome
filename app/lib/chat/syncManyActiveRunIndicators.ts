import { getActiveRunBySession, type PersistentRun } from '@/lib/automations/api';
import { useManyStore, type SessionRunPhase } from '@/lib/store/useManyStore';

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_approval']);
const MAX_SESSIONS = 20;

function runToPhase(run: PersistentRun): SessionRunPhase {
  return run.outputText?.trim() ? 'streaming' : 'thinking';
}

/** Resolve active runs for visible sidebar sessions (for history spinner indicators). */
export async function syncManyActiveRunIndicators(sessionIds: string[]): Promise<void> {
  const ids = [...new Set(sessionIds.filter(Boolean))].slice(0, MAX_SESSIONS);
  if (ids.length === 0) return;

  const setSessionRunState = useManyStore.getState().setSessionRunState;
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const run = await getActiveRunBySession(id);
        return { id, run };
      } catch {
        return { id, run: null as PersistentRun | null };
      }
    }),
  );

  for (const { id, run } of results) {
    if (run && ACTIVE_STATUSES.has(run.status)) {
      setSessionRunState(id, runToPhase(run));
    } else {
      setSessionRunState(id, null);
    }
  }
}
