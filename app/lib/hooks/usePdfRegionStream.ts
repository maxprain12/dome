/**
 * Streams PDF region Q&A through the configured cloud LLM (Electron IPC).
 */

export async function runPdfRegionStream(options: {
  imageDataUrl: string;
  question: string;
  onChunk: (text: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { imageDataUrl, question, onChunk } = options;
  const cl = typeof window !== 'undefined' ? window.electron?.db?.cloudLlm : undefined;
  if (!cl?.pdfRegionStream) {
    return { ok: false, error: 'cloud_unavailable' };
  }

  const streamId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pdf-region-${Date.now()}`;

  let unChunk: (() => void) | null = null;
  let unDone: (() => void) | null = null;

  const cleanup = () => {
    try {
      unChunk?.();
    } catch {
      /* noop */
    }
    try {
      unDone?.();
    } catch {
      /* noop */
    }
    unChunk = null;
    unDone = null;
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    unChunk = cl.onStreamChunk((d: { streamId: string; text: string }) => {
      if (d.streamId === streamId) onChunk(d.text);
    });
    unDone = cl.onStreamDone((d: { streamId: string; error?: string }) => {
      if (d.streamId !== streamId) return;
      if (d.error) finish({ ok: false, error: d.error });
      else finish({ ok: true });
    });

    void cl
      .pdfRegionStream({
        streamId,
        imageDataUrl,
        question: question.trim(),
      })
      .then((res) => {
        if (res && typeof res === 'object' && 'success' in res && res.success === false) {
          finish({ ok: false, error: (res as { error?: string }).error || 'stream failed' });
        }
      })
      .catch((e) => {
        finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
  });
}
