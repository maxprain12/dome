// Stub: Dome uses IPC instead of server API calls

export async function uploadFile(_file: File, _pageId: string): Promise<{ id: string; fileName: string }> {
  throw new Error("uploadFile not supported in Dome - use window.electron.resource.import");
}

export async function getPageById(_pageId: string): Promise<null> {
  return null;
}

export async function savePage(_data: unknown): Promise<void> {
  // no-op stub
}
