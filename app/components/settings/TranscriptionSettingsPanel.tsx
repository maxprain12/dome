import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { notifications } from '@mantine/notifications';

const DOME_GREEN = '#596037';

const GROQ_ORIGIN = 'https://api.groq.com';
const MODEL_GROQ_TURBO = 'whisper-large-v3-turbo';
const MODEL_GROQ_LARGE = 'whisper-large-v3';

const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const;

type SttProvider = 'openai' | 'groq' | 'custom';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      {children}
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
  }, [load]);

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
      manyVoiceGlobalShortcutEnabled,
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
    notifications.show({ message: t('settings.transcription.clear_key'), color: 'gray' });
  };

  const handleClearGroqKey = async () => {
    await persist({ groqApiKey: '' });
    notifications.show({ message: t('settings.transcription.clear_groq_key'), color: 'gray' });
  };

  const applyGroqPreset = () => {
    setSttProvider('groq');
    setModel(MODEL_GROQ_TURBO);
    setApiBaseUrl(GROQ_ORIGIN);
    notifications.show({
      message: t('settings.transcription.preset_groq_desc'),
      color: 'teal',
    });
  };

  const applyOpenaiPreset = () => {
    setSttProvider('openai');
    setModel('whisper-1');
    setApiBaseUrl('');
    notifications.show({
      message: t('settings.transcription.preset_openai_desc'),
      color: 'gray',
    });
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg text-sm outline-none';
  const inputStyle = {
    backgroundColor: 'var(--dome-bg-hover)',
    color: 'var(--dome-text)',
    border: '1px solid var(--dome-border)',
  } as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-lg font-semibold mb-0.5 flex items-center gap-2" style={{ color: 'var(--dome-text)' }}>
          <Mic className="w-5 h-5" style={{ color: DOME_GREEN }} />
          {t('settings.transcription.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          {t('settings.transcription.subtitle')}
        </p>
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--dome-text-muted)', opacity: 0.95 }}>
          {t('settings.transcription.hub_floating_note')}
        </p>
      </div>

      {/* 1 — Inicio rápido (STT) */}
      <div>
        <SectionLabel>{t('settings.transcription.section_quick_start')}</SectionLabel>
        <SettingsCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.help')}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={applyGroqPreset}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg-hover)' }}
            >
              {t('settings.transcription.preset_groq')}
            </button>
            <button
              type="button"
              onClick={applyOpenaiPreset}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg-hover)' }}
            >
              {t('settings.transcription.preset_openai')}
            </button>
          </div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.stt_provider')}
          </label>
          <select
            value={sttProvider}
            onChange={(e) => setSttProvider(e.target.value as SttProvider)}
            className="w-full max-w-md px-3 py-2 rounded-lg text-sm mb-3 outline-none"
            style={inputStyle}
          >
            <option value="groq">{t('settings.transcription.stt_provider_groq')}</option>
            <option value="openai">{t('settings.transcription.stt_provider_openai')}</option>
            <option value="custom">{t('settings.transcription.stt_provider_custom')}</option>
          </select>

          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.model')}
          </label>
          {sttProvider === 'groq' ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={`${inputClass} mb-3`}
              style={inputStyle}
            >
              <option value={MODEL_GROQ_TURBO}>{t('settings.transcription.model_option_groq_turbo')}</option>
              <option value={MODEL_GROQ_LARGE}>{t('settings.transcription.model_option_groq_large')}</option>
            </select>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={`${inputClass} mb-3`}
              style={inputStyle}
            >
              <option value="whisper-1">{t('settings.transcription.model_option_whisper1')}</option>
              <option value={MODEL_GROQ_TURBO}>whisper-large-v3-turbo</option>
              <option value={MODEL_GROQ_LARGE}>whisper-large-v3</option>
            </select>
          )}
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.language')}
          </label>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={inputClass}
            style={inputStyle}
            placeholder={t('settings.transcription.language_placeholder')}
          />
          {sttProvider === 'groq' && !hasGroqKey ? (
            <p className="text-[11px] mt-3" style={{ color: 'var(--dome-accent)' }}>
              {t('settings.transcription.groq_key_hint_quick')}
            </p>
          ) : null}
        </SettingsCard>
      </div>

      {/* 2 — Atajos globales */}
      <div>
        <SectionLabel>{t('settings.transcription.section_shortcuts_global')}</SectionLabel>
        <SettingsCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.shortcut_opt_in_help')}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs mb-2" style={{ color: 'var(--dome-text)' }}>
            <input
              type="checkbox"
              checked={transcriptionShortcutEnabled}
              onChange={(e) => setTranscriptionShortcutEnabled(e.target.checked)}
              className="cursor-pointer"
            />
            {t('settings.transcription.shortcut_enable_dictation')}
          </label>
          <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.shortcut_dictation_hint')}
          </p>
          <input
            value={globalShortcut}
            onChange={(e) => setGlobalShortcut(e.target.value)}
            disabled={!transcriptionShortcutEnabled}
            className={`${inputClass} mb-4 disabled:opacity-45`}
            style={inputStyle}
            placeholder="CommandOrControl+Shift+D"
          />
          {typeof window !== 'undefined' && window.electron?.isMac ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs mb-2" style={{ color: 'var(--dome-text)' }}>
                <input
                  type="checkbox"
                  checked={manyVoiceShortcutEnabled}
                  onChange={(e) => setManyVoiceShortcutEnabled(e.target.checked)}
                  className="cursor-pointer"
                />
                {t('settings.transcription.shortcut_enable_many')}
              </label>
              <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                {t('manyVoice.many_shortcut_hint')}
              </p>
              <input
                value={manyVoiceShortcut}
                onChange={(e) => setManyVoiceShortcut(e.target.value)}
                disabled={!manyVoiceShortcutEnabled}
                className={`${inputClass} disabled:opacity-45`}
                style={inputStyle}
                placeholder="Option+Shift+M"
              />
            </>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs mb-2" style={{ color: 'var(--dome-text)' }}>
                <input
                  type="checkbox"
                  checked={manyVoiceShortcutEnabled}
                  onChange={(e) => setManyVoiceShortcutEnabled(e.target.checked)}
                  className="cursor-pointer"
                />
                {t('settings.transcription.shortcut_enable_many')}
              </label>
              <input
                value={manyVoiceShortcut}
                onChange={(e) => setManyVoiceShortcut(e.target.value)}
                disabled={!manyVoiceShortcutEnabled}
                className={`${inputClass} disabled:opacity-45`}
                style={inputStyle}
                placeholder="Alt+Shift+M"
              />
            </>
          )}
        </SettingsCard>
      </div>

      {/* 3 — Many voz en tiempo real */}
      <div>
        <SectionLabel>{t('settings.transcription.section_realtime_voice')}</SectionLabel>
        <SettingsCard>
          <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_voice_help')}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs mb-3" style={{ color: 'var(--dome-text)' }}>
            <input
              type="checkbox"
              checked={manyVoiceRealtimeEnabled}
              onChange={(e) => setManyVoiceRealtimeEnabled(e.target.checked)}
              className="cursor-pointer"
            />
            {t('settings.transcription.realtime_enable')}
          </label>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_voice_label')}
          </label>
          <select
            value={realtimeVoice}
            onChange={(e) => setRealtimeVoice(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg text-sm mb-3 outline-none"
            style={inputStyle}
          >
            {REALTIME_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_model_label')}
          </label>
          <input
            value={realtimeModel}
            onChange={(e) => setRealtimeModel(e.target.value)}
            className={`${inputClass} mb-3 font-mono text-[11px]`}
            style={inputStyle}
            placeholder="gpt-4o-realtime-preview-2024-12-17"
            autoComplete="off"
          />
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_suffix_label')}
          </label>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.realtime_suffix_help')}
          </p>
          <textarea
            value={realtimeInstructionsSuffix}
            onChange={(e) => setRealtimeInstructionsSuffix(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y min-h-[52px]"
            style={inputStyle}
            placeholder={t('settings.transcription.realtime_suffix_placeholder')}
          />
        </SettingsCard>
      </div>

      {/* 4 — Reuniones y formato de nota */}
      <div>
        <SectionLabel>{t('settings.transcription.section_meetings_output')}</SectionLabel>
        <SettingsCard>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.pause_threshold')}
          </label>
          <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.transcription.pause_help')}
          </p>
          <p className="text-[10px] mb-2" style={{ color: 'var(--dome-text-muted)', opacity: 0.9 }}>
            {t('settings.transcription.future_diarization_note')}
          </p>
          <input
            type="number"
            min={0.4}
            max={8}
            step={0.05}
            value={pauseThresholdSec}
            onChange={(e) => setPauseThresholdSec(e.target.value)}
            className="w-full max-w-[140px] px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.transcription.capture_help')}
            </p>
          </div>
        </SettingsCard>
      </div>

      {/* 5 — Avanzado */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs font-semibold mb-2 underline-offset-2 hover:underline"
          style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {showAdvanced ? t('settings.transcription.advanced_hide') : t('settings.transcription.advanced_show')}
        </button>
        {showAdvanced ? (
          <div className="space-y-6 pl-0 border-l-2 border-[var(--dome-border)] pl-3">
            {sttProvider === 'groq' ? (
              <SettingsCard>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                  {t('settings.transcription.section_groq_key')}
                </p>
                <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.transcription.groq_key_help')}
                  {hasGroqKey ? ` (${t('settings.transcription.groq_key_saved')})` : ''}
                </p>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder={t('settings.transcription.groq_key_placeholder')}
                  autoComplete="off"
                />
                {hasGroqKey && (
                  <button
                    type="button"
                    onClick={() => void handleClearGroqKey()}
                    className="mt-2 text-xs underline"
                    style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {t('settings.transcription.clear_groq_key')}
                  </button>
                )}
              </SettingsCard>
            ) : null}

            <SettingsCard>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                {t('settings.transcription.section_key')}
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.key_help')}
                {hasDedicatedKey ? ` (${t('settings.transcription.key_saved')})` : ''}
              </p>
              <input
                type="password"
                value={dedicatedKey}
                onChange={(e) => setDedicatedKey(e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder={t('settings.transcription.key_placeholder')}
                autoComplete="off"
              />
              {hasDedicatedKey && (
                <button
                  type="button"
                  onClick={() => void handleClearDedicatedKey()}
                  className="mt-2 text-xs underline"
                  style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {t('settings.transcription.clear_key')}
                </button>
              )}
            </SettingsCard>

            <SettingsCard>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                {t('settings.transcription.section_api_prompt')}
              </p>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.api_base_url')}
              </label>
              <p className="text-[10px] mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.api_base_url_help')}
              </p>
              <input
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className={`${inputClass} mb-3`}
                style={inputStyle}
                placeholder={t('settings.transcription.api_base_url_placeholder')}
                autoComplete="off"
              />
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.prompt')}
              </label>
              <p className="text-[10px] mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.transcription.prompt_help')}
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y min-h-[72px]"
                style={inputStyle}
                placeholder={t('settings.transcription.prompt_placeholder')}
              />
            </SettingsCard>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        className="px-5 py-2 rounded-lg text-sm font-medium text-white"
        style={{ backgroundColor: DOME_GREEN }}
      >
        {saved ? t('settings.transcription.saved') : t('settings.transcription.save')}
      </button>
    </div>
  );
}
