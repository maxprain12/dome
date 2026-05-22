import type { ReactNode } from 'react';

export function TodayColumns({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  if (!left && !right) return null;

  return (
    <div className="h-cols">
      {left}
      {right ? <div className="h-cols-right">{right}</div> : null}
    </div>
  );
}
