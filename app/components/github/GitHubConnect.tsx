import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon, CopyIcon, ExternalLinkIcon, GithubIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { githubClient } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { HubSurface } from '@/components/hub/HubBlocks';

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
    <div className="flex h-full flex-col items-center justify-center p-8 text-foreground">
      <HubSurface
        icon={GithubIcon}
        title={t('github.connect_title')}
        description={t('github.connect_description')}
        className="max-w-md"
      >
        {userCode ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-lg border bg-card p-5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('github.enter_code_on_github')}
            </span>
            <Button
              type="button"
              onClick={copyCode}
              variant="outline"
              className="font-mono text-lg tracking-widest"
            >
              {userCode}
              <HugeiconsIcon icon={copied ? CheckIcon : CopyIcon} data-icon="inline-end" />
            </Button>
            {verificationUri ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => window.open(verificationUri, '_blank', 'noreferrer')}
              >
                <HugeiconsIcon icon={ExternalLinkIcon} data-icon="inline-start" />
                {t('github.open_on_github')}
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">{t('github.waiting_authorization')}</span>
          </div>
        ) : (
          <Button type="button" onClick={() => void start()} disabled={busy}>
            <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" />
            {busy ? t('github.connecting') : t('github.connect_button')}
          </Button>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </HubSurface>
    </div>
  );
}
