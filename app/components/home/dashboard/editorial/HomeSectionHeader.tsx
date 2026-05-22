import type { ReactNode } from 'react';

export function HomeSectionHeader({
  title,
  linkLabel,
  onLinkClick,
}: {
  title: string;
  linkLabel?: string;
  onLinkClick?: () => void;
}) {
  return (
    <div className="h-section-hd">
      <h2 className="h-section-title">{title}</h2>
      {linkLabel ? (
        <button type="button" className="h-section-link" onClick={onLinkClick}>
          {linkLabel}
        </button>
      ) : null}
    </div>
  );
}

export function HomeCardHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="h-card-hd">
      <h3 className="h-card-title">{title}</h3>
      {trailing}
    </div>
  );
}
