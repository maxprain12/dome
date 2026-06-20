/**
 * Race an async IPC call against a timeout so the renderer never waits forever.
 */
export async function invokeWithTimeout<T>(
  invoke: () => Promise<T>,
  timeoutMs = 30_000,
  timeoutMessage = 'Request timed out',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([invoke(), timeoutPromise]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
