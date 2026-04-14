import type { PersistentRunUsage } from '@/lib/automations/api';
import { findModelById } from '@/lib/ai/models';

function parseUsagePayload(raw: unknown): PersistentRunUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const input = Math.max(0, Math.floor(Number(o.inputTokens ?? o.input_tokens ?? 0) || 0));
  const output = Math.max(0, Math.floor(Number(o.outputTokens ?? o.output_tokens ?? 0) || 0));
  let total = Math.max(0, Math.floor(Number(o.totalTokens ?? o.total_tokens ?? 0) || 0));
  if (input <= 0 && output <= 0 && total <= 0) return null;
  if (total <= 0 && input + output > 0) total = input + output;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

export function getRunUsageFromRunMetadata(
  metadata: Record<string, unknown> | undefined | null,
): PersistentRunUsage | null {
  return parseUsagePayload(metadata?.usage);
}

/**
 * Estimated USD cost from catalog pricing (per 1M tokens). Returns null if unknown model or no billable tokens.
 */
export function estimateRunCostUsd(
  modelId: string | undefined | null,
  usageRaw: unknown,
): number | null {
  if (!modelId?.trim()) return null;
  const usage = parseUsagePayload(usageRaw);
  if (!usage) return null;
  const { inputTokens, outputTokens } = usage;
  if (inputTokens <= 0 && outputTokens <= 0) return null;
  const found = findModelById(modelId.trim());
  const cost = found?.model.cost;
  if (!cost) return null;
  return (inputTokens / 1_000_000) * cost.input + (outputTokens / 1_000_000) * cost.output;
}

export function formatUsdEstimate(amount: number | null, locale: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
