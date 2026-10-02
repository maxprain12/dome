import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useManyConversationSettings } from './useManyConversationSettings';

const mocks = vi.hoisted(() => ({ config: vi.fn(), invoke: vi.fn() }));
vi.mock('react-i18next', () => { const t = (key: string) => key; return { useTranslation: () => ({ t }) }; });
vi.mock('@/lib/ai', () => ({ getAIConfig: mocks.config, findModelById: () => undefined, providerSupportsTools: (provider: string) => provider === 'openai' }));
vi.mock('@/lib/ai/context-window', () => ({ fallbackContextWindow: () => 200000, parseContextWindow: (value: unknown) => typeof value === 'number' ? value : 0, readPersistedContextWindow: async () => 0 }));
vi.mock('@/lib/db/client', () => ({ db: { isAvailable: () => false } }));
vi.mock('@/lib/personality/memory-policy', () => ({ memoryPolicy: async () => ({ enabled: true }) }));
vi.mock('@/lib/store/useManyStore', () => ({ useManyStore: (select: (state: { currentSessionId: string }) => unknown) => select({ currentSessionId: 'existing-conversation' }) }));
vi.mock('@/lib/store/useAppStore', () => ({ useAppStore: (select: (state: { currentProject: { id: string } }) => unknown) => select({ currentProject: { id: 'default' } }) }));
vi.mock('@/lib/store/useToastStore', () => ({ showToast: vi.fn() }));
const original = Object.getOwnPropertyDescriptor(window, 'electron');

beforeEach(() => {
  mocks.config.mockResolvedValue({ provider: 'registered-custom', model: 'custom-model' });
  mocks.invoke.mockResolvedValue({ success: true, supportsTools: true, contextWindow: 32768 });
  Object.defineProperty(window, 'electron', { configurable: true, value: { invoke: mocks.invoke,
    personality: { getAgentMemoryContext: async () => ({ success: true, data: {} }) } } });
});
afterEach(() => { vi.clearAllMocks(); if (original) Object.defineProperty(window, 'electron', original); });

describe('Many shared model capabilities', () => {
  it('enables tools for registered providers missing from the legacy catalog and uses their context budget', async () => {
    const { result } = renderHook(() => useManyConversationSettings());
    await waitFor(() => expect(result.current.supportsTools).toBe(true));
    await waitFor(() => expect(result.current.budgetCapApprox).toBe(32768));
    expect(mocks.invoke).toHaveBeenCalledWith('ai:model:input', { provider: 'registered-custom', model: 'custom-model' });
  });
  it('refreshes capabilities after a model change in the existing conversation', async () => {
    const { result } = renderHook(() => useManyConversationSettings());
    await waitFor(() => expect(result.current.supportsTools).toBe(true));
    mocks.config.mockResolvedValue({ provider: 'registered-custom', model: 'changed-model' });
    mocks.invoke.mockResolvedValue({ success: true, supportsTools: false, contextWindow: 8192 });
    act(() => window.dispatchEvent(new Event('dome:ai-config-changed')));
    await waitFor(() => expect(result.current.supportsTools).toBe(false));
    await waitFor(() => expect(result.current.budgetCapApprox).toBe(8192));
    expect(result.current.providerInfo).toContain('changed-model');
  });
});
