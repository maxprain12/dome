import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { SafeText } from '@/components/shared/SafeText';
import type { PinnedResource } from '@/lib/store/useManyStore';

/**
 * Shows which repository the next turn will work in.
 *
 * The path comes from a pinned issue bound to a local clone; without one the
 * chip is absent and the coding tools are not offered to the agent at all.
 */
export default function CodingWorkspaceChip({
  pinnedResources,
}: {
  pinnedResources: PinnedResource[];
}) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState<CodingWorkspace | null>(null);

  const workspacePath = useMemo(() => {
    for (const pin of pinnedResources) {
      if (pin.kind !== 'issue') continue;
      const candidate = (pin.meta as Record<string, unknown> | null | undefined)?.localPath;
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return null;
  }, [pinnedResources]);

  useEffect(() => {
    let cancelled = false;
    if (!workspacePath) {
      setWorkspace(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const res = await window.electron?.coding?.workspace?.list?.();
      if (cancelled) return;
      setWorkspace(res?.success ? (res.data.find((w) => w.path === workspacePath) ?? null) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  if (!workspacePath) return null;

  const label = workspace?.label || workspacePath.split('/').slice(-1)[0];
  const blocked = workspace ? !workspace.trusted || !workspace.exists : false;

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
      title={workspacePath}
    >
      <HugeiconsIcon icon={FolderLibraryIcon} size={12} className="shrink-0 text-muted-foreground" />
      <SafeText className="text-[11.5px] text-foreground">{label}</SafeText>
      {blocked ? (
        <Badge variant="outline" className="h-4 shrink-0 gap-1 px-1.5 text-[10px]">
          <HugeiconsIcon icon={Alert01Icon} size={10} />
          {workspace && !workspace.exists
            ? t('chat.workspace_missing', { defaultValue: 'folder missing' })
            : t('chat.workspace_untrusted', { defaultValue: 'not trusted' })}
        </Badge>
      ) : null}
    </div>
  );
}
