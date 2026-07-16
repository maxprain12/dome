import { useEffect, useState } from 'react';
import {
  getProviderLogoSrc,
  isProviderWithBrandLogo,
  providerLogoUsesDarkInvert,
  type ProviderWithBrandLogo,
  type ResolvedTheme,
} from '@/lib/ai/provider-options';
import { cn } from '@/lib/utils';

function readResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

/** Tracks the shell theme so brand logos swap their light/dark variant live. */
function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(readResolvedTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const sync = () => setTheme(readResolvedTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export interface ProviderBrandIconProps {
  provider: ProviderWithBrandLogo;
  /** Fixed pixel size. Ignored when `fill` is true. */
  size?: number;
  /** Fill the parent container. */
  fill?: boolean;
  className?: string;
}

export default function ProviderBrandIcon({
  provider,
  size = 16,
  fill = false,
  className,
}: ProviderBrandIconProps) {
  const resolvedTheme = useResolvedTheme();

  return (
    <img
      src={getProviderLogoSrc(provider, resolvedTheme)}
      alt=""
      aria-hidden
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      className={cn(
        'shrink-0 object-contain',
        fill && 'size-[78%] max-h-full max-w-full',
        providerLogoUsesDarkInvert(provider) && '[filter:var(--logo-filter)]',
        className,
      )}
    />
  );
}

export interface ProviderModelChipProps {
  provider: string;
  label: string;
  className?: string;
}

/** Compact provider badge: brand logo + label (e.g. "minimax / MiniMax-M2.7"). */
export function ProviderModelChip({ provider, label, className }: ProviderModelChipProps) {
  const hasLogo = isProviderWithBrandLogo(provider);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {hasLogo ? <ProviderBrandIcon provider={provider} size={12} /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
