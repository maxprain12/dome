import { expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { saveAIConfig } from './index';
vi.mock('@/lib/db/client', () => ({ db: { setSetting: vi.fn().mockResolvedValue({ success: true }) } }));
it('propagates a rejected IPC write instead of reporting saved', async () => {
  vi.mocked(db.setSetting).mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
  await expect(saveAIConfig({ provider: 'openai', api_key: 'test-key' })).rejects.toThrow('Could not save AI settings');
});
it('also detects a failed provider-specific credential write', async () => {
  vi.mocked(db.setSetting).mockImplementation(async (key) => ({ success: key !== 'ai_api_key_anthropic' }));
  await expect(saveAIConfig({ provider: 'anthropic', api_key: 'test-key' })).rejects.toThrow();
});
