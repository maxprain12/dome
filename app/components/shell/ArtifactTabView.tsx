import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import HubListState from '@/components/ui/HubListState';
import ArtifactCard, { type AnyArtifact } from '@/components/chat/ArtifactCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import { tryParseArtifact } from '@/lib/chat/artifactSchemas';
import i18n from '@/lib/i18n';

function getArtifactTitle(artifact: AnyArtifact): string {
  if ('title' in artifact && typeof artifact.title === 'string' && artifact.title.trim()) {
    return artifact.title;
  }
  return i18n.t(`artifacts.${artifact.type}`, { defaultValue: i18n.t('chat.artifact_tab') });
}

export default function ArtifactTabView({ rawJson }: { rawJson: string }) {
  const { t } = useTranslation();

  const parsed = useMemo(() => {
    if (!rawJson?.trim()) {
      return { error: t('chat.artifact_invalid') } as const;
    }
    try {
      const data = JSON.parse(rawJson) as { type?: string } & Record<string, unknown>;
      const typ = data.type;
      if (!typ || typeof typ !== 'string') {
        return { error: t('chat.artifact_invalid') } as const;
      }
      const p = tryParseArtifact(typ, data);
      if (p.ok) {
        return { artifact: p.value as AnyArtifact } as const;
      }
      const legacy = new Set([
        'pdf_summary',
        'table',
        'action_items',
        'chart',
        'code',
        'list',
        'created_entity',
        'docling_images',
      ]);
      if (legacy.has(typ)) {
        return { artifact: data as AnyArtifact } as const;
      }
      return { error: t('chat.artifact_invalid') } as const;
    } catch {
      return { error: t('chat.artifact_invalid') } as const;
    }
  }, [rawJson, t]);

  if ('error' in parsed) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-6 min-h-0"
        style={{ background: 'var(--dome-bg)' }}
      >
        <HubListState variant="empty" title={parsed.error} compact />
      </div>
    );
  }

  const title = getArtifactTitle(parsed.artifact);
  const subtitle = t('chat.artifact_sandbox_note');

  return (
    <div
      className="flex flex-1 min-h-0 flex-col overflow-hidden"
      style={{ background: 'var(--dome-bg)' }}
    >
      <DomeSubpageHeader title={title} subtitle={subtitle} />
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="w-full mx-auto" style={{ maxWidth: 'min(100%, 1400px)' }}>
          <ArtifactCard artifact={parsed.artifact} />
        </div>
      </div>
    </div>
  );
}
