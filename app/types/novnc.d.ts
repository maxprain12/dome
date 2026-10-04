// noVNC ships untyped ES modules. Only the surface the Many's desktop uses is declared.
declare module '@novnc/novnc' {
  interface RfbOptions {
    shared?: boolean;
    credentials?: { username?: string; password?: string; target?: string };
    wsProtocols?: string[];
  }
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RfbOptions);
    viewOnly: boolean;
    focusOnClick: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    background: string;
    showDotCursor: boolean;
    disconnect(): void;
    focus(options?: FocusOptions): void;
    blur(): void;
    clipboardPasteFrom(text: string): void;
  }
}
