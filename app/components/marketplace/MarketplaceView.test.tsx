import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import { useComplementIntentStore } from '@/lib/store/useComplementIntentStore';
import MarketplaceView from './MarketplaceView';

const mocks = vi.hoisted(() => ({ install: vi.fn(), toast: vi.fn(), plugins: [] as Array<{ id: string; version: string }> }));
vi.mock('@/lib/marketplace/api', () => ({
  getMarketplaceAgents: async () => [], getInstalledMarketplaceAgentIds: async () => [], getInstalledMarketplaceAgentRecords: async () => ({}),
  getInstalledWorkflowTemplateIds: async () => [], getInstalledWorkflowRecords: async () => ({}),
  installMarketplaceAgent: vi.fn(), installWorkflowTemplate: vi.fn(), getWorkflowIdForTemplate: vi.fn(),
}));
vi.mock('@/lib/marketplace/loaders', () => ({ loadMarketplaceWorkflows: async () => [], loadMarketplaceMcp: async () => [], loadMarketplaceSkills: async () => [] }));
vi.mock('@/lib/marketplace/loader', () => ({ loadAvailablePlugins: async () => [{ id: 'dome-cms', name: 'Dome CMS', description: 'CMS', version: '1.2.0', author: 'Dome', bundled: 'dome-cms' }] }));
vi.mock('@/lib/store/useMarketplaceStore', () => ({ useMarketplaceStore: () => ({ plugins: mocks.plugins, loading: false, refresh: async () => {} }) }));
vi.mock('@/lib/store/useToastStore', () => ({ showToast: mocks.toast }));
vi.mock('@/lib/skills/client', () => ({ listSkills: async () => ({ success: true, data: [] }), openSkillsFolder: vi.fn(), installBundledSkill: vi.fn() }));
vi.mock('@/lib/mcp/settings', () => ({ loadMcpServersSetting: async () => [], saveMcpServersSetting: vi.fn() }));

beforeEach(async () => {
  await i18n.changeLanguage('es');
  mocks.plugins = [];
  mocks.install.mockResolvedValue({ success: true });
  useComplementIntentStore.getState().setIntent(null);
  Object.assign(window.electron, { plugins: { list: async () => ({ success: true, data: mocks.plugins }), installBundled: mocks.install } });
});

describe('Complement links and CMS review', () => {
  it('retains an intent until loading, opens its review and only installs on explicit click', async () => {
    useComplementIntentStore.getState().setIntent({ category: 'plugins', id: 'dome-cms' });
    render(<MarketplaceView />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('notes.read');
    expect(dialog).toHaveTextContent('Repositorio Astro');
    expect(mocks.install).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: i18n.t('marketplace.install_plugin') }));
    expect(mocks.install).toHaveBeenCalledWith('dome-cms');
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('marketplace.installed') })).toBeDisabled());
  });

  it('offers update for an older installed CMS version', async () => {
    mocks.plugins = [{ id: 'dome-cms', version: '1.1.0' }];
    useComplementIntentStore.getState().setIntent({ category: 'plugins', id: 'dome-cms' });
    render(<MarketplaceView />);
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: i18n.t('marketplace.update_plugin') })).toBeEnabled();
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('shows a recoverable message for an unknown identity', async () => {
    useComplementIntentStore.getState().setIntent({ category: 'plugins', id: 'unknown-plugin' });
    render(<MarketplaceView />);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('info', i18n.t('marketplace.link_unknown')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useComplementIntentStore.getState().intent).toBeNull();
    expect(mocks.install).not.toHaveBeenCalled();
  });
});
