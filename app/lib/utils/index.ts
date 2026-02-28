// Barrel export for utils
export * from './formatting';
export * from './validation';
export * from './paths';

// Docmost compatibility stubs
export function svgStringToFile(svgString: string, fileName: string): File {
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  return new File([blob], fileName, { type: "image/svg+xml" });
}

export function decodeBase64ToSvgString(base64: string): string {
  try {
    return atob(base64);
  } catch {
    return base64;
  }
}
