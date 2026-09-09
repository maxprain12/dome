import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailEnvelope } from '@/lib/email/mailQueues';
import EmailView from './EmailView';
import i18n from '@/lib/i18n';

vi.mock('@/lib/ai/client', () => ({ chat: vi.fn() }));
vi.mock('@/lib/store/useAppStore', () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector({ currentProject: { id: 'vault' } }) }));
vi.mock('@/lib/store/useTabStore', () => ({ useTabStore: (selector: (state: unknown) => unknown) => selector({ openSettingsTab: vi.fn() }) }));
vi.mock('@/components/email/MailDashboard', () => ({
  MailDashboard: ({ inbox, sent, onOpen }: { inbox: MailEnvelope[]; sent: MailEnvelope[]; onOpen: (env: MailEnvelope) => void }) => (
    <div>{[...inbox, ...sent].map((env) => <button key={env.dbId} onClick={() => onOpen(env)}>{env.subject}</button>)}</div>
  ),
}));
vi.mock('@/components/email/MailDetailPanel', () => ({
  MailDetailPanel: ({ onReply, message }: { onReply: () => void; message: unknown }) => (
    <div><div>{typeof message === 'string' ? message : ''}</div><button onClick={onReply}>Reply to selected</button></div>
  ),
}));
const accounts = [
  { id: 'primary', email: 'primary@example.com', display_name: 'Shared name' },
  { id: 'secondary', email: 'secondary@example.com', display_name: 'Shared name' },
];
function envelopes(accountId: string, folder: string) {
  return [{ id: '42', dbId: `emsg-${accountId}-${folder}`, accountId, folder, subject: `${accountId} ${folder}`, from: { addr: 'contact@example.com' } }];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(async () => {
  await i18n.changeLanguage('es');
  Object.assign(window.electron, {
    people: { list: vi.fn().mockResolvedValue({ success: true, data: { people: [] } }) },
    email: {
      listAccounts: vi.fn().mockResolvedValue({ success: true, accounts }),
      listFolders: vi.fn().mockResolvedValue({ success: true, folders: [{ name: 'INBOX' }, { name: 'Sent' }] }),
      listEnvelopes: vi.fn().mockImplementation(async ({ accountId, folder }) => ({ success: true, envelopes: envelopes(accountId, folder) })),
      read: vi.fn().mockResolvedValue({ success: true, message: 'Message body' }),
      syncStatus: vi.fn().mockResolvedValue({ success: true, data: { syncing: false } }),
      onSyncStatus: vi.fn(() => vi.fn()), onDataUpdated: vi.fn(() => vi.fn()),
      syncNow: vi.fn().mockResolvedValue({ success: true }),
      send: vi.fn().mockResolvedValue({ success: true }), reply: vi.fn().mockResolvedValue({ success: true }),
      search: vi.fn().mockResolvedValue({ success: true, envelopes: [] }),
    },
  });
});
async function switchAccount() {
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByRole('option', { name: 'secondary@example.com' }));
  await screen.findByText('secondary INBOX');
}
describe('mail account and message context', () => {
  it('loads only the selected account and discards an older account response', async () => {
    const slow = deferred<{ success: boolean; envelopes: MailEnvelope[] }>();
    vi.mocked(window.electron.email.listEnvelopes).mockImplementation(async ({ accountId, folder }) => {
      if (accountId === 'primary' && folder === 'INBOX') return slow.promise;
      return { success: true, envelopes: envelopes(accountId!, folder!) };
    });
    render(<EmailView />);
    await screen.findByText('primary Sent');
    await switchAccount();
    await act(async () => { slow.resolve({ success: true, envelopes: envelopes('primary', 'INBOX') }); });
    expect(screen.queryByText('primary INBOX')).not.toBeInTheDocument();
    expect(window.electron.email.listAccounts).toHaveBeenCalledTimes(1);
    expect(window.electron.email.listAccounts).toHaveBeenCalledWith({ projectId: 'vault' });
    expect(window.electron.email.listFolders).toHaveBeenLastCalledWith({ projectId: 'vault', accountId: 'secondary' });
    expect(vi.mocked(window.electron.email.listEnvelopes).mock.calls.every(([params]) => Boolean(params.accountId))).toBe(true);
  });
  it('keeps the draft across sync and sends with the visible account', async () => {
    render(<EmailView />);
    await screen.findByText('primary INBOX');
    await switchAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Redactar' }));
    expect(screen.getByText('Enviando desde secondary@example.com')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'recipient@example.com' } });
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'My draft' } });
    const notifyData = vi.mocked(window.electron.email.onDataUpdated).mock.calls.at(-1)?.[0];
    await act(async () => { notifyData?.({ projectId: 'vault', accountId: 'secondary' }); });
    expect(screen.getByLabelText('Mensaje')).toHaveValue('My draft');
    expect(screen.getByRole('dialog', { name: 'Redactar' })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(window.electron.email.send).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'secondary', projectId: 'vault', body: 'My draft' }));
  });
  it('distinguishes the same UID in Inbox and Sent and preserves reply context', async () => {
    render(<EmailView />);
    await userEvent.click(await screen.findByText('primary INBOX'));
    expect(window.electron.email.read).toHaveBeenLastCalledWith(expect.objectContaining({ messageId: 'emsg-primary-INBOX', folder: 'INBOX' }));
    await userEvent.click(screen.getByText('primary Sent'));
    expect(window.electron.email.read).toHaveBeenLastCalledWith(expect.objectContaining({ messageId: 'emsg-primary-Sent', folder: 'Sent' }));
    await userEvent.click(screen.getByText('Reply to selected'));
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Reply draft' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(window.electron.email.reply).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'primary', messageId: 'emsg-primary-Sent', folder: 'Sent' }));
  });
  it('shows a failed account lookup as an error instead of an empty vault', async () => {
    vi.mocked(window.electron.email.listAccounts).mockRejectedValueOnce(new Error('Database unavailable'));
    render(<EmailView />);
    expect(await screen.findByText('Database unavailable')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('primary INBOX');
    expect(window.electron.email.listAccounts).toHaveBeenCalledTimes(2);
  });
  it('opens a focused message after loading its account and folder', async () => {
    render(<EmailView />);
    await screen.findByText('primary INBOX');
    act(() => { window.dispatchEvent(new CustomEvent('dome:focus-email', { detail: {
      sourceId: 'emsg-secondary-Archive', accountId: 'secondary', folder: 'Archive', uid: '42',
    } })); });
    await waitFor(() => expect(window.electron.email.read).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'secondary', messageId: 'emsg-secondary-Archive', folder: 'Archive',
    })));
    expect(screen.queryByText('primary INBOX')).not.toBeInTheDocument();
  });
  it('retains draft text and exposes a rejected send', async () => {
    vi.mocked(window.electron.email.send).mockRejectedValueOnce(new Error('SMTP unavailable'));
    render(<EmailView />);
    await screen.findByText('primary INBOX');
    await userEvent.click(screen.getByRole('button', { name: 'Redactar' }));
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'recipient@example.com' } });
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Keep this draft' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('SMTP unavailable')).toBeVisible();
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Keep this draft');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });
});
