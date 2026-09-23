import { useEffect, useState } from 'react';
import { parseDomeMediaId, resolveDomeMediaSrc } from '@/lib/plugins/media';

export default function DomeMediaImage({ src, alt }: { src: string; alt?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const mediaId = parseDomeMediaId(src);

  useEffect(() => {
    if (!mediaId) return undefined;
    let active = true;
    void resolveDomeMediaSrc(src).then((url) => {
      if (active) setDataUrl(url);
    }).catch(() => {
      if (active) setDataUrl(null);
    });
    return () => { active = false; };
  }, [mediaId, src]);

  if (!dataUrl) {
    return (
      <span className="inline-block min-h-16 w-full max-w-xl rounded-md border bg-muted/40" role="img" aria-label={alt || undefined} />
    );
  }
  return (
    <img
      src={dataUrl}
      alt={alt || ''}
      className="max-h-96 w-full max-w-xl rounded-md border object-contain"
    />
  );
}
