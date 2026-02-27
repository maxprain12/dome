'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, CheckCircle2, ExternalLink } from 'lucide-react';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';

interface GoogleAccount {
  id: string;
  account_email: string;
  status: string;
}

export default function CalendarSettingsPanel() {
  const [clientId, setClientId] = useState('');
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    setLoading(true);
    try {
      const [clientResult, accountsResult] = await Promise.all([
        db.getSetting('google_calendar_client_id'),
        window.electron.calendar.getGoogleAccounts(),
      ]);
      if (clientResult.success) setClientId(clientResult.data ?? '');
      if (accountsResult.success && accountsResult.accounts)
        setAccounts(accountsResult.accounts);
    } catch (err) {
      console.error('[Calendar Settings] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveClientId = async () => {
    const res = await db.setSetting('google_calendar_client_id', clientId.trim());
    if (res.success) {
      showToast('success', 'Client ID guardado');
    } else {
      showToast('error', res.error || 'Error al guardar');
    }
  };

  const handleConnectGoogle = async () => {
    if (!window.electron?.calendar) return;
    setConnecting(true);
    try {
      const result = await window.electron.calendar.connectGoogle();
      if (result.success) {
        showToast('success', 'Cuenta de Google conectada');
        await loadData();
      } else {
        showToast('error', result.error || 'Error al conectar');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error al conectar');
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!window.electron?.calendar) return;
    setSyncing(true);
    try {
      const result = await window.electron.calendar.syncNow();
      if (result.success) {
        showToast('success', result.synced ? 'Sincronización completada' : (result.message || 'Sincronizado'));
        await loadData();
      } else {
        showToast('error', result.error || 'Error al sincronizar');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: 'var(--primary-text)' }}
        >
          Sincronización con Google Calendar
        </h2>
        <p
          className="text-sm"
          style={{ color: 'var(--secondary-text)' }}
        >
          Conecta tu cuenta de Google para sincronizar eventos entre Dome y Google Calendar.
        </p>
      </div>

      {/* Cuentas conectadas */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            Cuentas conectadas
          </h3>
          <ul className="space-y-2">
            {accounts.map((acc) => (
              <li
                key={acc.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                <span className="flex-1 text-sm" style={{ color: 'var(--primary-text)' }}>
                  {acc.account_email}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: acc.status === 'active' ? 'var(--success-subtle)' : 'var(--warning-subtle)',
                    color: acc.status === 'active' ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {acc.status === 'active' ? 'Activa' : acc.status}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sincronizar ahora
          </button>
        </div>
      )}

      {/* Conectar Google */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          {accounts.length > 0 ? 'Añadir otra cuenta' : 'Conectar cuenta'}
        </h3>
        <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
          {accounts.length === 0
            ? 'Se abrirá el navegador para que autorices el acceso a Google Calendar. Necesitas configurar un Client ID de Google Cloud Console primero.'
            : 'Conecta otra cuenta de Google para sincronizar eventos de múltiples calendarios.'}
        </p>
        <button
          type="button"
          onClick={handleConnectGoogle}
          disabled={connecting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
          }}
        >
          {connecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          {connecting ? 'Conectando...' : 'Conectar con Google'}
        </button>
      </div>

      {/* Client ID (opcional) */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          Configuración avanzada
        </h3>
        <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
          Si no tienes Google Client ID configurado por variables de entorno, puedes guardarlo aquí. Crea una credencial OAuth 2.0 en{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            Google Cloud Console
          </a>
          {'. '}
          Añade el URI de redirección: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">dome://calendar-oauth/callback</code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID de Google (ej. xxx.apps.googleusercontent.com)"
            className="flex-1 px-3 py-2 rounded-lg text-sm border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg)',
              color: 'var(--primary-text)',
            }}
          />
          <button
            type="button"
            onClick={handleSaveClientId}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
