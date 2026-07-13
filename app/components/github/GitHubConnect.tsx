import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon, CopyIcon, ExternalLinkIcon, GithubIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { githubClient } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

/**
 * Device-flow connect screen. Shows the user code, opens GitHub, then polls
 * until authorized (the main process opens the verification URL automatically).
 */
export default function GitHubConnect({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const refreshStatus = useGitHubStore((s) => s.refreshStatus);
  const refreshCatalog = useGitHubStore((s) => s.refreshCatalog);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await githubClient.auth.start();
      if (!res.success || !res.deviceCode || !res.userCode) {
        setError(res.error || t('github.error_start_connect'));
        setBusy(false);
        return;
      }
      setUserCode(res.userCode);
      setVerificationUri(res.verificationUri ?? null);
      const poll = await githubClient.auth.poll({
        deviceCode: res.deviceCode,
        interval: res.interval,
        expiresIn: res.expiresIn,
      });
      if (poll.success) {
        await refreshStatus();
        await refreshCatalog(projectId);
      } else {
        setError(poll.error || t('github.error_auth_incomplete'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    if (!userCode) return;
    void navigator.clipboard.writeText(userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-foreground">
      <HugeiconsIcon icon={GithubIcon} size={48} className="text-primary" />
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold mb-1">{t('github.connect_title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('github.connect_description')}
        </p>
      </div>

      {userCode ? (
        <div
          className="flex flex-col items-center gap-3 p-5 rounded-lg w-full max-w-sm"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('github.enter_code_on_github')}
          </span>
          <Button
            type="button"
            onClick={copyCode}
            className="flex items-center gap-2 text-2xl font-mono font-bold px-4 py-2 rounded-md bg-accent"
          >
            {userCode}
            {copied ? <HugeiconsIcon icon={CheckIcon} size={18} /> : <HugeiconsIcon icon={CopyIcon} size={18} />}
          </Button>
          {verificationUri && (
            <a
              href={verificationUri}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-primary"
            >
              {t('github.open_on_github')} <HugeiconsIcon icon={ExternalLinkIcon} size={14} />
            </a>
          )}
          <span className="text-xs text-muted-foreground">
            {t('github.waiting_authorization')}
          </span>
        </div>
      ) : (
        <Button
          type="button"
          onClick={start}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2.5 rounded-md font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: busy ? 0.6 : 1 }}
        >
          <HugeiconsIcon icon={GithubIcon} size={18} /> {busy ? t('github.connecting') : t('github.connect_button')}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
