
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageCircle,
  RefreshCw,
  LogOut,
  Plus,
  Trash2,
  Check,
  X,
  Smartphone,
  Wifi,
  WifiOff,
  Scan,
  Power,
  Shield,
  ChevronDown,
  Mic,
  Paperclip,
  MapPin,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeListState from '@/components/ui/DomeListState';

interface WhatsAppStatus {
  isRunning: boolean;
  state: 'connected' | 'disconnected' | 'pending';
  qrCode: string | null;
  selfId: string | null;
  hasAuth: boolean;
}

type ConnectionState = 'connected' | 'disconnected' | 'pending' | 'needs_qr';

export default function WhatsAppSettingsPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const getConnectionState = (): ConnectionState => {
    if (!status) return 'disconnected';
    if (status.state === 'connected') return 'connected';
    if (status.state === 'pending') return 'pending';
    if (!status.hasAuth) return 'needs_qr';
    return 'disconnected';
  };

  const connectionState = getConnectionState();

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electron.invoke('whatsapp:status');
      if (result.success) setStatus(result.data);
    } catch (err) {
      console.error('[WhatsApp Settings] Error loading status:', err);
    }
  }, []);

  const loadAllowlist = useCallback(async () => {
    try {
      const result = await window.electron.invoke('whatsapp:allowlist:get');
      if (result.success) setAllowlist(result.data || []);
    } catch (err) {
      console.error('[WhatsApp Settings] Error loading allowlist:', err);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadAllowlist();

    const unsubscribeQr = window.electron.on('whatsapp:qr', () => loadStatus());
    const unsubscribeConnected = window.electron.on('whatsapp:connected', () => loadStatus());
    const unsubscribeDisconnected = window.electron.on('whatsapp:disconnected', () => loadStatus());
    const interval = setInterval(loadStatus, 5000);

    return () => {
      unsubscribeQr?.();
      unsubscribeConnected?.();
      unsubscribeDisconnected?.();
      clearInterval(interval);
    };
  }, [loadStatus, loadAllowlist]);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electron.invoke('whatsapp:start');
      if (!result.success) setError(result.error || 'Error al conectar');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await window.electron.invoke('whatsapp:stop');
      await loadStatus();
    } catch (err) {
      console.error('[WhatsApp Settings] Error disconnecting:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm(t('settings.whatsapp.logout_confirm'))) return;
    setIsLoading(true);
    try {
      await window.electron.invoke('whatsapp:logout');
      await loadStatus();
    } catch (err) {
      console.error('[WhatsApp Settings] Error logging out:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNumber = async () => {
    if (!newNumber.trim()) return;
    try {
      const result = await window.electron.invoke('whatsapp:allowlist:add', newNumber.trim());
      if (result.success) { setNewNumber(''); await loadAllowlist(); }
    } catch (err) {
      console.error('[WhatsApp Settings] Error adding number:', err);
    }
  };

  const handleRemoveNumber = async (number: string) => {
    try {
      const result = await window.electron.invoke('whatsapp:allowlist:remove', number);
      if (result.success) await loadAllowlist();
    } catch (err) {
      console.error('[WhatsApp Settings] Error removing number:', err);
    }
  };

  const formatPhoneNumber = (number: string) => {
    if (number.length > 10) {
      return `+${number.slice(0, 2)} ${number.slice(2, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
    }
    return `+${number}`;
  };

  const stateConfig = {
    connected: {
      label: t('settings.whatsapp.state_connected'),
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    pending: {
      label: t('settings.whatsapp.state_pending'),
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
    },
    needs_qr: {
      label: t('settings.whatsapp.state_needs_qr'),
      color: 'var(--dome-text-muted,var(--tertiary-text))',
      bg: 'var(--dome-bg-hover,var(--bg-hover))',
    },
    disconnected: {
      label: t('settings.whatsapp.state_disconnected'),
      color: 'var(--dome-text-muted,var(--tertiary-text))',
      bg: 'var(--dome-bg-hover,var(--bg-hover))',
    },
  };

  const cfg = stateConfig[connectionState];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        title={t('settings.whatsapp.title')}
        subtitle={t('settings.whatsapp.subtitle')}
        trailing={
          <DomeIconBox size="md" className="!w-10 !h-10">
            <MessageCircle className="w-5 h-5 text-[var(--accent)]" aria-hidden />
          </DomeIconBox>
        }
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      {/* Connection card */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.whatsapp.section_connection')}</DomeSectionLabel>
        <DomeCard>
          {/* Status header */}
          <div
            className="px-4 py-4 flex items-center justify-between rounded-t-xl"
            style={{ backgroundColor: cfg.bg, borderBottom: '1px solid var(--dome-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor:
                    connectionState === 'connected'
                      ? 'color-mix(in srgb, var(--success) 18%, transparent)'
                      : 'var(--dome-bg-hover,var(--bg-hover))',
                }}
              >
                {connectionState === 'connected' ? (
                  <Wifi className="w-5 h-5 text-[var(--success)]" />
                ) : connectionState === 'pending' ? (
                  <Scan className="w-5 h-5 animate-pulse text-[var(--warning)]" />
                ) : (
                  <WifiOff className="w-5 h-5 text-[var(--dome-text-muted,var(--tertiary-text))]" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>{cfg.label}</p>
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {connectionState === 'connected' && status?.selfId
                    ? `+${status.selfId.split('@')[0]?.split(':')[0] ?? ''}`
                    : connectionState === 'pending'
                      ? t('settings.whatsapp.hint_scan_qr')
                      : connectionState === 'needs_qr'
                        ? t('settings.whatsapp.hint_link_whatsapp')
                        : status?.hasAuth
                          ? t('settings.whatsapp.hint_session_saved')
                          : t('settings.whatsapp.hint_no_session')}
                </p>
              </div>
            </div>
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: 'var(--dome-surface)', color: cfg.color, border: '1px solid var(--dome-border)' }}
            >
              {connectionState === 'connected' ? <Check className="w-3 h-3" />
                : connectionState === 'pending' ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <X className="w-3 h-3" />}
              {connectionState === 'connected' ? t('settings.whatsapp.badge_active') : connectionState === 'pending' ? t('settings.whatsapp.badge_pending') : t('settings.whatsapp.badge_inactive')}
            </span>
          </div>

          {/* QR code */}
          {connectionState === 'pending' && status?.qrCode && (
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="p-3 rounded-2xl bg-[var(--bg)]">
                <QRCodeSVG
                  value={status.qrCode}
                  size={200}
                  level="M"
                  includeMargin={false}
                  bgColor="var(--bg)"
                  fgColor="var(--primary-text)"
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('settings.whatsapp.qr_title')}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.whatsapp.qr_instructions')}
                </p>
              </div>
            </div>
          )}

          {/* Saved session notice */}
          {connectionState === 'disconnected' && status?.hasAuth && (
            <div className="p-4">
              <div
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--accent) 25%, var(--border))',
                }}
              >
                <Smartphone className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('settings.whatsapp.session_saved')}</p>
                  <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.whatsapp.reconnect')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border text-[var(--error)]"
                style={{ backgroundColor: 'var(--error-bg)' }}
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3 flex items-center gap-2 border-t border-[var(--dome-border,var(--border))]">
            {connectionState === 'connected' ? (
              <>
                <DomeButton
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Power className="w-3.5 h-3.5" />}
                  loading={isLoading}
                  onClick={() => void handleDisconnect()}
                >
                  {t('settings.whatsapp.pause')}
                </DomeButton>
                <DomeButton
                  type="button"
                  variant="danger"
                  size="sm"
                  leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  loading={isLoading}
                  onClick={() => void handleLogout()}
                >
                  {t('settings.whatsapp.logout')}
                </DomeButton>
              </>
            ) : (
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                loading={isLoading}
                leftIcon={
                  isLoading ? undefined : <MessageCircle className="w-3.5 h-3.5" />
                }
                onClick={() => void handleConnect()}
              >
                {connectionState === 'needs_qr' || connectionState === 'pending'
                  ? t('settings.whatsapp.connect')
                  : t('settings.whatsapp.reconnect')}
              </DomeButton>
            )}
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              className="ml-auto"
              loading={isLoading}
              title={t('settings.whatsapp.refresh')}
              aria-label={t('settings.whatsapp.refresh')}
              onClick={() => void loadStatus()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </DomeButton>
          </div>
        </DomeCard>
      </div>

      {/* Allowlist */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.whatsapp.section_allowlist')}</DomeSectionLabel>
        <DomeCard>
          <div className="p-4" style={{ borderBottom: '1px solid var(--dome-border)' }}>
            <div className="flex items-center gap-3">
              <DomeIconBox size="sm" className="!rounded-lg">
                <Shield className="w-3.5 h-3.5 text-[var(--accent)]" />
              </DomeIconBox>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {allowlist.length === 0
                  ? t('settings.whatsapp.allowlist_no_restrictions')
                  : allowlist.length === 1
                    ? t('settings.whatsapp.allowlist_count_one', { count: allowlist.length })
                    : t('settings.whatsapp.allowlist_count_many', { count: allowlist.length })}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Add input */}
            <div className="flex gap-2 items-end">
              <DomeInput
                type="tel"
                className="flex-1"
                inputClassName="text-xs"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleAddNumber()}
                placeholder={t('settings.whatsapp.phone_placeholder')}
                aria-label={t('settings.whatsapp.phone_label')}
              />
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                disabled={!newNumber.trim()}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => void handleAddNumber()}
              >
                {t('settings.whatsapp.add_number')}
              </DomeButton>
            </div>

            {/* List */}
            {allowlist.length > 0 ? (
              <div className="space-y-1.5">
                {allowlist.map((number) => (
                  <div
                    key={number}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg group"
                    style={{ backgroundColor: 'var(--dome-bg-hover)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--success) 20%, transparent)' }}
                      >
                        <Smartphone className="w-3.5 h-3.5 text-[var(--success)]" />
                      </div>
                      <span className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{formatPhoneNumber(number)}</span>
                    </div>
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      className="opacity-0 group-hover:opacity-100 transition-opacity !text-[var(--error)]"
                      aria-label={t('common.delete')}
                      onClick={() => void handleRemoveNumber(number)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </DomeButton>
                  </div>
                ))}
              </div>
            ) : (
              <DomeListState
                variant="empty"
                compact
                icon={<Shield className="w-7 h-7 text-[var(--tertiary-text)] opacity-40" aria-hidden />}
                title={t('settings.whatsapp.empty_list')}
              />
            )}
          </div>
        </DomeCard>
      </div>

      {/* Instructions collapsible */}
      <div>
        <DomeCard>
          <DomeButton
            type="button"
            variant="ghost"
            className="w-full !px-4 !py-3.5 flex items-center justify-between rounded-none"
            onClick={() => setShowInstructions(!showInstructions)}
          >
            <span className="text-sm font-medium text-[var(--primary-text)]">{t('settings.whatsapp.instructions_title')}</span>
            <ChevronDown
              className={cn(
                'w-4 h-4 transition-transform duration-200 text-[var(--tertiary-text)]',
                showInstructions && 'rotate-180',
              )}
            />
          </DomeButton>

          {showInstructions && (
            <div className="px-4 pb-4">
              <div className="rounded-xl p-4 space-y-2.5" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
                <p className="text-xs font-medium text-[var(--dome-text,var(--primary-text))]">
                  {t('settings.whatsapp.instructions_send')}
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: null, cmd: '/nota', desc: t('settings.whatsapp.cmd_note') },
                    { icon: null, cmd: '/url', desc: t('settings.whatsapp.cmd_url') },
                    { icon: null, cmd: '/pregunta', desc: t('settings.whatsapp.cmd_question') },
                  ].map(({ cmd, desc }) => (
                    <li key={cmd} className="flex items-start gap-2">
                      <code className="px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono bg-[var(--dome-surface,var(--bg-secondary))] text-[var(--accent)]">
                        {cmd}
                      </code>
                      <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{desc}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2">
                    <Mic className="w-4 h-4 shrink-0 mt-0.5 text-[var(--dome-text-muted,var(--tertiary-text))]" />
                    <span className="text-xs text-[var(--dome-text-muted,var(--tertiary-text))]">
                      {t('settings.whatsapp.instructions_audio')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Paperclip className="w-4 h-4 shrink-0 mt-0.5 text-[var(--dome-text-muted,var(--tertiary-text))]" />
                    <span className="text-xs text-[var(--dome-text-muted,var(--tertiary-text))]">
                      {t('settings.whatsapp.instructions_attachments')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[var(--dome-text-muted,var(--tertiary-text))]" />
                    <span className="text-xs text-[var(--dome-text-muted,var(--tertiary-text))]">
                      {t('settings.whatsapp.instructions_location')}
                    </span>
                  </li>
                </ul>
                <p className="text-xs pt-2 border-t border-[var(--dome-border,var(--border))] text-[var(--dome-text-muted,var(--tertiary-text))]">
                  {t('settings.whatsapp.instructions_default')}
                </p>
              </div>
            </div>
          )}
        </DomeCard>
      </div>
    </div>
  );
}
