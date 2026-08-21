import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SafeText } from '@/components/shared/SafeText';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

type Props = {
  repoId: string;
  /** Absolute path already bound to this repo, if any. */
  localPath: string | null;
  /** Repo full name, used as the default workspace label. */
  label?: string;
};

/**
 * Binds a tracked GitHub repo to its clone on disk — the link that lets Many
 * open a coding workspace straight from an issue ("resuélvelo, lo tengo aquí").
 */
export function RepoWorkspaceRow({ repoId, localPath, label }: Props) {
  const { t } = useTranslation();
  const setRepoLocalPath = useGitHubStore((s) => s.setRepoLocalPath);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [trusted, setTrusted] = useState(false);
  const [trustPrompt, setTrustPrompt] = useState<string | null>(null);

  const syncWorkspaceState = useCallback(async (path: string | null) => {
    if (!path) {
      setMissing(false);
      setTrusted(false);
      return;
    }
    const res = await window.electron?.coding?.workspace?.list?.();
    const row = res?.success ? res.data.find((w) => w.path === path) : null;
    setMissing(Boolean(row) && !row!.exists);
    setTrusted(Boolean(row?.trusted));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const path = localPath;
      const res = await window.electron?.coding?.workspace?.list?.();
      if (cancelled) return;
      if (!path) {
        setMissing(false);
        setTrusted(false);
        return;
      }
      const row = res?.success ? res.data.find((w) => w.path === path) : null;
      setMissing(Boolean(row) && !row!.exists);
      setTrusted(Boolean(row?.trusted));
    })();
    return () => {
      cancelled = true;
    };
  }, [localPath]);

  const pick = useCallback(async () => {
    setBusy(true);
    try {
      const res = await window.electron?.coding?.workspace?.pick?.({ label });
      if (!res?.success || res.cancelled || !res.data) return;
      await setRepoLocalPath(repoId, res.data.path);
      await syncWorkspaceState(res.data.path);
      // Trust is asked once per repository, right after binding it.
      if (!res.data.trusted) setTrustPrompt(res.data.path);
    } finally {
      setBusy(false);
    }
  }, [label, repoId, setRepoLocalPath, syncWorkspaceState]);

  const confirmTrust = useCallback(async () => {
    if (!trustPrompt) return;
    setBusy(true);
    try {
      await window.electron?.coding?.workspace?.trust?.({ path: trustPrompt, trusted: true });
      await syncWorkspaceState(trustPrompt);
    } finally {
      setBusy(false);
      setTrustPrompt(null);
    }
  }, [trustPrompt, syncWorkspaceState]);

  const unlink = useCallback(async () => {
    setBusy(true);
    try {
      await setRepoLocalPath(repoId, null);
      setTrusted(false);
      setMissing(false);
    } finally {
      setBusy(false);
    }
  }, [repoId, setRepoLocalPath]);

  return (
    <div className="flex items-center gap-2 min-w-0 rounded-xl border border-border bg-card px-3 py-2">
      <HugeiconsIcon icon={FolderLibraryIcon} size={15} className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('github.local_repo')}
          {localPath ? (
            <Badge variant={trusted ? 'mint' : 'outline'} className="h-4 px-1.5 text-[10px] normal-case">
              {trusted ? t('github.local_repo_trusted') : t('github.local_repo_untrusted')}
            </Badge>
          ) : null}
        </span>
        {localPath ? (
          <SafeText className="text-xs text-foreground" title={localPath}>
            {localPath}
          </SafeText>
        ) : (
          <SafeText className="text-xs text-muted-foreground">{t('github.local_repo_hint')}</SafeText>
        )}
        {missing ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-destructive">
            <HugeiconsIcon icon={Alert01Icon} size={11} />
            {t('github.local_repo_missing')}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void pick()}>
          {localPath ? t('github.local_repo_change') : t('github.local_repo_link')}
        </Button>
        {localPath && !trusted ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => setTrustPrompt(localPath)}>
            {t('github.local_repo_trust_action')}
          </Button>
        ) : null}
        {localPath ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()}>
            {t('github.local_repo_unlink')}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={trustPrompt !== null}
        busy={busy}
        title={t('github.local_repo_trust_title')}
        message={t('github.local_repo_trust_message', { path: trustPrompt ?? '' })}
        confirmLabel={t('github.local_repo_trust_action')}
        onConfirm={() => void confirmTrust()}
        onCancel={() => setTrustPrompt(null)}
      />
    </div>
  );
}

export default RepoWorkspaceRow;
