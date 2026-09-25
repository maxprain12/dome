import { useCallback, useEffect, useState } from 'react';

export type SttProvider = 'openai' | 'groq' | 'custom';
export type LiveEngine = 'realtime' | 'chunks';

export const GROQ_ORIGIN = 'https://api.groq.com';
export const MODEL_GROQ_TURBO = 'whisper-large-v3-turbo';
export const MODEL_GROQ_LARGE = 'whisper-large-v3';
const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';

export interface TranscriptionForm {
  sttProvider: SttProvider;
  model: string;
  language: string;
  apiBaseUrl: string;
  prompt: string;
  dedicatedKey: string;
  groqKey: string;
  globalShortcut: string;
  shortcutEnabled: boolean;
  pauseThresholdSec: string;
  summaryModel: string;
  autoSummary: boolean;
  chunkSec: string;
  liveTranscriptDefault: boolean;
  liveEngine: LiveEngine;
}

export interface TranscriptionKeyStatus {
  hasDedicatedKey: boolean;
  hasGroqKey: boolean;
}

const INITIAL_FORM: TranscriptionForm = {
  sttProvider: 'openai',
  model: 'whisper-1',
  language: '',
  apiBaseUrl: '',
  prompt: '',
  dedicatedKey: '',
  groqKey: '',
  globalShortcut: '',
  shortcutEnabled: false,
  pauseThresholdSec: '1.35',
  summaryModel: DEFAULT_SUMMARY_MODEL,
  autoSummary: false,
  chunkSec: '4',
  liveTranscriptDefault: true,
  liveEngine: 'realtime',
};

type SettingsPatch = Parameters<Window['electron']['transcription']['setSettings']>[0];

function toProvider(value: unknown): SttProvider {
  return value === 'groq' || value === 'custom' ? value : 'openai';
}

function toPatch(form: TranscriptionForm): SettingsPatch {
  return {
    sttProvider: form.sttProvider,
    model: form.model,
    language: form.language.trim() || null,
    globalShortcut: form.globalShortcut.trim(),
    globalShortcutEnabled: form.shortcutEnabled,
    apiBaseUrl: form.apiBaseUrl.trim(),
    prompt: form.prompt.trim(),
    pauseThresholdSec: form.pauseThresholdSec.trim() ? Number.parseFloat(form.pauseThresholdSec) : null,
    ...(form.dedicatedKey.trim() ? { dedicatedOpenaiKey: form.dedicatedKey.trim() } : {}),
    ...(form.groqKey.trim() ? { groqApiKey: form.groqKey.trim() } : {}),
    summaryModel: form.summaryModel.trim() || DEFAULT_SUMMARY_MODEL,
    autoSummary: form.autoSummary,
    chunkSec: form.chunkSec.trim() ? Number.parseInt(form.chunkSec, 10) : 4,
    liveTranscriptDefault: form.liveTranscriptDefault,
    liveEngine: form.liveEngine,
  };
}

/** Load / edit / persist the transcription settings (Settings → AI → Transcription). */
export function useTranscriptionSettingsForm() {
  const [form, setForm] = useState<TranscriptionForm>(INITIAL_FORM);
  const [keys, setKeys] = useState<TranscriptionKeyStatus>({ hasDedicatedKey: false, hasGroqKey: false });
  const [saved, setSaved] = useState(false);

  const update = useCallback((patch: Partial<TranscriptionForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const load = useCallback(async () => {
    const res = await globalThis.window?.electron?.transcription?.getSettings();
    if (!res?.success || !res.data) return;
    const d = res.data;
    setKeys({ hasDedicatedKey: !!d.hasOpenAIKey, hasGroqKey: !!d.hasGroqKey });
    setForm((prev) => ({
      ...prev,
      sttProvider: toProvider(d.sttProvider),
      model: d.model || 'whisper-1',
      language: d.language || '',
      apiBaseUrl: d.apiBaseUrl || '',
      prompt: d.prompt || '',
      globalShortcut: d.globalShortcut || '',
      shortcutEnabled: !!d.globalShortcutEnabled,
      pauseThresholdSec: d.pauseThresholdSec == null ? prev.pauseThresholdSec : String(d.pauseThresholdSec),
      summaryModel: d.summaryModel || prev.summaryModel,
      autoSummary: typeof d.autoSummary === 'boolean' ? d.autoSummary : prev.autoSummary,
      chunkSec: d.chunkSec == null ? prev.chunkSec : String(d.chunkSec),
      liveTranscriptDefault: typeof d.liveTranscriptDefault === 'boolean' ? d.liveTranscriptDefault : prev.liveTranscriptDefault,
      liveEngine: d.liveEngine === 'chunks' ? 'chunks' : 'realtime',
      dedicatedKey: '',
      groqKey: '',
    }));
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const persist = useCallback(async (patch: SettingsPatch) => {
    const api = globalThis.window?.electron?.transcription;
    if (!api?.setSettings) return false;
    setSaved(false);
    await api.setSettings(patch);
    setSaved(true);
    await load();
    return true;
  }, [load]);

  const save = useCallback(() => persist(toPatch(form)), [persist, form]);

  return { form, keys, saved, setSaved, update, save, persist };
}

export type TranscriptionSettingsFormApi = ReturnType<typeof useTranscriptionSettingsForm>;
