export interface MemoryPolicy {
  globalEnabled: boolean;
  conversationEnabled: boolean;
  enabled: boolean;
  conversationId: string;
}
export async function memoryPolicy(conversationId?: string, enabled?: boolean): Promise<MemoryPolicy> {
  const response = await window.electron.invoke('personality:memory-policy', {
    mode: enabled === undefined ? 'get' : 'set', conversationId: conversationId || undefined, enabled,
  }) as { success: boolean; data?: MemoryPolicy; error?: string };
  if (!response.success || !response.data) throw new Error(response.error || 'Memory settings are unavailable');
  if (enabled !== undefined) window.dispatchEvent(new Event('dome:memory-policy-changed'));
  return response.data;
}
export async function readContextDocument(filename: string): Promise<{ content: string; revision: string }> {
  const response = await window.electron.invoke('personality:read-document', filename) as {
    success: boolean; data?: { content: string; revision: string }; error?: string;
  };
  if (!response.success || !response.data) throw new Error(response.error || 'Context file is unavailable');
  return response.data;
}
