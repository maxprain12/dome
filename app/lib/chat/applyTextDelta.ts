/**
 * Fold a streaming text payload into the assistant bubble.
 *
 * Some providers emit true token deltas; others repeat the accumulated
 * string on every event. Treating the latter as a delta concatenates the
 * whole reply onto itself (the "output printed twice" bug).
 */
export function applyTextDelta(current: string, delta: string): string {
  if (!delta) return current;
  if (!current) return delta;
  if (delta === current) return current;
  if (delta.startsWith(current)) return delta;
  if (current.startsWith(delta)) return current;
  return `${current}${delta}`;
}

/** Prefer the live bubble when the run snapshot concatenated the reply onto itself. */
export function pickTerminalAssistantText(snapshot: string | undefined, live: string | undefined): string {
  const snap = (snapshot ?? '').trim();
  const stream = (live ?? '').trim();
  if (!snap) return stream;
  if (!stream) return snap;
  if (snap === stream) return snap;
  if (stream.startsWith(snap)) return stream;
  if (snap.startsWith(stream)) {
    const rest = snap.slice(stream.length).trim();
    if (!rest || rest === stream) return stream;
  }
  return snap.length >= stream.length ? snap : stream;
}
