export type SessionState = {
  token: string | null;
  projectId: string | null;
  noteId: string | null;
  clientName: string;
};

const KEY = 'dome.session';

const defaults: SessionState = {
  token: null,
  projectId: null,
  noteId: null,
  clientName: 'Browser',
};

export async function loadSession(): Promise<SessionState> {
  const stored = await browser.storage.local.get(KEY);
  const raw = stored[KEY];
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const rec = raw as Partial<SessionState>;
  return {
    token: typeof rec.token === 'string' ? rec.token : null,
    projectId: typeof rec.projectId === 'string' ? rec.projectId : null,
    noteId: typeof rec.noteId === 'string' ? rec.noteId : null,
    clientName: typeof rec.clientName === 'string' ? rec.clientName : 'Browser',
  };
}

export async function saveSession(next: SessionState): Promise<void> {
  await browser.storage.local.set({ [KEY]: next });
}
