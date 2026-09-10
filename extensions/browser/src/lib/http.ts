import { BASE_URL } from './protocol';
import type { ContactDraft, NoteSummary, ProjectSummary } from './protocol';

export type NoteDetail = {
  id: string;
  title: string;
  projectId: string;
  markdown: string;
  updatedAt: number;
  revision?: string;
  domeLink?: string;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; conflict?: boolean; note?: NoteDetail };

export type CaptureResult = {
  id: string;
  title: string;
  url: string;
  reused?: boolean;
  mediaKind?: string;
  domeLink: string;
};

export type PairResult = { token: string; clientId: string };

export type HttpRequest = {
  path: string;
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function request<T>(opts: HttpRequest): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${opts.path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return { success: false, error: 'Dome is not open. Launch the desktop app and try again.' };
  }
  let payload: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { success: false, error: 'Unexpected response from Dome' };
    }
  }
  if (!res.ok || payload.success === false) {
    return {
      success: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
      conflict: payload.conflict === true,
      note: payload.note as NoteDetail | undefined,
    };
  }
  return { success: true, data: payload.data as T };
}

export function pair(code: string, clientName: string) {
  return request<PairResult>({ path: '/v1/pair', method: 'POST', body: { code, clientName } });
}

export function health() {
  return request<{ ok: boolean; version: number; port: number }>({ path: '/v1/health' });
}

export function getContext(token: string) {
  return request<{ projectId: string; projectName: string; projects: ProjectSummary[] }>({
    path: '/v1/context',
    token,
  });
}

export function listNotes(token: string, projectId: string) {
  return request<{ notes: NoteSummary[] }>({
    path: `/v1/notes?projectId=${encodeURIComponent(projectId)}`,
    token,
  });
}

export function getNote(token: string, id: string) {
  return request<NoteDetail>({ path: `/v1/notes/${id}`, token });
}

export function createNote(token: string, body: { projectId: string; title: string; markdown?: string }) {
  return request<NoteDetail>({ path: '/v1/notes', method: 'POST', token, body });
}

export function updateNote(
  token: string,
  id: string,
  body: { markdown: string; expectedUpdatedAt: number; expectedRevision?: string; title?: string },
) {
  return request<NoteDetail>({ path: `/v1/notes/${id}`, method: 'PUT', token, body });
}

export function appendSelection(
  token: string,
  id: string,
  body: { text: string; title?: string; url: string; expectedUpdatedAt: number; capturedAt?: number },
) {
  return request<NoteDetail>({ path: `/v1/notes/${id}/append`, method: 'POST', token, body });
}

export function saveContact(token: string, body: ContactDraft & { projectId: string }) {
  return request<{ person: { id: string; displayName: string } }>({
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
  return request<CaptureResult>({ path: '/v1/capture-url', method: 'POST', token, body });
}

export function cancelMany(token: string, streamId: string) {
  return request<{ cancelled: boolean }>({
    path: '/v1/ai/cancel',
    method: 'POST',
    token,
    body: { streamId },
  });
}

export type ManyStreamBody = {
  action: 'summarize' | 'key_ideas' | 'ask';
  text: string;
  prompt?: string;
  url?: string;
  title?: string;
  streamId?: string;
};

export async function streamManyHttp(
  token: string,
  body: ManyStreamBody,
  onEvent: (event: { type: string; text?: string; error?: string; streamId?: string }) => void,
): Promise<ApiResult<{ text: string }>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { success: false, error: 'Dome is not open. Launch the desktop app and try again.' };
  }
  if (!res.ok || !res.body) {
    return { success: false, error: `AI request failed (${res.status})` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6)) as {
          type?: string;
          text?: string;
          error?: string;
          streamId?: string;
        };
        if (event.type) onEvent({ type: event.type, text: event.text, error: event.error, streamId: event.streamId });
        if (event.type === 'delta' && event.text) full += event.text;
        if (event.type === 'error') return { success: false, error: event.error || 'AI error' };
      } catch {
        /* ignore malformed SSE */
      }
    }
  }
  return { success: true, data: { text: full } };
}
