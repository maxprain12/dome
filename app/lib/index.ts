// Stub utilities for Docmost compatibility

export function extractPageSlugId(url: string): string | null {
  const match = url.match(/\/([a-zA-Z0-9]+)(?:\?|#|$)/);
  return match ? (match[1] ?? null) : null;
}
