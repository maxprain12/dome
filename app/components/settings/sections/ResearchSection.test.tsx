import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import ResearchSection from './ResearchSection';
import type { ResearchStatus } from '../research/types';

const snapshot = (): ResearchStatus => ({ success: true,
  channels: [
    { platform: 'web', group: 'web', accessStatus: 'enabled', readiness: 'configured', operations: ['read', 'search'], wanted: ['read'], backends: ['readability', 'browser'], upstream: ['Jina Reader'], lastCheck: null },
    { platform: 'exa_search', group: 'web', accessStatus: 'enabled', readiness: 'requires_permission', operations: ['search'], wanted: ['search'], backends: ['exa'], upstream: ['Exa MCP'], lastCheck: null },
    { platform: 'linkedin', group: 'career', accessStatus: 'pending_enablement', readiness: 'pending_enablement', operations: [], wanted: ['profile'], backends: ['import'], upstream: ['LinkedIn MCP'], lastCheck: null },
  ],
  policy: { enabledProviders: [], perRunUsd: 0.25, monthlyUsd: 10 },
  routing: { disabledPlatforms: [], searchProvider: 'auto', webSource: 'http' },
  providers: [{ name: 'brave', configured: false, enabled: false, estimatedUsdPerSearch: 0.005 }, { name: 'tavily', configured: false, enabled: false, estimatedUsdPerSearch: 0.008 }, { name: 'exa', configured: true, enabled: false, estimatedUsdPerSearch: 0.007 }],
  usage: { spent: 0 }, browser: { state: 'requires_connection', selectedTabs: 0 },
  upstream: { repository: 'https://github.com/Panniantong/Agent-Reach', commit: 'a19a171fa980a0785849596492e0af4db800c82f', license: 'MIT' }, pricingAsOf: '2026-10-01',
});
const invoke = vi.fn();
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal('electron', { invoke });
  invoke.mockImplementation(async (channel) => channel === 'research:status' ? snapshot() : { success: true });
});
afterEach(() => vi.unstubAllGlobals());

it('diagnoses locally, filters sources and never probes or spends on mount', async () => {
  render(<ResearchSection />);
  expect(await screen.findByRole('button', { name: /LinkedIn/ })).toBeVisible();
  expect(invoke.mock.calls.map(([name]) => name)).toEqual(['research:status']);
  await userEvent.type(screen.getByRole('textbox', { name: 'Find a source or tool…' }), 'LinkedIn');
  expect(screen.queryByRole('button', { name: /^Web/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /LinkedIn/ }));
  expect(screen.queryByRole('button', { name: 'Run test' })).not.toBeInTheDocument();
  expect(screen.getByText('Available now:', { exact: false })).toHaveTextContent('Evidence import');
});

it('preserves source drafts across selection and only imports on explicit save', async () => {
  invoke.mockImplementation(async (channel) => channel === 'research:status' ? snapshot() : { success: false, error: 'disk' });
  render(<ResearchSection />);
  await userEvent.click(await screen.findByRole('button', { name: /LinkedIn/ }));
  await userEvent.click(screen.getByText('Import evidence', { exact: true }));
  await userEvent.type(screen.getByLabelText('Source URL'), 'https://www.linkedin.com/in/test');
  await userEvent.type(screen.getByLabelText('Note title'), 'Observed profile');
  await userEvent.type(screen.getByLabelText('Evidence text'), 'Authorized evidence');
  await userEvent.click(screen.getByRole('button', { name: /^Web/ }));
  await userEvent.click(screen.getByRole('button', { name: /LinkedIn/ }));
  expect(screen.getByLabelText('Evidence text')).toHaveValue('Authorized evidence');
  expect(invoke.mock.calls.some(([name]) => name === 'research:import')).toBe(false);
  if (!screen.getByLabelText('Evidence text').closest('details')?.open) await userEvent.click(screen.getByText('Import evidence', { exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Save evidence as a note' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('research:import', expect.any(Object)));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the evidence');
  expect(screen.getByLabelText('Evidence text')).toHaveValue('Authorized evidence');
  expect(invoke).toHaveBeenCalledWith('research:import', { platform: 'linkedin', url: 'https://www.linkedin.com/in/test', title: 'Observed profile', text: 'Authorized evidence' });
});

it('keeps provider edits after failed saves and never shows a stored secret', async () => {
  invoke.mockImplementation(async (channel) => channel === 'research:status' ? snapshot() : { success: false, error: 'configuration_save_failed' });
  render(<ResearchSection />);
  await screen.findByRole('button', { name: /LinkedIn/ });
  await userEvent.click(screen.getByText('Providers, routes and budgets', { exact: true }));
  const exa = screen.getAllByLabelText('API key')[2];
  expect(exa).toHaveValue('');
  await userEvent.type(exa, 'replacement-key');
  await userEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(exa).toHaveValue('replacement-key');
  expect(invoke).toHaveBeenCalledWith('research:configure', expect.objectContaining({ keys: { exa: 'replacement-key' } }));
});

it('accepts decimal budgets and reports a confirmed save even if the diagnosis refresh fails', async () => {
  render(<ResearchSection />);
  await screen.findByRole('button', { name: /LinkedIn/ });
  await userEvent.click(screen.getByText('Providers, routes and budgets', { exact: true }));
  const limit = screen.getByLabelText('Per investigation limit (USD)');
  await userEvent.clear(limit); await userEvent.type(limit, '0.08');
  expect(limit).toHaveValue(0.08);
  invoke.mockImplementation(async (channel) => channel === 'research:status' ? { success: false } : { success: true });
  await userEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Configuration saved');
  expect(invoke).toHaveBeenCalledWith('research:configure', expect.objectContaining({ policy: expect.objectContaining({ perRunUsd: 0.08 }) }));
  expect(limit).toHaveValue(0.08);
});

it('sends a scoped explicit test, offers cancellation and does not save evidence', async () => {
  let finish!: (value: unknown) => void;
  invoke.mockImplementation((channel) => channel === 'research:test' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(channel === 'research:status' ? snapshot() : { success: true }));
  render(<ResearchSection />);
  await screen.findByRole('button', { name: /LinkedIn/ });
  fireEvent.change(screen.getAllByLabelText('Source URL')[0], { target: { value: 'https://example.com/page' } });
  await userEvent.click(screen.getByRole('button', { name: 'Run test' }));
  const request = invoke.mock.calls.find(([name]) => name === 'research:test')?.[1];
  expect(request).toEqual({ requestId: expect.any(String), name: 'research_read', input: { platform: 'web', url: 'https://example.com/page', source: 'http' } });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel test' }));
  expect(invoke).toHaveBeenCalledWith('research:cancel', { id: request.requestId });
  finish({ success: false, error: 'cancelled' });
  expect(await screen.findByRole('alert')).toHaveTextContent('The test was cancelled.');
  expect(invoke.mock.calls.some(([name]) => name === 'research:import' || name === 'research:execute')).toBe(false);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run test' })).toBeEnabled());
});

it('shows load errors and retries without declaring sources verified', async () => {
  invoke.mockResolvedValueOnce({ success: false });
  render(<ResearchSection />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load settings');
  await userEvent.click(screen.getByRole('button', { name: 'Check configuration' }));
  expect(await screen.findByRole('button', { name: /LinkedIn/ })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
