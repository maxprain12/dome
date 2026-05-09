/** Stable key for a consecutive message group (each message has its own id). */
export function stableMessageGroupKey(group: { id: string }[]): string {
  if (!group.length) return 'empty';
  return group.map((m) => m.id).join('\u241f');
}
