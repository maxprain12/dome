/** Deterministic non-cryptographic hash for stable React list keys. */
export function stableStringHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(33, h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
