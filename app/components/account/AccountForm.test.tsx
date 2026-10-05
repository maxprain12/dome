import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '@/lib/i18n';
import AccountForm from './AccountForm';

const nativeLogin = vi.fn();
beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.assign(window.electron, { domeAuth: { nativeLogin } });
  nativeLogin.mockReset();
});
function fill() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
}
it('submits registration through a form and connects only after confirmed authentication', async () => {
  nativeLogin.mockResolvedValue({ success: true, connected: true, name: 'Ada', email: 'ada@example.com' });
  const complete = vi.fn().mockResolvedValue(undefined);
  render(<AccountForm onConnected={complete} />);
  fill();
  fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!);
  await waitFor(() => expect(complete).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com' }));
  expect(nativeLogin).toHaveBeenCalledWith('ada@example.com', 'test-password', true, 'Ada Lovelace');
});
it('keeps email confirmation pending without connecting the account', async () => {
  nativeLogin.mockResolvedValue({ success: true, pendingConfirmation: true });
  const complete = vi.fn();
  render(<AccountForm onConnected={complete} />);
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText(/We sent a confirmation link to ada@example.com/)).toBeVisible();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'I confirmed my email. Sign in' }));
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeVisible();
});
it('retries a failed local save without repeating registration', async () => {
  nativeLogin.mockResolvedValue({ success: true, connected: true, name: 'Ada' });
  const complete = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  render(<AccountForm onConnected={complete} />);
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText(/We couldn't save your account details/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  expect(nativeLogin).toHaveBeenCalledTimes(1);
});
it('does not apply registration password rules to an existing account', async () => {
  nativeLogin.mockResolvedValue({ success: false, errorCode: 'invalid_credentials' });
  render(<AccountForm onConnected={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'old' } });
  fireEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
  await waitFor(() => expect(nativeLogin).toHaveBeenCalledWith('ada@example.com', 'old', false, undefined));
});
