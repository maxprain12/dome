import { HugeiconsIcon } from '@hugeicons/react';
import {
  SecurityCheckIcon as ShieldCheck,
  ShieldEnergyIcon as ShieldAlert,
  SecurityBlockIcon as ShieldOff,
  SecurityIcon as ShieldQuestion,
} from '@hugeicons/core-free-icons';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/lib/store/useToastStore';
import type { ModelDefinition } from '@/lib/ai/models';
import type { ReactNode } from 'react';
import ModelSelector from './ModelSelector';

import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm font-medium text-foreground">{children}</p>;
}

type PermStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

const GROQ_ORIGIN = 'https://api.groq.com';
const MODEL_GROQ_TURBO = 'whisper-large-v3-turbo';
const MODEL_GROQ_LARGE = 'whisper-large-v3';

type SttProvider = 'openai' | 'groq' | 'custom';

export interface TranscriptionSettingsSectionsHandle {
  save: () => Promise<boolean>;
}

interface PermissionRowProps {
  label: string;
  status: PermStatus;
  onRequest: () => Promise<void>;
  onOpenPrefs?: () => void;
  loading: boolean;
  t: (key: string) => string;
}

function PermissionRow({ label, status, onRequest, onOpenPrefs, loading, t }: PermissionRowProps) {
  const statusConfig: Record<PermStatus, { icon: React.ReactNode; className: string; text: string }> = {
    granted: { icon: <HugeiconsIcon icon={ShieldCheck} className="size-4" />, className: 'text-[var(--success)]', text: t('settings.transcription.perm_granted') },
    denied: { icon: <HugeiconsIcon icon={ShieldOff} className="size-4" />, className: 'text-destructive', text: t('settings.transcription.perm_denied') },
    'not-determined': { icon: <HugeiconsIcon icon={ShieldQuestion} className="size-4" />, className: 'text-[var(--warning)]', text: t('settings.transcription.perm_not_determined') },
    restricted: { icon: <HugeiconsIcon icon={ShieldAlert} className="size-4" />, className: 'text-destructive', text: t('settings.transcription.perm_restricted') },
    unknown: { icon: <HugeiconsIcon icon={ShieldQuestion} className="size-4" />, className: 'text-muted-foreground', text: '—' },
  };
  const cfg = statusConfig[status];

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 ${cfg.className}`}>
          {cfg.icon}
        </span>
        <div className="min-w-0">
          <span className="text-sm font-medium block truncate text-[var(--foreground)]">
            {label}
          </span>
          <span className={`text-[11px] ${cfg.className}`}>
            {cfg.text}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status === 'denied' && onOpenPrefs && (
          <Button type="button"
  variant="outline"
  onClick={onOpenPrefs}
  className="!text-destructive !border-[var(--destructive)]"
  size="xs">
            {t('settings.transcription.perm_open_prefs')}
          </Button>
        )}
        {(status === 'not-determined' || status === 'unknown') && (
          <Button type="button"
  variant="outline"
  loading={loading}
  onClick={() => void onRequest()}
  size="xs">
            {t('settings.transcription.perm_request')}
          </Button>
        )}
      </div>
    </div>
  );
}

interface TranscriptionSettingsSectionsProps {
  summaryModels: ModelDefinition[];
  summaryModelsLoading?: boolean;
  /** When true, hide the internal save button (parent handles save). */
  embedded?: boolean;
}

const TranscriptionSettingsSections = forwardRef<
  TranscriptionSettingsSectionsHandle,
  TranscriptionSettingsSectionsProps
>(function TranscriptionSettingsSections(
  { summaryModels, summaryModelsLoading = false, embedded = false },
  ref,
) {
  const { t } = useTranslation();
  const [sttProvider, setSttProvider] = useState<SttProvider>('openai');
  const [model, setModel] = useState('whisper-1');
  const [language, setLanguage] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [dedicatedKey, setDedicatedKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [globalShortcut, setGlobalShortcut] = useState('');
  const [transcriptionShortcutEnabled, setTranscriptionShortcutEnabled] = useState(false);
  const [pauseThresholdSec, setPauseThresholdSec] = useState('1.35');
  const [hasDedicatedKey, setHasDedicatedKey] = useState(false);
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [micPerm, setMicPerm] = useState<PermStatus>('unknown');
  const [screenPerm, setScreenPerm] = useState<PermStatus>('unknown');
  const [permLoading, setPermLoading] = useState(false);
  const [summaryModel, setSummaryModel] = useState('gpt-4o-mini');
  const [autoSummary, setAutoSummary] = useState(false);
  const [chunkSec, setChunkSec] = useState('4');
  const [liveTranscriptDefault, setLiveTranscriptDefault] = useState(true);
  const isMac = window.electron?.isMac ?? false;

  const loadPermissions = useCallback(async () => {
    if (!window.electron?.transcription?.getPermissions) return;
    const res = await window.electron.transcription.getPermissions();
    if (res.success) {
      setMicPerm((res.mic as PermStatus) ?? 'unknown');
      setScreenPerm((res.screen as PermStatus) ?? 'unknown');
    }
  }, []);

  const load = useCallback(async () => {
    if (!window.electron?.transcription?.getSettings) return;
    const res = await window.electron.transcription.getSettings();
    if (res.success && res.data) {
      const p = String(res.data.sttProvider || '');
      if (p === 'local-gemma') {
        setSttProvider('openai');
      } else if (p === 'groq' || p === 'openai' || p === 'custom') {
        setSttProvider(p as SttProvider);
      } else {
        setSttProvider('openai');
      }
      setModel(res.data.model || 'whisper-1');
      setLanguage(res.data.language || '');
      setApiBaseUrl(res.data.apiBaseUrl || '');
      setPrompt(res.data.prompt || '');
      setGlobalShortcut(res.data.globalShortcut || '');
      setTranscriptionShortcutEnabled(!!res.data.globalShortcutEnabled);
      setHasDedicatedKey(!!res.data.hasOpenAIKey);
      setHasGroqKey(!!res.data.hasGroqKey);
      if (res.data.pauseThresholdSec != null) {
        setPauseThresholdSec(String(res.data.pauseThresholdSec));
      }
      if (res.data.summaryModel) setSummaryModel(res.data.summaryModel);
      if (typeof res.data.autoSummary === 'boolean') setAutoSummary(res.data.autoSummary);
      if (res.data.chunkSec != null) setChunkSec(String(res.data.chunkSec));
      if (typeof res.data.liveTranscriptDefault === 'boolean') {
        setLiveTranscriptDefault(res.data.liveTranscriptDefault);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPermissions();
  }, [load, loadPermissions]);

  const persist = useCallback(async (patch: {
    sttProvider?: SttProvider;
    model?: string;
    language?: string | null;
    globalShortcut?: string;
    apiBaseUrl?: string;
    prompt?: string;
    pauseThresholdSec?: number | null;
    dedicatedOpenaiKey?: string;
    groqApiKey?: string;
    globalShortcutEnabled?: boolean;
    summaryModel?: string;
    autoSummary?: boolean;
    chunkSec?: number;
    liveTranscriptDefault?: boolean;
  }) => {
    if (!window.electron?.transcription?.setSettings) return false;
    setSaved(false);
    await window.electron.transcription.setSettings(patch);
    setSaved(true);
    void load();
    setDedicatedKey('');
    setGroqKey('');
    if (!embedded) {
      setTimeout(() => setSaved(false), 2000);
    }
    return true;
  }, [embedded, load]);

  const handleSave = useCallback(async () => {
    return persist({
      sttProvider,
      model,
      language: language.trim() || null,
      globalShortcut: globalShortcut.trim(),
      globalShortcutEnabled: transcriptionShortcutEnabled,
      apiBaseUrl: apiBaseUrl.trim(),
      prompt: prompt.trim(),
      pauseThresholdSec: pauseThresholdSec.trim() ? parseFloat(pauseThresholdSec) : null,
      ...(dedicatedKey.trim() ? { dedicatedOpenaiKey: dedicatedKey.trim() } : {}),
      ...(groqKey.trim() ? { groqApiKey: groqKey.trim() } : {}),
      summaryModel: summaryModel.trim() || 'gpt-4o-mini',
      autoSummary,
      chunkSec: chunkSec.trim() ? parseInt(chunkSec, 10) : 4,
      liveTranscriptDefault,
    });
  }, [
    persist,
    sttProvider,
    model,
    language,
    globalShortcut,
    transcriptionShortcutEnabled,
    apiBaseUrl,
    prompt,
    pauseThresholdSec,
    dedicatedKey,
    groqKey,
    summaryModel,
    autoSummary,
    chunkSec,
    liveTranscriptDefault,
  ]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
  }), [handleSave]);

  const handleClearDedicatedKey = async () => {
    await persist({ dedicatedOpenaiKey: '' });
    showToast('success', t('settings.transcription.clear_key'));
  };

  const handleClearGroqKey = async () => {
    await persist({ groqApiKey: '' });
    showToast('success', t('settings.transcription.clear_groq_key'));
  };

  const applyGroqPreset = () => {
    setSttProvider('groq');
    setModel(MODEL_GROQ_TURBO);
    setApiBaseUrl(GROQ_ORIGIN);
    showToast('success', t('settings.transcription.preset_groq_desc'));
  };

  const applyOpenaiPreset = () => {
    setSttProvider('openai');
    setModel('whisper-1');
    setApiBaseUrl('');
    showToast('success', t('settings.transcription.preset_openai_desc'));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeading>{t('settings.transcription.section_permissions')}</SectionHeading>
        <Card className="p-4">
          {!isMac ? (
            <p className="text-xs text-muted-foreground">
              {t('settings.transcription.perm_os_managed')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <PermissionRow
                label={t('settings.transcription.perm_mic')}
                status={micPerm}
                onRequest={async () => {
                  setPermLoading(true);
                  try {
                    await window.electron?.transcription?.requestMic?.();
                    await loadPermissions();
                  } finally {
                    setPermLoading(false);
                  }
                }}
                loading={permLoading}
                t={t}
              />
              <PermissionRow
                label={t('settings.transcription.perm_screen')}
                status={screenPerm}
                onRequest={async () => {
                  setPermLoading(true);
                  try {
                    await window.electron?.transcription?.requestScreen?.();
                    await loadPermissions();
                  } finally {
                    setPermLoading(false);
                  }
                }}
                onOpenPrefs={() =>
                  window.electron?.invoke?.('open-external-url', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch((err) => {
                    console.error('[TranscriptionSettings] Failed to open system preferences:', err);
                  })
                }
                loading={permLoading}
                t={t}
              />
              {screenPerm === 'granted' && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t('settings.transcription.perm_screen_restart_hint')}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionHeading>{t('settings.transcription.section_quick_start')}</SectionHeading>
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button"
  variant="outline"
  onClick={applyGroqPreset}
  size="sm">
              {t('settings.transcription.preset_groq')}
            </Button>
            <Button type="button"
  variant="outline"
  onClick={applyOpenaiPreset}
  size="sm">
              {t('settings.transcription.preset_openai')}
            </Button>
          </div>
          <Field className="gap-1.5 max-w-md"><FieldLabel className="text-xs">{t('settings.transcription.stt_provider')}</FieldLabel><Select value={sttProvider} onValueChange={(next) => setSttProvider(next as SttProvider)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            <SelectItem value="groq">{t('settings.transcription.stt_provider_groq')}</SelectItem>
            <SelectItem value="openai">{t('settings.transcription.stt_provider_openai')}</SelectItem>
            <SelectItem value="custom">{t('settings.transcription.stt_provider_custom')}</SelectItem>
          </SelectGroup></SelectContent></Select></Field>

          {sttProvider === 'groq' ? (
            <Field className="gap-1.5"><FieldLabel className="text-xs">{t('settings.transcription.model')}</FieldLabel><Select value={model} onValueChange={(next) => { if (next != null) setModel(next); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
              <SelectItem value={MODEL_GROQ_TURBO}>{t('settings.transcription.model_option_groq_turbo')}</SelectItem>
              <SelectItem value={MODEL_GROQ_LARGE}>{t('settings.transcription.model_option_groq_large')}</SelectItem>
            </SelectGroup></SelectContent></Select></Field>
          ) : (
            <Field className="gap-1.5"><FieldLabel className="text-xs">{t('settings.transcription.model')}</FieldLabel><Select value={model} onValueChange={(next) => { if (next != null) setModel(next); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
              <SelectItem value="whisper-1">{t('settings.transcription.model_option_whisper1')}</SelectItem>
              <SelectItem value="gpt-4o-transcribe">{t('settings.transcription.model_option_gpt4o_transcribe')}</SelectItem>
              <SelectItem value="gpt-4o-mini-transcribe">{t('settings.transcription.model_option_gpt4o_mini_transcribe')}</SelectItem>
              <SelectItem value="gpt-4o-transcribe-diarize">{t('settings.transcription.model_option_gpt4o_transcribe_diarize')}</SelectItem>
              <SelectItem value={MODEL_GROQ_TURBO}>whisper-large-v3-turbo</SelectItem>
              <SelectItem value={MODEL_GROQ_LARGE}>whisper-large-v3</SelectItem>
            </SelectGroup></SelectContent></Select></Field>
          )}
          <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-1" className="text-xs">{t('settings.transcription.language')}</FieldLabel><Input id="fld-input-1" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={t('settings.transcription.language_placeholder')} /></Field>
          {sttProvider === 'groq' && !hasGroqKey ? (
            <p className="text-[11px] text-primary">{t('settings.transcription.groq_key_hint_quick')}</p>
          ) : null}
        </Card>
      </div>

      <div>
        <SectionHeading>{t('settings.transcription.section_shortcuts_global')}</SectionHeading>
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="tr-shortcut-dictation"
              checked={transcriptionShortcutEnabled}
              onCheckedChange={(v) => setTranscriptionShortcutEnabled(v === true)}
            />
            <Label htmlFor="tr-shortcut-dictation" className="cursor-pointer text-sm">
              {t('settings.transcription.shortcut_enable_dictation')}
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground">{t('settings.transcription.shortcut_dictation_hint')}</p>
          <Input value={globalShortcut} onChange={(e) => setGlobalShortcut(e.target.value)} disabled={!transcriptionShortcutEnabled} placeholder="CommandOrControl+Shift+D" />
        </Card>
      </div>

      <div>
        <SectionHeading>{t('settings.transcription.section_meetings_output')}</SectionHeading>
        <Card className="p-4 flex flex-col gap-3">
          <Field className="gap-1.5 max-w-[140px]"><FieldLabel htmlFor="fld-input-2" className="text-xs">{t('settings.transcription.pause_threshold')}</FieldLabel><Input id="fld-input-2" type="number" min={0.4} max={8} step={0.05} value={pauseThresholdSec} onChange={(e) => setPauseThresholdSec(e.target.value)} /><FieldDescription className="text-xs">{t('settings.transcription.pause_help')}</FieldDescription></Field>
        </Card>
      </div>

      <div>
        <SectionHeading>{t('settings.transcription.section_calls_ai')}</SectionHeading>
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="tr-live-transcript"
              checked={liveTranscriptDefault}
              onCheckedChange={(v) => setLiveTranscriptDefault(v === true)}
            />
            <Label htmlFor="tr-live-transcript" className="cursor-pointer text-sm">
              {t('settings.transcription.call_live_transcript_default')}
            </Label>
          </div>
          <Field className="gap-1.5 max-w-[200px]"><FieldLabel className="text-xs">{t('settings.transcription.call_chunk_length')}</FieldLabel><Select value={chunkSec} onValueChange={(next) => { if (next != null) setChunkSec(next); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="4">4</SelectItem>
            <SelectItem value="8">8</SelectItem>
            <SelectItem value="15">15</SelectItem>
            <SelectItem value="30">30</SelectItem>
          </SelectGroup></SelectContent></Select><FieldDescription className="text-xs">{t('settings.transcription.call_chunk_help')}</FieldDescription></Field>

          <div>
            <span className="block text-sm font-medium mb-1.5 text-foreground">
              {t('settings.transcription.call_summary_model')}
            </span>
            {summaryModels.length > 0 ? (
              <ModelSelector
                models={summaryModels}
                selectedModelId={summaryModel}
                onChange={setSummaryModel}
                showBadges={false}
                showDescription={false}
                showContextWindow={false}
                searchable={summaryModels.length > 5}
                placeholder={t('settings.transcription.call_summary_model_placeholder')}
                disabled={summaryModelsLoading}
                providerType="cloud"
              />
            ) : (
              <Input value={summaryModel} onChange={(e) => setSummaryModel(e.target.value)} placeholder={t('settings.transcription.call_summary_model_placeholder')} />
            )}
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="tr-auto-summary"
              checked={autoSummary}
              onCheckedChange={(v) => setAutoSummary(v === true)}
            />
            <Label htmlFor="tr-auto-summary" className="cursor-pointer text-sm">
              {t('settings.transcription.call_auto_summary')}
            </Label>
          </div>
        </Card>
      </div>

      <div>
        <Button type="button"
  variant="ghost"
  className="mb-2 !px-0 !text-[var(--primary)]"
  onClick={() => setShowAdvanced((v) => !v)}
  size="sm">
          {showAdvanced ? t('settings.transcription.advanced_hide') : t('settings.transcription.advanced_show')}
        </Button>
        {showAdvanced ? (
          <div className="flex flex-col gap-4 border-l-2 border-border pl-3">
            {sttProvider === 'groq' ? (
              <Card className="p-4 flex flex-col gap-2">
                <SectionHeading>{t('settings.transcription.section_groq_key')}</SectionHeading>
                <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-3" className="text-xs">{t('settings.transcription.groq_key_help')}</FieldLabel><Input id="fld-input-3" type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder={t('settings.transcription.groq_key_placeholder')} autoComplete="off" /><FieldDescription className="text-xs">{hasGroqKey ? t('settings.transcription.groq_key_saved') : undefined}</FieldDescription></Field>
                {hasGroqKey && (
                  <Button type="button"
  variant="ghost"
  className="mt-2 !px-0"
  onClick={() => void handleClearGroqKey()}
  size="xs">
                    {t('settings.transcription.clear_groq_key')}
                  </Button>
                )}
              </Card>
            ) : null}

            <Card className="p-4 flex flex-col gap-2">
              <SectionHeading>{t('settings.transcription.section_key')}</SectionHeading>
              <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-4" className="text-xs">{t('settings.transcription.key_help')}</FieldLabel><Input id="fld-input-4" type="password" value={dedicatedKey} onChange={(e) => setDedicatedKey(e.target.value)} placeholder={t('settings.transcription.key_placeholder')} autoComplete="off" /><FieldDescription className="text-xs">{hasDedicatedKey ? t('settings.transcription.key_saved') : undefined}</FieldDescription></Field>
              {hasDedicatedKey && (
                <Button type="button"
  variant="ghost"
  className="mt-2 !px-0"
  onClick={() => void handleClearDedicatedKey()}
  size="xs">
                  {t('settings.transcription.clear_key')}
                </Button>
              )}
            </Card>

            <Card className="p-4 flex flex-col gap-3">
              <SectionHeading>{t('settings.transcription.section_api_prompt')}</SectionHeading>
              <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-5" className="text-xs">{t('settings.transcription.api_base_url')}</FieldLabel><Input id="fld-input-5" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder={t('settings.transcription.api_base_url_placeholder')} autoComplete="off" /><FieldDescription className="text-xs">{t('settings.transcription.api_base_url_help')}</FieldDescription></Field>
              <Field className="gap-1.5"><FieldLabel htmlFor="fld-textarea-1" className="text-xs">{t('settings.transcription.prompt')}</FieldLabel><Textarea id="fld-textarea-1" className="min-h-24 resize-y min-h-[72px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={t('settings.transcription.prompt_placeholder')} /><FieldDescription className="text-xs">{t('settings.transcription.prompt_help')}</FieldDescription></Field>
            </Card>
          </div>
        ) : null}
      </div>

      {!embedded ? (
        <Button type="button"
  onClick={() => void handleSave()}>
          {saved ? t('settings.transcription.saved') : t('settings.transcription.save')}
        </Button>
      ) : null}
    </div>
  );
});

export default TranscriptionSettingsSections;
