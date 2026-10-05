/**
 * Tool results are the bulk of a long task's request: a page snapshot or a command's output each take
 * thousands of characters, and the model only needs the latest ones to act. This keeps the most recent
 * results whole and replaces the text of older large ones with a short note, in the request about to
 * be sent (the saved session is untouched). Images are not text and are handled elsewhere.
 */
type Slot = { read: () => string; write: (text: string) => void };

const OMITTED = (length: number) => `[earlier tool result omitted: ${length} characters]`;

function slotsOf(payload: unknown): Slot[] {
  const slots: Slot[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    // Chat completions: { role: 'tool', content }. Responses: { type: 'function_call_output', output }.
    // Anthropic: { type: 'tool_result', content } with a string or text blocks.
    if (node.role === 'tool' || node.type === 'tool_result') {
      if (typeof node.content === 'string') slots.push({ read: () => node.content as string, write: (text) => { node.content = text; } });
      else if (Array.isArray(node.content)) {
        for (const part of node.content as Record<string, unknown>[]) {
          if (part && part.type === 'text' && typeof part.text === 'string') slots.push({ read: () => part.text as string, write: (text) => { part.text = text; } });
        }
      }
      return;
    }
    if (node.type === 'function_call_output' && typeof node.output === 'string') {
      slots.push({ read: () => node.output as string, write: (text) => { node.output = text; } });
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(payload);
  return slots;
}

/** Returns how many results were shortened. */
export function shrinkOldToolResults(payload: unknown, options: { keep?: number; max?: number } = {}): number {
  const keep = options.keep ?? 2;
  const max = options.max ?? 1200;
  const slots = slotsOf(payload);
  let shortened = 0;
  for (const slot of slots.slice(0, Math.max(0, slots.length - keep))) {
    const text = slot.read();
    if (text.length > max) {
      slot.write(OMITTED(text.length));
      shortened += 1;
    }
  }
  return shortened;
}
