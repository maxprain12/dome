import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SecurityBlockIcon,
  SecurityCheckIcon,
  SecurityIcon,
  ShieldEnergyIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SettingsGroup, SettingsRow } from './blocks';
import { showToast } from '@/lib/store/useToastStore';
import type { ModelDefinition } from '@/lib/ai/models';
import ModelSelector from './ModelSelector';
import { cn } from '@/lib/utils';

type PermStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

const GROQ_ORIGIN = 'https://api.groq.com';
const MODEL_GROQ_TURBO = 'whisper-large-v3-turbo';
const MODEL_GROQ_LARGE = 'whisper-large-v3';

type SttProvider = 'openai' | 'groq' | 'custom';

export interface TranscriptionSettingsSectionsHandle {
  save: () => Promise<boolean>;
}

function PermissionRow({
  label,
  status,
  onRequest,
  onOpenPrefs,
  loading,
}: {
  label: string;
  status: PermStatus;
  onRequest: () => Promise<void>;
  onOpenPrefs?: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const statusConfig: Record<
    PermStatus,
    { icon: typeof SecurityIcon; className: string; text: string }
  > = {
    granted: {
      icon: SecurityCheckIcon,
      className: 'text-success',
      text: t('settings.transcription.perm_granted'),
    },
    denied: {
      icon: SecurityBlockIcon,
      className: 'text-destructive',
      text: t('settings.transcription.perm_denied'),
    },
    'not-determined': {
      icon: SecurityIcon,
      className: 'text-warning',
      text: t('settings.transcription.perm_not_determined'),
    },
    restricted: {
      icon: ShieldEnergyIcon,
      className: 'text-destructive',
      text: t('settings.transcription.perm_restricted'),
    },
    unknown: { icon: SecurityIcon, className: 'text-muted-foreground', text: '—' },
  };
  const cfg = statusConfig[status];

  return (
    <SettingsRow
      title={
        <span className="flex items-center gap-2">
          <HugeiconsIcon icon={cfg.icon} className={cn('shrink-0', cfg.className)} />
          {label}
        </span>
      }
      description={<span className={cfg.className}>{cfg.text}</span>}
      control={
        <>
          {status === 'denied' && onOpenPrefs ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="text-destructive"
              onClick={onOpenPrefs}
            >
              {t('settings.transcription.perm_open_prefs')}
            </Button>
          ) : null}
          {status === 'not-determined' || status === 'unknown' ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={loading}
              onClick={() => void onRequest()}
            >
              {t('settings.transcription.perm_request')}
            </Button>
          ) : null}
        </>
      }
    />
  );
}

interface TranscriptionSettingsSectionsProps {
  summaryModels: ModelDefinition[];
  summaryModelsLoading?: boolean;
  /** When true, hide the internal save button (parent handles save). */
  embedded?: boolean;
}

/** Voice/transcription pipeline settings; exposes an imperative `save()` for the AI panel. */
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
      if (p === 'groq' || p === 'openai' || p === 'custom') {
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

  const persist = useCallback(
    async (patch: {
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
    },
    [embedded, load],
  );

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

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

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
      <SettingsGroup title={t('settings.transcription.section_permissions')}>
        {!isMac ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {t('settings.transcription.perm_os_managed')}
          </p>
        ) : (
          <>
            <PermissionRow
              label={t('settings.transcription.perm_mic')}
              status={micPerm}
              loading={permLoading}
              onRequest={async () => {
                setPermLoading(true);
                try {
                  await window.electron?.transcription?.requestMic?.();
                  await loadPermissions();
                } finally {
                  setPermLoading(false);
                }
              }}
            />
            <PermissionRow
              label={t('settings.transcription.perm_screen')}
              status={screenPerm}
              loading={permLoading}
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
                window.electron
                  ?.invoke?.(
                    'open-external-url',
                    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
                  )
                  .catch((err) => {
                    console.error('[TranscriptionSettings] Failed to open system preferences:', err);
                  })
              }
            />
            {screenPerm === 'granted' ? (
              <p className="px-4 py-2 text-[11px] leading-snug text-muted-foreground">
                {t('settings.transcription.perm_screen_restart_hint')}
              </p>
            ) : null}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.transcription.section_quick_start')}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={applyGroqPreset}>
              {t('settings.transcription.preset_groq')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={applyOpenaiPreset}>
              {t('settings.transcription.preset_openai')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <Field className="max-w-md">
            <FieldLabel>{t('settings.transcription.stt_provider')}</FieldLabel>
            <Select value={sttProvider} onValueChange={(next) => setSttProvider(next as SttProvider)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="groq">{t('settings.transcription.stt_provider_groq')}</SelectItem>
                  <SelectItem value="openai">
                    {t('settings.transcription.stt_provider_openai')}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t('settings.transcription.stt_provider_custom')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>{t('settings.transcription.model')}</FieldLabel>
            <Select
              value={model}
              onValueChange={(next) => {
                if (next != null) setModel(next);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sttProvider === 'groq' ? (
                    <>
                      <SelectItem value={MODEL_GROQ_TURBO}>
                        {t('settings.transcription.model_option_groq_turbo')}
                      </SelectItem>
                      <SelectItem value={MODEL_GROQ_LARGE}>
                        {t('settings.transcription.model_option_groq_large')}
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="whisper-1">
                        {t('settings.transcription.model_option_whisper1')}
                      </SelectItem>
                      <SelectItem value="gpt-4o-transcribe">
                        {t('settings.transcription.model_option_gpt4o_transcribe')}
                      </SelectItem>
                      <SelectItem value="gpt-4o-mini-transcribe">
                        {t('settings.transcription.model_option_gpt4o_mini_transcribe')}
                      </SelectItem>
                      <SelectItem value="gpt-4o-transcribe-diarize">
                        {t('settings.transcription.model_option_gpt4o_transcribe_diarize')}
                      </SelectItem>
                      <SelectItem value={MODEL_GROQ_TURBO}>whisper-large-v3-turbo</SelectItem>
                      <SelectItem value={MODEL_GROQ_LARGE}>whisper-large-v3</SelectItem>
                    </>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="tr-language">{t('settings.transcription.language')}</FieldLabel>
            <Input
              id="tr-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={t('settings.transcription.language_placeholder')}
            />
          </Field>
          {sttProvider === 'groq' && !hasGroqKey ? (
            <p className="text-[11px] text-primary">
              {t('settings.transcription.groq_key_hint_quick')}
            </p>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.transcription.section_shortcuts_global')}>
        <SettingsRow
          title={t('settings.transcription.shortcut_enable_dictation')}
          description={t('settings.transcription.shortcut_dictation_hint')}
          control={
            <Switch
              checked={transcriptionShortcutEnabled}
              onCheckedChange={(v) => setTranscriptionShortcutEnabled(v === true)}
              aria-label={t('settings.transcription.shortcut_enable_dictation')}
            />
          }
        >
          <Input
            value={globalShortcut}
            onChange={(e) => setGlobalShortcut(e.target.value)}
            disabled={!transcriptionShortcutEnabled}
            placeholder="CommandOrControl+Shift+D"
            aria-label={t('settings.transcription.shortcut_enable_dictation')}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.transcription.section_meetings_output')}>
        <SettingsRow
          title={t('settings.transcription.pause_threshold')}
          description={t('settings.transcription.pause_help')}
          htmlFor="tr-pause-threshold"
          control={
            <Input
              id="tr-pause-threshold"
              type="number"
              min={0.4}
              max={8}
              step={0.05}
              value={pauseThresholdSec}
              onChange={(e) => setPauseThresholdSec(e.target.value)}
              className="w-28"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.transcription.section_calls_ai')}>
        <SettingsRow
          title={t('settings.transcription.call_live_transcript_default')}
          control={
            <Switch
              checked={liveTranscriptDefault}
              onCheckedChange={(v) => setLiveTranscriptDefault(v === true)}
              aria-label={t('settings.transcription.call_live_transcript_default')}
            />
          }
        />
        <SettingsRow
          title={t('settings.transcription.call_chunk_length')}
          description={t('settings.transcription.call_chunk_help')}
          control={
            <Select
              value={chunkSec}
              onValueChange={(next) => {
                if (next != null) setChunkSec(next);
              }}
            >
              <SelectTrigger className="w-24" aria-label={t('settings.transcription.call_chunk_length')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {['2', '4', '8', '15', '30'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow title={t('settings.transcription.call_summary_model')}>
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
            <Input
              value={summaryModel}
              onChange={(e) => setSummaryModel(e.target.value)}
              placeholder={t('settings.transcription.call_summary_model_placeholder')}
              aria-label={t('settings.transcription.call_summary_model')}
            />
          )}
        </SettingsRow>
        <SettingsRow
          title={t('settings.transcription.call_auto_summary')}
          control={
            <Switch
              checked={autoSummary}
              onCheckedChange={(v) => setAutoSummary(v === true)}
              aria-label={t('settings.transcription.call_auto_summary')}
            />
          }
        />
      </SettingsGroup>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-primary">
          {showAdvanced
            ? t('settings.transcription.advanced_hide')
            : t('settings.transcription.advanced_show')}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 flex flex-col gap-4 border-l-2 pl-3">
          {sttProvider === 'groq' ? (
            <SettingsGroup title={t('settings.transcription.section_groq_key')}>
              <div className="flex flex-col gap-2 px-4 py-4">
                <Field>
                  <FieldLabel htmlFor="tr-groq-key">
                    {t('settings.transcription.groq_key_help')}
                  </FieldLabel>
                  <Input
                    id="tr-groq-key"
                    type="password"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    placeholder={t('settings.transcription.groq_key_placeholder')}
                    autoComplete="off"
                  />
                  {hasGroqKey ? (
                    <FieldDescription>
                      {t('settings.transcription.groq_key_saved')}
                    </FieldDescription>
                  ) : null}
                </Field>
                {hasGroqKey ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="self-start"
                    onClick={() => void handleClearGroqKey()}
                  >
                    {t('settings.transcription.clear_groq_key')}
                  </Button>
                ) : null}
              </div>
            </SettingsGroup>
          ) : null}

          <SettingsGroup title={t('settings.transcription.section_key')}>
            <div className="flex flex-col gap-2 px-4 py-4">
              <Field>
                <FieldLabel htmlFor="tr-dedicated-key">
                  {t('settings.transcription.key_help')}
                </FieldLabel>
                <Input
                  id="tr-dedicated-key"
                  type="password"
                  value={dedicatedKey}
                  onChange={(e) => setDedicatedKey(e.target.value)}
                  placeholder={t('settings.transcription.key_placeholder')}
                  autoComplete="off"
                />
                {hasDedicatedKey ? (
                  <FieldDescription>{t('settings.transcription.key_saved')}</FieldDescription>
                ) : null}
              </Field>
              {hasDedicatedKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="self-start"
                  onClick={() => void handleClearDedicatedKey()}
                >
                  {t('settings.transcription.clear_key')}
                </Button>
              ) : null}
            </div>
          </SettingsGroup>

          <SettingsGroup title={t('settings.transcription.section_api_prompt')}>
            <div className="flex flex-col gap-4 px-4 py-4">
              <Field>
                <FieldLabel htmlFor="tr-api-base-url">
                  {t('settings.transcription.api_base_url')}
                </FieldLabel>
                <Input
                  id="tr-api-base-url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder={t('settings.transcription.api_base_url_placeholder')}
                  autoComplete="off"
                />
                <FieldDescription>{t('settings.transcription.api_base_url_help')}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="tr-prompt">{t('settings.transcription.prompt')}</FieldLabel>
                <Textarea
                  id="tr-prompt"
                  className="min-h-[72px] resize-y"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder={t('settings.transcription.prompt_placeholder')}
                />
                <FieldDescription>{t('settings.transcription.prompt_help')}</FieldDescription>
              </Field>
            </div>
          </SettingsGroup>
        </CollapsibleContent>
      </Collapsible>

      {!embedded ? (
        <Button type="button" className="self-start" onClick={() => void handleSave()}>
          {saved ? t('settings.transcription.saved') : t('settings.transcription.save')}
        </Button>
      ) : null}
    </div>
  );
});

export default TranscriptionSettingsSections;
