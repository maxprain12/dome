export async function requestPlugin<T>(pluginId: string, method: string, params?: unknown): Promise<T> {
  const result = await window.electron.plugins.request(pluginId, method, params);
  if (!result.success) {
    throw new Error(result.error || 'Plugin request failed');
  }
  return result.data as T;
}
