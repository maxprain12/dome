import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, ChevronLeft, Loader2, FileText, Video, Music, FileImage, Globe, Folder } from 'lucide-react';

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

// Deterministic color from tag name when no color stored
function tagColor(name: string, stored?: string | null): string {
  if (stored) return stored;
  const palette = [
    '#7b76d0', '#3b82f6', '#10b981', '#f59e0b',
    '#e85d4a', '#a855f7', '#6366f1', '#0ea5e9',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length] ?? '#7b76d0';
}

function ResourceTypeIcon({ type }: { type: string }) {
  const size = 13;
  switch (type) {
    case 'pdf':
    case 'document':
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
      await window.electron.workspace.open(resource.id, resource.type || 'document');
    } catch (err) {
      console.error('Error opening resource:', err);
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto px-6 py-4 min-h-[300px] animate-in fade-in duration-150 motion-reduce:animate-none">
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-xl resource-card-skeleton"
              style={{ width: 60 + (i % 4) * 30 }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    );
  }

  // Tag detail view
  if (selectedTag) {
    const color = tagColor(selectedTag.name, selectedTag.color);
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-2 pb-4">
          <button
            onClick={() => setSelectedTag(null)}
            className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
            style={{ color: 'var(--secondary-text)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ChevronLeft size={16} />
            {t('tags.all')}
          </button>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
          >
            <Tag size={13} />
            {selectedTag.name}
            <span className="opacity-60 text-xs">{selectedTag.resource_count}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loadingResources ? (
            <div className="space-y-2 animate-in fade-in duration-150 motion-reduce:animate-none">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="resource-card-list-skeleton rounded-xl h-[56px]"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : tagResources.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{t('tags.no_resources')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tagResources.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleOpenResource(res)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}18`, color }}
                  >
                    <ResourceTypeIcon type={res.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                      {res.title || t('common.untitled')}
                    </p>
                    <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
                      {res.type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // All tags view
  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center">
        <Tag size={36} style={{ color: 'var(--secondary-text)', opacity: 0.3 }} />
        <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>{t('tags.no_tags')}</p>
        <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
          {t('tags.no_tags_desc')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-4 animate-in fade-in duration-150 motion-reduce:animate-none">
      <div className="flex flex-wrap gap-2.5">
        {tags.map((tag) => {
          const color = tagColor(tag.name, tag.color);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleTagClick(tag)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                background: `${color}14`,
                border: `1px solid ${color}35`,
                color,
                cursor: 'pointer',
              }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: color }}
              />
              {tag.name}
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: `${color}25`, color }}
              >
                {tag.resource_count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
