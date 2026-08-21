'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@/lib/notifications';
import { useTabStore } from '@/lib/store/useTabStore';

interface SystemErrorPayload {
  severity: 'error' | 'warning';
  scope: string;
  code: string;
  message: string;
  detail?: string;
  runId?: string;
  title?: string;
  ts: number;
}

const KNOWN_SCOPES = new Set(['runs', 'workflows', 'automations', 'ai', 'indexing', 'sync']);
const KNOWN_CODES = new Set([
  'invalid_api_key',
  'rate_limit',
  'model_not_found',
  'model_not_in_plan',
  'credits_exhausted',
  'subscription_inactive',
  'network',
  'context_overflow',
  'unknown',
]);

const OPEN_AI_SETTINGS_CODES = new Set([
  'invalid_api_key',
  'model_not_found',
  'model_not_in_plan',
  'credits_exhausted',
  'subscription_inactive',
]);

/**
 * Global listener for `system:error-notification` (broadcast by
 * electron/core/error-notify.cjs). Renders main-process failures as Mantine
 * toasts with a translated cause+action message; the raw error goes in a
 * secondary line so the user can report it. Mounted once in AppShell.
 */
export default function SystemErrorNotifier() {
  const { t } = useTranslation();
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);

  useEffect(() => {
    const on = window.electron?.on;
    if (!on) return undefined;

    const cleanup = on('system:error-notification', (payload: SystemErrorPayload) => {
      if (!payload || typeof payload !== 'object') return;
      const scope = KNOWN_SCOPES.has(payload.scope) ? payload.scope : 'app';
      const code = KNOWN_CODES.has(payload.code) ? payload.code : 'unknown';
      const scopeTitle = t(`errors.system.scope.${scope}`);
      const codeMessage = t(`errors.system.code.${code}`);

      const title = payload.title ? `${scopeTitle} — ${payload.title}` : scopeTitle;
      // For unknown codes, the raw (truncated) message is the most useful
      // detail; for classified codes it goes on a secondary line.
      const message =
        code === 'unknown' && payload.message
          ? `${codeMessage}\n${payload.message.slice(0, 200)}`
          : codeMessage;

      notifications.show({
        id: `system-error-${scope}`,
        color: payload.severity === 'warning' ? 'yellow' : 'red',
        title,
        message,
        autoClose: 10000,
        withCloseButton: true,
        onClick: OPEN_AI_SETTINGS_CODES.has(code) ? () => openSettingsTab() : undefined,
        style: { cursor: OPEN_AI_SETTINGS_CODES.has(code) ? 'pointer' : undefined },
      });
    });

    return cleanup;
  }, [t, openSettingsTab]);

  return null;
}
