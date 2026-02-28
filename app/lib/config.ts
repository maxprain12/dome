// Stub: Docmost config compatibility

export function getFileUrl(attachmentId: string, _fileName?: string): string {
  // In Dome, files are accessed via dome-resource:// scheme or IPC
  return `dome-resource://${attachmentId}`;
}

export const API_BASE_URL = "";
