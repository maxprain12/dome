import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAISectionController } from './useAISectionController';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import { loadProviderSlotApiKey } from './aiSectionHelpers';
vi.mock('@/lib/settings', () => ({ getAIConfig: vi.fn(), saveAIConfig: vi.fn() }));
vi.mock('@/lib/ai/useProviderModels', () => ({ useProviderModels: () => ({ models: [], loading: false }) }));
vi.mock('./aiSectionHelpers', async (original) => ({ ...await original<typeof import('./aiSectionHelpers')>(), loadProviderSlotApiKey: vi.fn().mockResolvedValue('masked') }));
const testConnection = vi.fn();
beforeEach(() => {
  vi.mocked(getAIConfig).mockResolvedValue({ provider: 'openai', model: 'saved-model', api_key: 'masked' });
  vi.mocked(saveAIConfig).mockResolvedValue(undefined);
  testConnection.mockReset().mockResolvedValue({ success: true, provider: 'openai' });
  Object.assign(window.electron, { ai: { testConnection } });
});
async function setup() {
  const hook = renderHook(useAISectionController);
  await waitFor(() => expect(hook.result.current.initialLoading).toBe(false));
  return hook;
}
it('does not test a different saved provider when saving the selected one fails', async () => {
  vi.mocked(saveAIConfig).mockRejectedValueOnce(new Error('disk unavailable'));
  const { result } = await setup();
  await act(() => result.current.handleTestConnection());
  expect(testConnection).not.toHaveBeenCalled();
  expect(result.current.saved).toBe(false);
  expect(result.current.testResult?.success).toBe(false);
});
it('saves transcription without touching conversation credentials or provider', async () => {
  const { result } = await setup();
  const save = vi.fn().mockResolvedValue(true);
  act(() => { Object.assign(result.current.transcriptionRef, { current: { save } }); result.current.setActiveTab('transcription'); });
  await act(() => result.current.handleSave());
  expect(save).toHaveBeenCalledOnce();
  expect(saveAIConfig).not.toHaveBeenCalled();
  expect(result.current.saved).toBe(true);
});
it('does not report an unsuccessful transcription save as complete', async () => {
  const { result } = await setup();
  act(() => { Object.assign(result.current.transcriptionRef, { current: { save: vi.fn().mockResolvedValue(false) } }); result.current.setActiveTab('transcription'); });
  await act(() => result.current.handleSave());
  expect(result.current.saved).toBe(false);
});
it('discards an older provider credential response', async () => {
  const { result } = await setup();
  let resolveOld!: (value: string) => void;
  vi.mocked(loadProviderSlotApiKey).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce('new-provider-key');
  act(() => result.current.handleProviderChange('anthropic'));
  act(() => result.current.handleProviderChange('google'));
  await waitFor(() => expect(result.current.apiKey).toBe('new-provider-key'));
  await act(async () => resolveOld('old-provider-key'));
  expect(result.current.provider).toBe('google');
  expect(result.current.apiKey).toBe('new-provider-key');
});
it('clears saved and tested feedback after editing configuration', async () => {
  const { result } = await setup();
  await act(() => result.current.handleTestConnection());
  expect(result.current.saved).toBe(true);
  act(() => result.current.setModel('another-model'));
  expect(result.current.saved).toBe(false);
  expect(result.current.testResult).toBeNull();
});
it('prevents duplicate saves while persistence is pending', async () => {
  const { result } = await setup();
  let finish!: () => void;
  vi.mocked(saveAIConfig).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.handleSave(); });
  await act(() => result.current.handleSave());
  expect(saveAIConfig).toHaveBeenCalledOnce();
  await act(async () => { finish(); await pending; });
});

it('does not activate a cloud provider before its API key is supplied', async () => {
  const { result } = await setup();
  act(() => result.current.setApiKey(''));
  await act(() => result.current.handleSave());
  expect(saveAIConfig).not.toHaveBeenCalled();
  expect(result.current.saved).toBe(false);
  expect(result.current.testResult?.success).toBe(false);
});
