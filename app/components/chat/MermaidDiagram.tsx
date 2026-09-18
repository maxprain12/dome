import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export default function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const { t } = useTranslation();
  const reactId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const source = code.trim();

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setSvg(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    void import('mermaid')
      .then(async (mod) => {
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
        });
        const id = `mermaid-${reactId}-${Math.abs(hashCode(source))}`;
        const rendered = await mermaid.render(id, source);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch(() => {
        if (!cancelled) {
          setSvg(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  if (!source) return null;
  if (!svg && !failed) {
    return (
      <div
        className={cn('h-24 rounded-xl border border-border bg-muted/40', className)}
        aria-busy
        aria-label="Mermaid"
      />
    );
  }
  if (failed || !svg) {
    return (
      <pre
        className={cn(
          'overflow-x-auto rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
          className,
        )}
        aria-label={t('many.plan_mermaid_unavailable')}
      >
        {source}
      </pre>
    );
  }

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-border bg-card px-3 py-3 text-foreground [&_svg]:max-w-full',
        className,
      )}
      data-mermaid="true"
      // mermaid.render returns trusted SVG from the local library with securityLevel strict
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}
