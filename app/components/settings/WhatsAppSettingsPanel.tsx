
import { useState, useEffect, useCallback } from 'react';
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

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';
const WA_GREEN = '#25D366';

interface WhatsAppStatus {
  isRunning: boolean;
  state: 'connected' | 'disconnected' | 'pending';
  qrCode: string | null;
  selfId: string | null;
  hasAuth: boolean;
}

type ConnectionState = 'connected' | 'disconnected' | 'pending' | 'needs_qr';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

export default function WhatsAppSettingsPanel() {
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
    if (!confirm('¿Seguro que quieres cerrar sesión? Tendrás que escanear el QR de nuevo.')) return;
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
    connected: { label: 'Conectado', color: WA_GREEN, bg: `${WA_GREEN}15` },
    pending: { label: 'Esperando escaneo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    needs_qr: { label: 'Sin sesión', color: 'var(--dome-text-muted)', bg: 'var(--dome-bg-hover)' },
    disconnected: { label: 'Desconectado', color: 'var(--dome-text-muted)', bg: 'var(--dome-bg-hover)' },
  };

  const cfg = stateConfig[connectionState];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>WhatsApp</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Conecta tu WhatsApp para enviar contenido a Dome y hablar con Many desde tu teléfono.
        </p>
      </div>

      {/* Connection card */}
      <div>
        <SectionLabel>Estado de conexión</SectionLabel>
        <SettingsCard>
          {/* Status header */}
          <div
            className="px-4 py-4 flex items-center justify-between rounded-t-xl"
            style={{ backgroundColor: cfg.bg, borderBottom: '1px solid var(--dome-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: connectionState === 'connected' ? `${WA_GREEN}25` : 'var(--dome-bg-hover)' }}
              >
                {connectionState === 'connected' ? (
                  <Wifi className="w-5 h-5" style={{ color: WA_GREEN }} />
                ) : connectionState === 'pending' ? (
                  <Scan className="w-5 h-5 animate-pulse" style={{ color: '#f59e0b' }} />
                ) : (
                  <WifiOff className="w-5 h-5" style={{ color: 'var(--dome-text-muted)' }} />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>{cfg.label}</p>
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {connectionState === 'connected' && status?.selfId
                    ? `+${status.selfId.split('@')[0]?.split(':')[0] ?? ''}`
                    : connectionState === 'pending'
                      ? 'Escanea el código QR con tu teléfono'
                      : connectionState === 'needs_qr'
                        ? 'Vincula tu WhatsApp para empezar'
                        : status?.hasAuth
                          ? 'Sesión guardada — pulsa conectar'
                          : 'Sin sesión activa'}
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
              {connectionState === 'connected' ? 'Activo' : connectionState === 'pending' ? 'Pendiente' : 'Inactivo'}
            </span>
          </div>

          {/* QR code */}
          {connectionState === 'pending' && status?.qrCode && (
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="p-3 rounded-2xl" style={{ backgroundColor: 'white' }}>
                <QRCodeSVG value={status.qrCode} size={200} level="M" includeMargin={false} bgColor="white" fgColor="#111111" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Escanea con WhatsApp</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  WhatsApp → Menú → Dispositivos vinculados → Vincular dispositivo
                </p>
              </div>
            </div>
          )}

          {/* Saved session notice */}
          {connectionState === 'disconnected' && status?.hasAuth && (
            <div className="p-4">
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${DOME_GREEN}08`, border: `1px solid ${DOME_GREEN}20` }}>
                <Smartphone className="w-4 h-4 shrink-0" style={{ color: DOME_GREEN }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Sesión guardada</p>
                  <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>Puedes reconectar sin escanear el QR.</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}>
                <X className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--dome-border)' }}>
            {connectionState === 'connected' ? (
              <>
                <button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
                >
                  <Power className="w-3.5 h-3.5" />
                  Pausar
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: WA_GREEN }}
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                {connectionState === 'needs_qr' || connectionState === 'pending' ? 'Conectar' : 'Reconectar'}
              </button>
            )}
            <button
              onClick={loadStatus}
              disabled={isLoading}
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg transition-all"
              style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
              title="Actualizar estado"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </SettingsCard>
      </div>

      {/* Allowlist */}
      <div>
        <SectionLabel>Números autorizados</SectionLabel>
        <SettingsCard>
          <div className="p-4" style={{ borderBottom: '1px solid var(--dome-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: DOME_GREEN_LIGHT }}>
                <Shield className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {allowlist.length === 0
                  ? 'Sin restricciones — acepta todos los mensajes'
                  : `${allowlist.length} número${allowlist.length !== 1 ? 's' : ''} autorizado${allowlist.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Add input */}
            <div className="flex gap-2">
              <input
                type="tel"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNumber()}
                placeholder="+34 612 345 678"
                aria-label="Número de teléfono"
                className="flex-1 px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)', outline: 'none' }}
              />
              <button
                onClick={handleAddNumber}
                disabled={!newNumber.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40"
                style={{ backgroundColor: DOME_GREEN }}
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
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
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${WA_GREEN}20` }}>
                        <Smartphone className="w-3.5 h-3.5" style={{ color: WA_GREEN }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{formatPhoneNumber(number)}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveNumber(number)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--dome-error, #ef4444)' }}
                      aria-label={`Eliminar ${formatPhoneNumber(number)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center rounded-xl" style={{ border: '1.5px dashed var(--dome-border)' }}>
                <Shield className="w-7 h-7 mx-auto mb-2 opacity-30" style={{ color: 'var(--dome-text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Lista vacía — todos los mensajes son aceptados</p>
              </div>
            )}
          </div>
        </SettingsCard>
      </div>

      {/* Instructions collapsible */}
      <div>
        <SettingsCard>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full px-4 py-3.5 flex items-center justify-between"
            style={{ color: 'var(--dome-text)' }}
          >
            <p className="text-sm font-medium">Cómo usar WhatsApp con Dome</p>
            <ChevronDown
              className="w-4 h-4 transition-transform duration-200"
              style={{ color: 'var(--dome-text-muted)', transform: showInstructions ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {showInstructions && (
            <div className="px-4 pb-4">
              <div className="rounded-xl p-4 space-y-2.5" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                  Envía mensajes a tu propio chat de WhatsApp:
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: null, cmd: '/nota', desc: 'Crear una nota rápida' },
                    { icon: null, cmd: '/url', desc: 'Guardar un enlace como recurso' },
                    { icon: null, cmd: '/pregunta', desc: 'Consultar a Many' },
                  ].map(({ cmd, desc }) => (
                    <li key={cmd} className="flex items-start gap-2">
                      <code className="px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono" style={{ backgroundColor: 'var(--dome-surface)', color: DOME_GREEN }}>
                        {cmd}
                      </code>
                      <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{desc}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2">
                    <Mic className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Envía un audio para transcribirlo y guardarlo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Paperclip className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Imágenes y documentos se guardan automáticamente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Ubicaciones se guardan como nota con enlace</span>
                  </li>
                </ul>
                <p className="text-xs pt-2" style={{ color: 'var(--dome-text-muted)', borderTop: '1px solid var(--dome-border)' }}>
                  Los mensajes de texto normales se envían a Many para que te responda.
                </p>
              </div>
            </div>
          )}
        </SettingsCard>
      </div>
    </div>
  );
}
