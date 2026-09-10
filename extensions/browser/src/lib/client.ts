import type { ContactDraft } from './protocol';
import type { ApiResult, CaptureResult, ManyStreamBody, NoteDetail, PairResult } from './http';

export type { ApiResult, CaptureResult, NoteDetail, PairResult } from './http';

type HttpMessage = {
  type: 'DOME_HTTP';
  path: string;
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function send<T>(message: HttpMessage): Promise<ApiResult<T>> {
  try {
    return (await browser.runtime.sendMessage(message)) as ApiResult<T>;
  } catch {
    return { success: false, error: 'Could not reach the Dome extension background page.' };
  }
}

export function pair(code: string, clientName: string) {
  return send<PairResult>({
    type: 'DOME_HTTP',
    path: '/v1/pair',
    method: 'POST',
    body: { code, clientName },
  });
}

export function health() {
  return send<{ ok: boolean; version: number; port: number }>({ type: 'DOME_HTTP', path: '/v1/health' });
}

export function getContext(token: string) {
  return send<{ projectId: string; projectName: string; projects: Array<{ id: string; name: string }> }>({
    type: 'DOME_HTTP',
    path: '/v1/context',
    token,
  });
}

export function listNotes(token: string, projectId: string) {
  return send<{ notes: Array<{ id: string; title: string; updatedAt: number }> }>({
    type: 'DOME_HTTP',
    path: `/v1/notes?projectId=${encodeURIComponent(projectId)}`,
    token,
  });
}

export function getNote(token: string, id: string) {
  return send<NoteDetail>({ type: 'DOME_HTTP', path: `/v1/notes/${id}`, token });
}

export function createNote(token: string, body: { projectId: string; title: string; markdown?: string }) {
  return send<NoteDetail>({ type: 'DOME_HTTP', path: '/v1/notes', method: 'POST', token, body });
}

export function updateNote(
  token: string,
  id: string,
  body: { markdown: string; expectedUpdatedAt: number; expectedRevision?: string; title?: string },
) {
  return send<NoteDetail>({ type: 'DOME_HTTP', path: `/v1/notes/${id}`, method: 'PUT', token, body });
}

export function appendSelection(
  token: string,
  id: string,
  body: { text: string; title?: string; url: string; expectedUpdatedAt: number; capturedAt?: number },
) {
  return send<NoteDetail>({ type: 'DOME_HTTP', path: `/v1/notes/${id}/append`, method: 'POST', token, body });
}

export function saveContact(token: string, body: ContactDraft & { projectId: string }) {
  return send<{ person: { id: string; displayName: string } }>({
    type: 'DOME_HTTP',
    path: '/v1/contact',
    method: 'POST',
    token,
    body,
  });
}

export function captureUrl(
  token: string,
  body: { projectId: string; url: string; title: string; readableText?: string; mediaKind?: string },
) {
  return send<CaptureResult>({ type: 'DOME_HTTP', path: '/v1/capture-url', method: 'POST', token, body });
}

export function cancelMany(token: string, streamId: string) {
  return send<{ cancelled: boolean }>({
    type: 'DOME_HTTP',
    path: '/v1/ai/cancel',
    method: 'POST',
    token,
    body: { streamId },
  });
}

export async function streamMany(
  token: string,
  body: ManyStreamBody,
  onDelta: (text: string) => void,
): Promise<ApiResult<{ text: string }>> {
  return new Promise((resolve) => {
    const port = browser.runtime.connect({ name: 'dome-ai' });
    let full = '';
    let settled = false;
    const finish = (result: ApiResult<{ text: string }>) => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch {
        /* already closed */
      }
      resolve(result);
    };
    port.onMessage.addListener((event: { type?: string; text?: string; error?: string }) => {
      if (event.type === 'delta' && event.text) {
        full += event.text;
        onDelta(event.text);
      }
      if (event.type === 'error') finish({ success: false, error: event.error || 'AI error' });
      if (event.type === 'done') finish({ success: true, data: { text: full } });
    });
    port.onDisconnect.addListener(() => {
      finish(
        full
          ? { success: true, data: { text: full } }
          : { success: false, error: 'Many stream disconnected.' },
      );
    });
    port.postMessage({ token, body });
  });
}
