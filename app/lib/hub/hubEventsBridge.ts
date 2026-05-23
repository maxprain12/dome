import { installHubEventsBridge } from '@/lib/hub/hubEvents';

let started = false;

/** Call once at app bootstrap so main-process hub broadcasts refresh the renderer. */
export function ensureHubEventsBridge() {
  if (started) return;
  started = true;
  installHubEventsBridge();
}
