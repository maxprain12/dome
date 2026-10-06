import { getManysTransport, type DesktopSocket } from './transport';

/** The person's side of the desktop. `onNotice` carries the computer's own words (the wheel was taken back). */
export function openDesktopSocket(manyId: string, onNotice: (message: Record<string, unknown>) => void): DesktopSocket {
  return getManysTransport().openDesktop(manyId, {
    onNotice: (text) => {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) onNotice(parsed as Record<string, unknown>);
      } catch {
        /* not something to act on */
      }
    },
  });
}
