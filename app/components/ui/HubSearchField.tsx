import type { ChangeEvent } from 'react';
import { Search } from 'lucide-react';

export interface HubSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
}

/** Compact search input used across hub toolbars */
export default function HubSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}: HubSearchFieldProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border w-full min-w-0 max-w-xl ${className}`.trim()}
      style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
    >
      <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={handle}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="flex-1 min-w-0 bg-transparent text-xs outline-none"
        style={{ color: 'var(--dome-text)' }}
      />
    </div>
  );
}
