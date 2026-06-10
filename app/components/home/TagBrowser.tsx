import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, ChevronLeft, FileText, Video, Music, FileImage, Globe, Folder } from 'lucide-react';
import { EditorialShell } from '@/components/home/editorial/EditorialShell';
import { EditorialPageHero } from '@/components/home/editorial/EditorialPageHero';
import { TAG_COLOR_PALETTE, TAG_COLOR_DEFAULT } from '@/lib/ui/palettes';

interface TagWithCount {
  id: string;
  name: string;
  color?: string | null;
  resource_count: number;
}

interface TagResource {
  id: string;
  title: string;
  type: string;
  updated_at: number;
}

function tagColor(name: string, stored?: string | null): string {
  if (stored) return stored;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLOR_PALETTE[Math.abs(hash) % TAG_COLOR_PALETTE.length] ?? TAG_COLOR_DEFAULT;
}

function ResourceTypeIcon({ type }: { type: string }) {
  const size = 13;
  switch (type) {
    case 'pdf':
      return <FileText size={size} />;
    case 'video':
      return <Video size={size} />;
    case 'audio':
      return <Music size={size} />;
    case 'image':
      return <FileImage size={size} />;
    case 'url':
      return <Globe size={size} />;
    case 'folder':
      return <Folder size={size} />;
    default:
      return <FileText size={size} />;
  }
}

export default function TagBrowser() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<TagWithCount | null>(null);
  const [tagResources, setTagResources] = useState<TagResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await window.electron.db.tags.getAll();
        if (result.success) {
          setTags(result.data || []);
        }
      } catch (err) {
        console.error('Error loading tags:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleTagClick = async (tag: TagWithCount) => {
    setSelectedTag(tag);
    setLoadingResources(true);
    try {
      const result = await window.electron.db.tags.getResources(tag.id);
      if (result.success) {
        setTagResources(result.data || []);
      }
    } catch (err) {
      console.error('Error loading tag resources:', err);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleOpenResource = async (resource: TagResource) => {
    try {
      await window.electron.workspace.open(resource.id, resource.type || 'url');
    } catch (err) {
      console.error('Error opening resource:', err);
    }
  };


  if (loading) {
    return (
      <EditorialShell shellClassName="hub-tags-shell">
        <EditorialPageHero title={t('tags.title')} subtitle={t('tags.subtitle')} />
        <div className="hub-tags-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-xl resource-card-skeleton"
              style={{ width: 60 + (i % 4) * 30 }}
              aria-hidden="true"
            />
          ))}
        </div>
      </EditorialShell>
    );
  }

  if (selectedTag) {
    const color = tagColor(selectedTag.name, selectedTag.color);
    return (
      <EditorialShell shellClassName="hub-tags-shell">
        <EditorialPageHero
          title={selectedTag.name}
          subtitle={t('tags.subtitle')}
          stat={{
            label: t('tags.title'),
            value: selectedTag.resource_count,
          }}
          actions={
            <button type="button" className="h-pill-btn" onClick={() => setSelectedTag(null)}>
              <ChevronLeft size={12} strokeWidth={2} aria-hidden />
              {t('tags.all')}
            </button>
          }
        />

        {loadingResources ? (
          <div className="hub-tag-resource-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="resource-card-list-skeleton rounded-xl h-[56px]" aria-hidden="true" />
            ))}
          </div>
        ) : tagResources.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--home-ink-3)' }}>{t('tags.no_resources')}</p>
        ) : (
          <div className="hub-tag-resource-list">
            {tagResources.map((res) => (
              <button
                key={res.id}
                type="button"
                onClick={() => handleOpenResource(res)}
                className="hub-tag-resource-row"
              >
                <div
                  className="size-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${color}18`, color }}
                >
                  <ResourceTypeIcon type={res.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--home-ink)' }}>
                    {res.title || t('common.untitled')}
                  </p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--home-ink-3)' }}>
                    {res.type}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </EditorialShell>
    );
  }

  if (tags.length === 0) {
    return (
      <EditorialShell shellClassName="hub-tags-shell">
        <EditorialPageHero title={t('tags.title')} subtitle={t('tags.no_tags_desc')} />
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Tag size={36} style={{ color: 'var(--home-ink-4)', opacity: 0.5 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--home-ink)' }}>{t('tags.no_tags')}</p>
        </div>
      </EditorialShell>
    );
  }

  return (
    <EditorialShell shellClassName="hub-tags-shell">
      <EditorialPageHero
        title={t('tags.title')}
        subtitle={t('tags.subtitle')}
        stat={{
          label: t('tags.title'),
          value: tags.length,
        }}
      />
      <div className="hub-tags-grid">
        {tags.map((tag) => {
          const color = tagColor(tag.name, tag.color);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleTagClick(tag)}
              className="hub-tag-chip"
              style={{
                borderColor: `${color}35`,
                background: `${color}10`,
                color,
              }}
            >
              <span className="size-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
              {tag.name}
              <span className="hub-tag-chip-count">{tag.resource_count}</span>
            </button>
          );
        })}
      </div>
    </EditorialShell>
  );
}
