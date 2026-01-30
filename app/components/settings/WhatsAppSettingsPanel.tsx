'use client';

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
  HelpCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface WhatsAppStatus {
  isRunning: boolean;
  state: 'connected' | 'disconnected' | 'pending';
  qrCode: string | null;
  selfId: string | null;
  hasAuth: boolean;
}

type ConnectionState = 'connected' | 'disconnected' | 'pending' | 'needs_qr';

export default function WhatsAppSettingsPanel() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Determine actual connection state
  const getConnectionState = (): ConnectionState => {
    if (!status) return 'disconnected';
    if (status.state === 'connected') return 'connected';
    if (status.state === 'pending') return 'pending';
    if (!status.hasAuth) return 'needs_qr';
    return 'disconnected';
  };

  const connectionState = getConnectionState();

  // Load WhatsApp status
  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electron.invoke('whatsapp:status');
      if (result.success) {
        setStatus(result.data);
      }
    } catch (err) {
      console.error('[WhatsApp Settings] Error loading status:', err);
    }
  }, []);

  // Load allowlist
  const loadAllowlist = useCallback(async () => {
    try {
      const result = await window.electron.invoke('whatsapp:allowlist:get');
      if (result.success) {
        setAllowlist(result.data || []);
      }
    } catch (err) {
      console.error('[WhatsApp Settings] Error loading allowlist:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadStatus();
    loadAllowlist();

    // Listen for WhatsApp events
    const unsubscribeQr = window.electron.on('whatsapp:qr', () => loadStatus());
    const unsubscribeConnected = window.electron.on('whatsapp:connected', () => loadStatus());
    const unsubscribeDisconnected = window.electron.on('whatsapp:disconnected', () => loadStatus());

    // Poll status every 5 seconds when not connected
    const interval = setInterval(() => {
      loadStatus();
    }, 5000);

    return () => {
      unsubscribeQr?.();
      unsubscribeConnected?.();
      unsubscribeDisconnected?.();
      clearInterval(interval);
    };
  }, [loadStatus, loadAllowlist]);

  // Connect WhatsApp
  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electron.invoke('whatsapp:start');
      if (!result.success) {
        setError(result.error || 'Error al conectar');
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect WhatsApp (preserves session)
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

  // Clear session (logout - requires new QR)
  const handleLogout = async () => {
    if (!confirm('¿Seguro que quieres cerrar sesion? Tendras que escanear el QR de nuevo.')) {
      return;
    }
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

  // Add number to allowlist
  const handleAddNumber = async () => {
    if (!newNumber.trim()) return;

    try {
      const result = await window.electron.invoke('whatsapp:allowlist:add', newNumber.trim());
      if (result.success) {
        setNewNumber('');
        await loadAllowlist();
      }
    } catch (err) {
      console.error('[WhatsApp Settings] Error adding number:', err);
    }
  };

  // Remove number from allowlist
  const handleRemoveNumber = async (number: string) => {
    try {
      const result = await window.electron.invoke('whatsapp:allowlist:remove', number);
      if (result.success) {
        await loadAllowlist();
      }
    } catch (err) {
      console.error('[WhatsApp Settings] Error removing number:', err);
    }
  };

  // Format phone number for display
  const formatPhoneNumber = (number: string) => {
    if (number.length > 10) {
      return `+${number.slice(0, 2)} ${number.slice(2, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
    }
    return `+${number}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-3" style={{ color: 'var(--primary-text)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#25D36615' }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
          </div>
          WhatsApp
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--secondary-text)' }}>
          Conecta tu WhatsApp para enviar contenido a Dome y hablar con Many desde tu telefono.
        </p>
      </div>

      {/* Main Connection Card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Status Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor:
              connectionState === 'connected'
                ? '#25D36608'
                : connectionState === 'pending'
                  ? 'rgba(245, 158, 11, 0.05)'
                  : 'transparent',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Status Icon */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor:
                  connectionState === 'connected'
                    ? '#25D36620'
                    : connectionState === 'pending'
                      ? 'var(--warning-bg)'
                      : 'var(--bg-tertiary)',
              }}
            >
              {connectionState === 'connected' ? (
                <Wifi className="w-6 h-6" style={{ color: '#25D366' }} />
              ) : connectionState === 'pending' ? (
                <Scan className="w-6 h-6 animate-pulse" style={{ color: 'var(--warning)' }} />
              ) : (
                <WifiOff className="w-6 h-6" style={{ color: 'var(--secondary-text)' }} />
              )}
            </div>

            {/* Status Text */}
            <div>
              <h3 className="font-semibold text-lg" style={{ color: 'var(--primary-text)' }}>
                {connectionState === 'connected'
                  ? 'Conectado'
                  : connectionState === 'pending'
                    ? 'Esperando escaneo'
                    : connectionState === 'needs_qr'
                      ? 'Sin sesion'
                      : 'Desconectado'}
              </h3>
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                {connectionState === 'connected' && status?.selfId
                  ? `+${status.selfId.split('@')[0]?.split(':')[0] ?? ''}`
                  : connectionState === 'pending'
                    ? 'Escanea el codigo QR con tu telefono'
                    : connectionState === 'needs_qr'
                      ? 'Necesitas vincular tu WhatsApp'
                      : status?.hasAuth
                        ? 'Sesion guardada - Pulsa conectar'
                        : 'No hay sesion activa'}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div
            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
            style={{
              backgroundColor:
                connectionState === 'connected'
                  ? '#25D36620'
                  : connectionState === 'pending'
                    ? 'var(--warning-bg)'
                    : 'var(--bg-tertiary)',
              color:
                connectionState === 'connected'
                  ? '#25D366'
                  : connectionState === 'pending'
                    ? 'var(--warning)'
                    : 'var(--secondary-text)',
            }}
          >
            {connectionState === 'connected' ? (
              <>
                <Check className="w-3 h-3" />
                Activo
              </>
            ) : connectionState === 'pending' ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Pendiente
              </>
            ) : (
              <>
                <X className="w-3 h-3" />
                Inactivo
              </>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        {connectionState === 'pending' && status?.qrCode && (
          <div className="p-6" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="flex flex-col items-center">
              {/* QR Code */}
              <div
                className="p-4 rounded-2xl shadow-lg"
                style={{ backgroundColor: 'white' }}
              >
                <QRCodeSVG
                  value={status.qrCode}
                  size={220}
                  level="M"
                  includeMargin={false}
                  bgColor="white"
                  fgColor="#111111"
                />
              </div>

              {/* Instructions */}
              <div className="mt-5 text-center max-w-xs">
                <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                  Escanea con WhatsApp
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>
                  Abre WhatsApp en tu telefono → Menu (tres puntos) → Dispositivos vinculados → Vincular dispositivo
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Disconnected with session - Quick reconnect */}
        {connectionState === 'disconnected' && status?.hasAuth && (
          <div className="p-6" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--success-bg)' }}
              >
                <Smartphone className="w-5 h-5" style={{ color: 'var(--success)' }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--primary-text)' }}>
                  Sesion guardada
                </p>
                <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                  Tu sesion anterior esta disponible. Puedes reconectar sin escanear QR.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Needs QR - First time setup */}
        {connectionState === 'needs_qr' && !status?.qrCode && (
          <div className="p-6" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="flex items-center gap-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--info-bg)' }}
              >
                <Scan className="w-5 h-5" style={{ color: 'var(--info)' }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--primary-text)' }}>
                  Vincula tu WhatsApp
                </p>
                <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                  Pulsa "Conectar" para generar un codigo QR y vincular tu telefono.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-4">
            <div
              className="p-3 rounded-lg flex items-center gap-2"
              style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
            >
              <X className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {connectionState === 'connected' ? (
            <>
              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--primary-text)',
                  opacity: isLoading ? 0.5 : 1,
                }}
              >
                <Power className="w-4 h-4" />
                Pausar
              </button>
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                style={{
                  backgroundColor: 'var(--error-bg)',
                  color: 'var(--error)',
                  opacity: isLoading ? 0.5 : 1,
                }}
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesion
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{
                backgroundColor: '#25D366',
                color: 'white',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              {connectionState === 'needs_qr' || connectionState === 'pending'
                ? 'Conectar'
                : 'Reconectar'}
            </button>
          )}

          <button
            onClick={loadStatus}
            disabled={isLoading}
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-all ml-auto"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary-text)' }}
            title="Actualizar estado"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Allowlist Section */}
      <div
        className="rounded-xl border"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Shield className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
            </div>
            <div>
              <h3 className="font-medium" style={{ color: 'var(--primary-text)' }}>
                Numeros autorizados
              </h3>
              <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                {allowlist.length === 0
                  ? 'Sin restricciones - acepta todos los mensajes'
                  : `${allowlist.length} numero${allowlist.length !== 1 ? 's' : ''} autorizado${allowlist.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Add Number Input */}
          <div className="flex gap-2">
            <input
              type="tel"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNumber()}
              placeholder="+34 612 345 678"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--primary-text)',
              }}
            />
            <button
              onClick={handleAddNumber}
              disabled={!newNumber.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{
                backgroundColor: newNumber.trim() ? 'var(--base)' : 'var(--bg-tertiary)',
                color: newNumber.trim() ? 'var(--base-text)' : 'var(--secondary-text)',
                opacity: newNumber.trim() ? 1 : 0.6,
              }}
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>

          {/* Number List */}
          {allowlist.length > 0 ? (
            <div className="space-y-2">
              {allowlist.map((number) => (
                <div
                  key={number}
                  className="flex items-center justify-between px-4 py-3 rounded-lg group"
                  style={{ backgroundColor: 'var(--bg)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#25D36615' }}
                    >
                      <Smartphone className="w-4 h-4" style={{ color: '#25D366' }} />
                    </div>
                    <span className="font-medium text-sm" style={{ color: 'var(--primary-text)' }}>
                      {formatPhoneNumber(number)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveNumber(number)}
                    className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--error)', backgroundColor: 'var(--error-bg)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="text-center py-6 rounded-lg"
              style={{ backgroundColor: 'var(--bg)', border: '1px dashed var(--border)' }}
            >
              <Shield className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--secondary-text)', opacity: 0.5 }} />
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                Lista vacia - todos los mensajes son aceptados
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div
        className="rounded-xl border"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="w-full px-6 py-4 flex items-center justify-between"
          style={{ color: 'var(--primary-text)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <HelpCircle className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
            </div>
            <span className="font-medium">Como usar WhatsApp con Dome</span>
          </div>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center transition-transform"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              transform: showInstructions ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: 'var(--secondary-text)' }}
            >
              <path
                d="M2.5 4.5L6 8L9.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>

        {showInstructions && (
          <div className="px-6 pb-6">
            <div
              className="p-4 rounded-lg space-y-3 text-sm"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--secondary-text)' }}
            >
              <p style={{ color: 'var(--primary-text)' }}>
                Una vez conectado, envia mensajes a tu propio chat de WhatsApp:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    /nota
                  </span>
                  <span>Crear una nota rapida</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    /url
                  </span>
                  <span>Guardar un enlace como recurso</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    /pregunta
                  </span>
                  <span>Consultar a Many</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-lg leading-none">🎤</span>
                  <span>Envia un audio para transcribirlo y guardarlo</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-lg leading-none">📎</span>
                  <span>Imagenes y documentos se guardan automaticamente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-lg leading-none">📍</span>
                  <span>Ubicaciones se guardan como nota con enlace</span>
                </li>
              </ul>
              <p className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                Los mensajes de texto normales se envian a Many para que te responda.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
