/** Coalesce rapid form edits and serialize writes, including the final edit on close. */
export function createArtifactSaveQueue(
  save: (data: Record<string, unknown>) => Promise<void>,
  status: (busy: boolean, error: string | null) => void,
  delay = 300,
) {
  let pending: Record<string, unknown> | null = null;
  let active: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async (): Promise<boolean> => {
    clearTimeout(timer);
    if (active) { const ok = await active; return pending ? flush() : ok; }
    if (!pending) return true;
    const data = pending;
    pending = null;
    status(true, null);
    active = save(data).then(() => { status(false, null); return true; }, (error: unknown) => {
      status(false, error instanceof Error ? error.message : String(error));
      return false;
    });
    const ok = await active;
    active = null;
    if (!ok) { pending ??= data; return false; }
    return pending ? flush() : true;
  };
  return {
    isPending: () => active !== null || pending !== null,
    enqueue(data: Record<string, unknown>) {
      pending = data;
      clearTimeout(timer);
      status(true, null);
      timer = setTimeout(() => { void flush(); }, delay);
    },
    flush,
  };
}
