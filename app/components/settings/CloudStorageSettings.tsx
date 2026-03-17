'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cloud, HardDrive, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';

interface CloudAccount {
  provider: 'google' | 'onedrive';
  accountId: string;
  email: string;
  connected: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Drive',
  onedrive: 'OneDrive',
};

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google: <Cloud size={18} style={{ color: '#4285f4' }} />,
  onedrive: <HardDrive size={18} style={{ color: '#0078d4' }} />,
};

export default function CloudStorageSettings() {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!window.electron?.cloud) return;
    setLoading(true);
    try {
      const result = await window.electron.cloud.getAccounts();
      if (result.success) setAccounts(result.accounts ?? []);
    } catch (err) {
      console.error('[CloudStorage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();

    // Listen for OAuth callback results
    const cleanup = window.electron?.cloud?.onAuthResult?.((data: { success: boolean; provider: string; email?: string; error?: string }) => {
      if (data.success) {
        showToast('success', `${PROVIDER_LABELS[data.provider] ?? data.provider} connected as ${data.email}`);
        loadAccounts();
      } else {
        showToast('error', data.error || 'Connection failed');
      }
      setConnecting(null);
    });

    return () => cleanup?.();
  }, [loadAccounts]);

  const handleConnect = async (provider: 'google' | 'onedrive') => {
    if (!window.electron?.cloud) return;
    setConnecting(provider);
    try {
      const result = provider === 'google'
        ? await window.electron.cloud.authGoogle()
        : await window.electron.cloud.authOneDrive();
      if (!result.success) {
        showToast('error', result.error || 'Failed to start OAuth flow');
        setConnecting(null);
      }
      // Success: onAuthResult listener will handle the callback
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unknown error');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.electron?.cloud) return;
    try {
      const result = await window.electron.cloud.disconnect(accountId);
      if (result.success) {
        showToast('success', 'Account disconnected');
        setAccounts((prev) => prev.filter((a) => a.accountId !== accountId));
      } else {
        showToast('error', result.error || 'Failed to disconnect');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const googleConnected = accounts.some((a) => a.provider === 'google');
  const onedriveConnected = accounts.some((a) => a.provider === 'onedrive');

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--primary-text)', marginBottom: 4 }}>
        Cloud Storage
      </h2>
      <p style={{ fontSize: 13, color: 'var(--secondary-text)', marginBottom: 24 }}>
        Connect Google Drive or OneDrive to browse and import files directly into Dome.
      </p>

      {/* Setup notice */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <AlertCircle size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--secondary-text)', margin: 0, lineHeight: 1.5 }}>
          To use cloud storage, set the environment variables{' '}
          <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>
            DOME_GOOGLE_DRIVE_CLIENT_ID
          </code>{' '}
          /{' '}
          <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>
            DOME_GOOGLE_DRIVE_CLIENT_SECRET
          </code>{' '}
          for Google Drive, and{' '}
          <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>
            DOME_ONEDRIVE_CLIENT_ID
          </code>{' '}
          for OneDrive. Register <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>dome://oauth/callback</code> as redirect URI in your OAuth app.
        </p>
      </div>

      {/* Connected accounts */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tertiary-text)', fontSize: 13 }}>
          <RefreshCw size={14} className="animate-spin" /> Loading accounts…
        </div>
      ) : accounts.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', marginBottom: 12 }}>
            Connected accounts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((account) => (
              <div
                key={account.accountId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {PROVIDER_ICONS[account.provider]}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary-text)' }}>
                      {PROVIDER_LABELS[account.provider] ?? account.provider}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>{account.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                  <button
                    onClick={() => handleDisconnect(account.accountId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--tertiary-text)',
                      padding: '4px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Disconnect"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Connect buttons */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', marginBottom: 12 }}>
        {accounts.length > 0 ? 'Add another account' : 'Connect a cloud account'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={() => handleConnect('google')}
          disabled={connecting === 'google'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: connecting === 'google' ? 'not-allowed' : 'pointer',
            opacity: connecting === 'google' ? 0.7 : 1,
            color: 'var(--primary-text)',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          {connecting === 'google' ? (
            <RefreshCw size={16} className="animate-spin" style={{ color: '#4285f4' }} />
          ) : (
            <Cloud size={16} style={{ color: '#4285f4' }} />
          )}
          {googleConnected ? 'Connect another Google Drive account' : 'Connect Google Drive'}
        </button>

        <button
          onClick={() => handleConnect('onedrive')}
          disabled={connecting === 'onedrive'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: connecting === 'onedrive' ? 'not-allowed' : 'pointer',
            opacity: connecting === 'onedrive' ? 0.7 : 1,
            color: 'var(--primary-text)',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          {connecting === 'onedrive' ? (
            <RefreshCw size={16} className="animate-spin" style={{ color: '#0078d4' }} />
          ) : (
            <HardDrive size={16} style={{ color: '#0078d4' }} />
          )}
          {onedriveConnected ? 'Connect another OneDrive account' : 'Connect OneDrive'}
        </button>
      </div>
    </div>
  );
}
