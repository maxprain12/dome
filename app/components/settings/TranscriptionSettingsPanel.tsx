import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, ShieldCheck, ShieldAlert, ShieldOff, ShieldQuestion } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeButton from '@/components/ui/DomeButton';
import DomeCheckbox from '@/components/ui/DomeCheckbox';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';

type PermStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

const GROQ_ORIGIN = 'https://api.groq.com';
const MODEL_GROQ_TURBO = 'whisper-large-v3-turbo';
const MODEL_GROQ_LARGE = 'whisper-large-v3';

const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const;

type SttProvider = 'openai' | 'groq' | 'custom';

interface PermissionRowProps {
  label: string;
  status: PermStatus;
  onRequest: () => Promise<void>;
  onOpenPrefs?: () => void;
  loading: boolean;
  t: (key: string) => string;
}

function PermissionRow({ label, status, onRequest, onOpenPrefs, loading, t }: PermissionRowProps) {
  const statusConfig: Record<PermStatus, { icon: React.ReactNode; color: string; text: string }> = {
    granted: { icon: <ShieldCheck className="h-4 w-4" />, color: 'var(--success)', text: t('settings.transcription.perm_granted') },
    denied: { icon: <ShieldOff className="h-4 w-4" />, color: 'var(--error)', text: t('settings.transcription.perm_denied') },
    'not-determined': { icon: <ShieldQuestion className="h-4 w-4" />, color: 'var(--warning)', text: t('settings.transcription.perm_not_determined') },
    restricted: { icon: <ShieldAlert className="h-4 w-4" />, color: 'var(--error)', text: t('settings.transcription.perm_restricted') },
    unknown: { icon: <ShieldQuestion className="h-4 w-4" />, color: 'var(--dome-text-muted,var(--tertiary-text))', text: '—' },
  };
  const cfg = statusConfig[status];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0" style={{ color: cfg.color }}>
          {cfg.icon}
        </span>
        <div className="min-w-0">
          <span className="text-sm font-medium block truncate text-[var(--dome-text,var(--primary-text))]">
            {label}
          </span>
          <span className="text-[11px]" style={{ color: cfg.color }}>
            {cfg.text}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status === 'denied' && onOpenPrefs && (
          <DomeButton type="button" variant="outline" size="xs" onClick={onOpenPrefs} className="!text-[var(--error)] !border-[var(--error)]">
            {t('settings.transcription.perm_open_prefs')}
          </DomeButton>
        )}
        {(status === 'not-determined' || status === 'unknown') && (
          <DomeButton type="button" variant="outline" size="xs" loading={loading} onClick={() => void onRequest()}>
            {t('settings.transcription.perm_request')}
          </DomeButton>
        )}
      </div>
    </div>
  );
}

export default function TranscriptionSettingsPanel() {
  const { t } = useTranslation();
  const [sttProvider, setSttProvider] = useState<SttProvider>('openai');
  const [model, setModel] = useState('whisper-1');
  const [language, setLanguage] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [dedicatedKey, setDedicatedKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [globalShortcut, setGlobalShortcut] = useState('');
  const [manyVoiceShortcut, setManyVoiceShortcut] = useState('');
  const [transcriptionShortcutEnabled, setTranscriptionShortcutEnabled] = useState(false);
  const [manyVoiceShortcutEnabled, setManyVoiceShortcutEnabled] = useState(false);
  const [manyVoiceRealtimeEnabled, setManyVoiceRealtimeEnabled] = useState(true);
  const [realtimeVoice, setRealtimeVoice] = useState('shimmer');
  const [realtimeModel, setRealtimeModel] = useState('gpt-4o-realtime-preview-2024-12-17');
  const [realtimeInstructionsSuffix, setRealtimeInstructionsSuffix] = useState('');
  const [pauseThresholdSec, setPauseThresholdSec] = useState('1.35');
  const [hasDedicatedKey, setHasDedicatedKey] = useState(false);
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [micPerm, setMicPerm] = useState<PermStatus>('unknown');
  const [screenPerm, setScreenPerm] = useState<PermStatus>('unknown');
  const [permLoading, setPermLoading] = useState(false);
  const isMac = window.electron?.isMac ?? false;

  const loadPermissions = useCallback(async () => {
    if (!window.electron?.transcription?.getPermissionsStatus) return;
    const res = await window.electron.transcription.getPermissionsStatus();
    if (res.success) {
      setMicPerm((res.microphone as PermStatus) ?? 'unknown');
      setScreenPerm((res.screen as PermStatus) ?? 'unknown');
    }
  }, []);

  const load = useCallback(async () => {
    if (!window.electron?.transcription?.getSettings) return;
    const res = await window.electron.transcription.getSettings();
    if (res.success && res.data) {
      const p = res.data.sttProvider;
      if (p === 'groq' || p === 'openai' || p === 'custom') {
        setSttProvider(p);
      } else {
        setSttProvider('openai');
      }
      setModel(res.data.model || 'whisper-1');
      setLanguage(res.data.language || '');
      setApiBaseUrl(res.data.apiBaseUrl || '');
      setPrompt(res.data.prompt || '');
      setGlobalShortcut(res.data.globalShortcut || '');
      setManyVoiceShortcut(res.data.manyVoiceGlobalShortcut || '');
      setTranscriptionShortcutEnabled(!!res.data.transcriptionGlobalShortcutEnabled);
      setManyVoiceShortcutEnabled(!!res.data.manyVoiceGlobalShortcutEnabled);
      setManyVoiceRealtimeEnabled(res.data.manyVoiceRealtimeEnabled !== false);
      setRealtimeVoice(res.data.realtimeVoice || 'shimmer');
      setRealtimeModel(res.data.realtimeModel || 'gpt-4o-realtime-preview-2024-12-17');
      setRealtimeInstructionsSuffix(res.data.realtimeInstructionsSuffix || '');
      setHasDedicatedKey(!!res.data.hasDedicatedOpenAIKey);
      setHasGroqKey(!!res.data.hasGroqApiKey);
      if (res.data.pauseThresholdSec != null) {
        setPauseThresholdSec(String(res.data.pauseThresholdSec));
      }
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPermissions();
  }, [load, loadPermissions]);

  const persist = async (patch: {
    sttProvider?: SttProvider;
    model?: string;
    language?: string | null;
    globalShortcut?: string;
    apiBaseUrl?: string;
    prompt?: string;
    pauseThresholdSec?: number | null;
    dedicatedOpenaiKey?: string;
    groqApiKey?: string;
    manyVoiceGlobalShortcut?: string;
    transcriptionGlobalShortcutEnabled?: boolean;
    manyVoiceGlobalShortcutEnabled?: boolean;
    manyVoiceRealtimeEnabled?: boolean;
    realtimeVoice?: string;
    realtimeModel?: string;
    realtimeInstructionsSuffix?: string;
  }) => {
    if (!window.electron?.transcription?.setSettings) return;
    setSaved(false);
    await window.electron.transcription.setSettings(patch);
    setSaved(true);
    void load();
    setDedicatedKey('');
    setGroqKey('');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = async () => {
    await persist({
      sttProvider,
      model,
      language: language.trim() || null,
      globalShortcut: globalShortcut.trim(),
      manyVoiceGlobalShortcut: manyVoiceShortcut.trim(),
      transcriptionGlobalShortcutEnabled: transcriptionShortcutEnabled,
      manyVoiceGlobalShortcutEnabled: manyVoiceShortcutEnabled,
      manyVoiceRealtimeEnabled,
      realtimeVoice: realtimeVoice.trim(),
      realtimeModel: realtimeModel.trim(),
      realtimeInstructionsSuffix: realtimeInstructionsSuffix.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      prompt: prompt.trim(),
      pauseThresholdSec: pauseThresholdSec.trim() ? parseFloat(pauseThresholdSec) : null,
      ...(dedicatedKey.trim() ? { dedicatedOpenaiKey: dedicatedKey.trim() } : {}),
      ...(groqKey.trim() ? { groqApiKey: groqKey.trim() } : {}),
    });
  };

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        title={t('settings.transcription.title')}
        subtitle={
          <div className="space-y-2">
            <p>{t('settings.transcription.subtitle')}</p>
            <p className="text-[11px] leading-relaxed opacity-95">{t('settings.transcription.hub_floating_note')}</p>
          </div>
        }
        trailing={
          <DomeIconBox size="md" className="!w-10 !h-10">
            <Mic className="w-5 h-5 text-[var(--accent)]" aria-hidden />
          </DomeIconBox>
        }
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      {/* 0 — Permissions */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.transcription.section_permissions')}</DomeSectionLabel>
        <DomeCard>
          {!isMac ? (
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.transcription.perm_os_managed')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Microphone row */}
              <PermissionRow
                label={t('settings.transcription.perm_mic')}
                status={micPerm}
                onRequest={async () => {
                  setPermLoading(true);
                  try {
                    await window.electron?.transcription?.requestMicrophoneAccess?.();
                    await loadPermissions();
                  } finally {
                    setPermLoading(false);
                  }
                }}
                loading={permLoading}
                t={t}
              />
              {/* Screen Recording row */}
              <PermissionRow
                label={t('settings.transcription.perm_screen')}
                status={screenPerm}
                onRequest={async () => {
                  setPermLoading(true);
                  try {
                    await window.electron?.transcription?.requestScreenAccess?.();
                    await loadPermissions();
                  } finally {
                    setPermLoading(false);
                  }
                }}
                onOpenPrefs={() =>
                  void window.electron?.invoke?.('open-external-url', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
                }
                loading={permLoading}
                t={t}
              />
              {screenPerm === 'granted' && (
                <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.transcription.perm_screen_restart_hint')}
                </p>
              )}
            </div>
          )}
        </DomeCard>
      </div>

      {/* 1 — Inicio rápido (STT) */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.transcription.section_quick_start')}</DomeSectionLabel>
        <DomeCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.help')}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <DomeButton type="button" variant="outline" size="sm" onClick={applyGroqPreset}>
              {t('settings.transcription.preset_groq')}
            </DomeButton>
            <DomeButton type="button" variant="outline" size="sm" onClick={applyOpenaiPreset}>
              {t('settings.transcription.preset_openai')}
            </DomeButton>
          </div>
          <DomeSelect
            className="max-w-md mb-3"
            label={t('settings.transcription.stt_provider')}
            value={sttProvider}
            onChange={(e) => setSttProvider(e.target.value as SttProvider)}
          >
            <option value="groq">{t('settings.transcription.stt_provider_groq')}</option>
            <option value="openai">{t('settings.transcription.stt_provider_openai')}</option>
            <option value="custom">{t('settings.transcription.stt_provider_custom')}</option>
          </DomeSelect>

          {sttProvider === 'groq' ? (
            <DomeSelect
              className="mb-3"
              label={t('settings.transcription.model')}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value={MODEL_GROQ_TURBO}>{t('settings.transcription.model_option_groq_turbo')}</option>
              <option value={MODEL_GROQ_LARGE}>{t('settings.transcription.model_option_groq_large')}</option>
            </DomeSelect>
          ) : (
            <DomeSelect
              className="mb-3"
              label={t('settings.transcription.model')}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="whisper-1">{t('settings.transcription.model_option_whisper1')}</option>
              <option value={MODEL_GROQ_TURBO}>whisper-large-v3-turbo</option>
              <option value={MODEL_GROQ_LARGE}>whisper-large-v3</option>
            </DomeSelect>
          )}
          <DomeInput
            label={t('settings.transcription.language')}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder={t('settings.transcription.language_placeholder')}
          />
          {sttProvider === 'groq' && !hasGroqKey ? (
            <p className="text-[11px] mt-3" style={{ color: 'var(--dome-accent)' }}>
              {t('settings.transcription.groq_key_hint_quick')}
            </p>
          ) : null}
        </DomeCard>
      </div>

      {/* 2 — Atajos globales */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.transcription.section_shortcuts_global')}</DomeSectionLabel>
        <DomeCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.shortcut_opt_in_help')}
          </p>
          <DomeCheckbox
            className="mb-2"
            label={t('settings.transcription.shortcut_enable_dictation')}
            checked={transcriptionShortcutEnabled}
            onChange={(e) => setTranscriptionShortcutEnabled(e.target.checked)}
          />
          <p className="text-[10px] mb-2 text-[var(--dome-text-muted,var(--tertiary-text))]">
            {t('settings.transcription.shortcut_dictation_hint')}
          </p>
          <DomeInput
            className="mb-4"
            value={globalShortcut}
            onChange={(e) => setGlobalShortcut(e.target.value)}
            disabled={!transcriptionShortcutEnabled}
            placeholder="CommandOrControl+Shift+D"
          />
          {typeof window !== 'undefined' && window.electron?.isMac ? (
            <>
              <DomeCheckbox
                className="mb-2"
                label={t('settings.transcription.shortcut_enable_many')}
                checked={manyVoiceShortcutEnabled}
                onChange={(e) => setManyVoiceShortcutEnabled(e.target.checked)}
              />
              <p className="text-[10px] mb-2 text-[var(--dome-text-muted,var(--tertiary-text))]">
                {t('manyVoice.many_shortcut_hint')}
              </p>
              <DomeInput
                value={manyVoiceShortcut}
                onChange={(e) => setManyVoiceShortcut(e.target.value)}
                disabled={!manyVoiceShortcutEnabled}
                placeholder="Option+Shift+M"
              />
            </>
          ) : (
            <>
              <DomeCheckbox
                className="mb-2"
                label={t('settings.transcription.shortcut_enable_many')}
                checked={manyVoiceShortcutEnabled}
                onChange={(e) => setManyVoiceShortcutEnabled(e.target.checked)}
              />
              <DomeInput
                value={manyVoiceShortcut}
                onChange={(e) => setManyVoiceShortcut(e.target.value)}
                disabled={!manyVoiceShortcutEnabled}
                placeholder="Alt+Shift+M"
              />
            </>
          )}
        </DomeCard>
      </div>

      {/* 3 — Many voz en tiempo real */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.transcription.section_realtime_voice')}</DomeSectionLabel>
        <DomeCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_voice_help')}
          </p>
          <DomeCheckbox
            className="mb-3"
            label={t('settings.transcription.realtime_enable')}
            checked={manyVoiceRealtimeEnabled}
            onChange={(e) => setManyVoiceRealtimeEnabled(e.target.checked)}
          />
          <DomeSelect
            className="max-w-md mb-3"
            label={t('settings.transcription.realtime_voice_label')}
            value={realtimeVoice}
            onChange={(e) => setRealtimeVoice(e.target.value)}
          >
            {REALTIME_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </DomeSelect>
          <DomeInput
            className="mb-3"
            label={t('settings.transcription.realtime_model_label')}
            value={realtimeModel}
            onChange={(e) => setRealtimeModel(e.target.value)}
            inputClassName="font-mono text-[11px]"
            placeholder="gpt-4o-realtime-preview-2024-12-17"
            autoComplete="off"
          />
          <DomeTextarea
            label={t('settings.transcription.realtime_suffix_label')}
            hint={t('settings.transcription.realtime_suffix_help')}
            value={realtimeInstructionsSuffix}
            onChange={(e) => setRealtimeInstructionsSuffix(e.target.value)}
            rows={2}
            textareaClassName="min-h-[52px]"
            placeholder={t('settings.transcription.realtime_suffix_placeholder')}
          />
        </DomeCard>
      </div>

      {/* 4 — Reuniones y formato de nota */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.transcription.section_meetings_output')}</DomeSectionLabel>
        <DomeCard>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.pause_threshold')}
          </label>
          <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.pause_help')}
          </p>
          <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.9 }}>
            {t('settings.transcription.future_diarization_note')}
          </p>
          <DomeInput
            type="number"
            min={0.4}
            max={8}
            step={0.05}
            className="max-w-[140px]"
            value={pauseThresholdSec}
            onChange={(e) => setPauseThresholdSec(e.target.value)}
          />
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.transcription.capture_help')}
            </p>
          </div>
        </DomeCard>
      </div>

      {/* 5 — Avanzado */}
      <div>
        <DomeButton
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 !px-0 !text-[var(--dome-accent,var(--accent))]"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? t('settings.transcription.advanced_hide') : t('settings.transcription.advanced_show')}
        </DomeButton>
        {showAdvanced ? (
          <div className="space-y-6 pl-0 border-l-2 border-[var(--dome-border)] pl-3">
            {sttProvider === 'groq' ? (
              <DomeCard>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                  {t('settings.transcription.section_groq_key')}
                </p>
                <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.transcription.groq_key_help')}
                  {hasGroqKey ? ` (${t('settings.transcription.groq_key_saved')})` : ''}
                </p>
                <DomeInput
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder={t('settings.transcription.groq_key_placeholder')}
                  autoComplete="off"
                />
                {hasGroqKey && (
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="mt-2 !px-0"
                    onClick={() => void handleClearGroqKey()}
                  >
                    {t('settings.transcription.clear_groq_key')}
                  </DomeButton>
                )}
              </DomeCard>
            ) : null}

            <DomeCard>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                {t('settings.transcription.section_key')}
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.key_help')}
                {hasDedicatedKey ? ` (${t('settings.transcription.key_saved')})` : ''}
              </p>
              <DomeInput
                type="password"
                value={dedicatedKey}
                onChange={(e) => setDedicatedKey(e.target.value)}
                placeholder={t('settings.transcription.key_placeholder')}
                autoComplete="off"
              />
              {hasDedicatedKey && (
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-2 !px-0"
                  onClick={() => void handleClearDedicatedKey()}
                >
                  {t('settings.transcription.clear_key')}
                </DomeButton>
              )}
            </DomeCard>

            <DomeCard>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                {t('settings.transcription.section_api_prompt')}
              </p>
              <DomeInput
                className="mb-3"
                label={t('settings.transcription.api_base_url')}
                hint={t('settings.transcription.api_base_url_help')}
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder={t('settings.transcription.api_base_url_placeholder')}
                autoComplete="off"
              />
              <DomeTextarea
                label={t('settings.transcription.prompt')}
                hint={t('settings.transcription.prompt_help')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                textareaClassName="min-h-[72px]"
                placeholder={t('settings.transcription.prompt_placeholder')}
              />
            </DomeCard>
          </div>
        ) : null}
      </div>

      <DomeButton type="button" variant="primary" onClick={() => void handleSave()}>
        {saved ? t('settings.transcription.saved') : t('settings.transcription.save')}
      </DomeButton>
    </div>
  );
}
