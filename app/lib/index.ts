// Stub utilities for Docmost compatibility

export function svgStringToFile(svgString: string, fileName: string): File {
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  return new File([blob], fileName, { type: "image/svg+xml" });
}

export function extractPageSlugId(url: string): string | null {
  const match = url.match(/\/([a-zA-Z0-9]+)(?:\?|#|$)/);
  return match ? (match[1] ?? null) : null;
}

export function serialize(_data: unknown): string {
  return JSON.stringify(_data);
}
