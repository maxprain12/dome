import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { githubClient, isGithubHostedImageUrl } from '@/lib/github/client';

type LoadState = 'loading' | 'ready' | 'error';

/** Fetch GitHub user-attachment images via main-process proxy (auth required). */
export default function GithubProxyImage({ src, alt }: { src?: string | null; alt?: string | null }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);

  useEffect(() => {
    if (typeof src !== 'string' || !src.trim()) {
      setState('error');
      setDisplaySrc(null);
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:') || !isGithubHostedImageUrl(src)) {
      setDisplaySrc(src);
      setState('ready');
      return;
    }

    let cancelled = false;
    setState('loading');
    setDisplaySrc(null);

    void githubClient
      .resolveImage(src)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.dataUrl) {
          setDisplaySrc(res.dataUrl);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (state === 'loading') {
    return (
      <span
        className="inline-block text-xs italic py-2 px-3 rounded-md my-1"
        style={{ color: 'var(--dome-text-muted)', background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
      >
        {t('github.image_loading')}
      </span>
    );
  }

  if (state === 'error' || !displaySrc) {
    if (typeof src !== 'string' || !src) return null;
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm my-1 px-2 py-1 rounded-md"
        style={{ color: 'var(--dome-accent)', border: '1px solid var(--dome-border)' }}
      >
        <ExternalLink size={14} />
        {alt?.trim() || t('github.view_image_on_github')}
      </a>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt || ''}
      loading="lazy"
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 6,
        border: '1px solid var(--dome-border)',
        display: 'block',
        margin: '8px 0',
      }}
    />
  );
}
