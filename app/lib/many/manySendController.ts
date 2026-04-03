/**
 * Bridge so voice assistant (or other modules) can send messages to Many
 * while ManyPanel registers the live implementation.
 */

export type ManySendOptions = {
  /** Read assistant reply with TTS after the run completes */
  autoSpeak?: boolean;
  /** Open the Many panel before sending (default true for voice flows) */
  openPanel?: boolean;
  /** User language code for voice selection (e.g. 'en', 'es', 'fr', 'pt') */
  voiceLanguage?: string;
};

export type ManyMessageSender = (text: string, options?: ManySendOptions) => Promise<void>;

let registeredSender: ManyMessageSender | null = null;

export function registerManyMessageSender(fn: ManyMessageSender | null): void {
  registeredSender = fn;
}

export async function sendManyUserMessage(text: string, options?: ManySendOptions): Promise<void> {
  if (!registeredSender) {
    throw new Error('Many no está listo. Abre el panel Many una vez o recarga la app.');
  }
  await registeredSender(text.trim(), options);
}

export function isManyMessageSenderRegistered(): boolean {
  return registeredSender !== null;
}
