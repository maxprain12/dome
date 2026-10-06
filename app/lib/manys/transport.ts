import type { CloudModelCatalog, CloudProviderOption, ModelSelection } from './api';
import { ipcTransport } from './ipcTransport';
import type { ManyEvent } from './liveRuns';

/**
 * The WebSocket surface noVNC reads and writes. noVNC takes a ready-made channel instead of a URL,
 * which is how the desktop can run where the socket and its credentials belong to someone else
 * (the main process on the desktop app, the cookie session in a browser).
 */
export interface DesktopSocket {
  binaryType: string;
  readonly protocol: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: ArrayBufferView | ArrayBuffer): void;
  close(): void;
}

/** Observers of one desktop channel. They run in addition to whatever is assigned to the socket's own `on*` properties. */
export interface DesktopHandlers {
  onOpen?: () => void;
  onClose?: (code: number) => void;
  onError?: (error: unknown) => void;
  /** A binary frame: the VNC stream. */
  onMessage?: (data: ArrayBuffer) => void;
  /** A text frame: the computer's own words (the wheel was taken back), as the raw string it sent. */
  onNotice?: (text: string) => void;
}

/**
 * Everything the cloud Manys UI needs from a server. The desktop app reaches it through Electron IPC
 * (the main process holds the session token); a browser reaches it over HTTP with a cookie session.
 * Errors are thrown as `Error(code)` where `code` is the server's `{ error }` code.
 */
export interface ManysTransport {
  /** A call to `/api/v1/manys{path}`. Resolves with the parsed body (`{}` when it is empty). */
  request<T>(path: string, method?: string, body?: Record<string, unknown>): Promise<T>;
  /** Saved API-key providers whose base URL can run outside this machine. Names only, never keys. */
  listProviders(): Promise<CloudProviderOption[]>;
  /** The models a Many can run on: the plan's, and those of each saved provider a worker can reach. */
  listModels(): Promise<CloudModelCatalog>;
  /** Changes the model of one Many. It applies from its next task. */
  setModel(id: string, selection: ModelSelection): Promise<void>;
  /** The live feed. Returns the unsubscribe function. */
  subscribeEvents(onEvent: (event: ManyEvent) => void): () => void;
  /** A live socket to a Many's desktop. */
  openDesktop(manyId: string, handlers: DesktopHandlers): DesktopSocket;
}

let current: ManysTransport = ipcTransport;

/** Replaces how this page talks to the server. The default is Electron IPC. */
export function setManysTransport(transport: ManysTransport): void {
  current = transport;
}

export function getManysTransport(): ManysTransport {
  return current;
}
