
import { type ReactNode } from 'react';

interface ViewerToolbarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  variant?: 'primary' | 'secondary';
}

export default function ViewerToolbar({
  left,
  center,
  right,
  variant = 'primary',
}: ViewerToolbarProps) {
  const isPrimary = variant === 'primary';

  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{
        background: isPrimary ? 'var(--bg)' : 'var(--bg-secondary)',
        borderColor: 'var(--border)',
        minHeight: '56px',
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {left}
      </div>

      {/* Center section */}
      {center && (
        <div className="flex items-center gap-2 justify-center flex-shrink-0">
          {center}
        </div>
      )}

      {/* Right section */}
      <div className="flex items-center gap-2 justify-end flex-1">
        {right}
      </div>
    </div>
  );
}
