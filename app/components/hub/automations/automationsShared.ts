/**
 * Shared automation drawer state (03/T02 — extracted from AutomationsWorkspaceView.tsx):
 * draft types, the empty draft and the hub date formatter.
 */

import type { AutomationArtifactBinding, AutomationOutputMode } from '@/lib/automations/api';
import { getDateTimeLocaleTag } from '@/lib/i18n';

export type AutomationBindingDraft = {
  id?: string;
  artifactResourceId: string;
  slot: string;
  updatePolicy: AutomationArtifactBinding['updatePolicy'];
  extractMode: AutomationArtifactBinding['extractMode'];
  enabled: boolean;
};

export type DraftState = {
  id?: string;
  title: string;
  description: string;
  targetType: 'agent' | 'workflow' | 'feeder';
  targetId: string;
  triggerType: 'manual' | 'schedule' | 'contextual';
  enabled: boolean;
  cadence: 'daily' | 'weekly' | 'cron-lite';
  hour: number;
  weekday: number;
  intervalMinutes: number;
  outputMode: AutomationOutputMode;
  prompt: string;
  /** Comma-separated context tags when trigger is contextual (e.g. resource_opened) */
  contextTags: string;
  artifactBindings: AutomationBindingDraft[];
  boundArtifactResourceId: string;
  artifactOutputSlot: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatHubDate(ts: number | undefined | null, neverLabel: string) {
  if (!ts) return neverLabel;
  return new Date(ts).toLocaleString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const EMPTY_DRAFT: DraftState = {
  title: '',
  description: '',
  targetType: 'agent',
  targetId: '',
  triggerType: 'manual',
  enabled: true,
  cadence: 'daily',
  hour: 8,
  weekday: 1,
  intervalMinutes: 60,
  outputMode: 'chat_only',
  prompt: '',
  contextTags: 'resource_opened',
  artifactBindings: [],
  boundArtifactResourceId: '',
  artifactOutputSlot: 'default',
};
