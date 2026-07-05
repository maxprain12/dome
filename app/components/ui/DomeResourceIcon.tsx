import type { CSSProperties } from 'react';
import {
  inferResourceVisualKind,
  RESOURCE_ICON_MAP,
  resourceVisualCssSuffix,
  type ResourceVisualKind,
} from '@/lib/resources/resourceVisual';
import { cn } from '@/lib/utils';

export interface DomeResourceIconProps {
  /** Dome resource type, e.g. `pdf`, `note`, `url`. */
  type?: string | null;
  /** File name or title — used to infer kind from extension when type is generic. */
  name?: string | null;
  /** Override inferred kind. */
  kind?: ResourceVisualKind;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export default function DomeResourceIcon({
  type,
  name,
  kind: kindOverride,
  size = 16,
  strokeWidth = 1.75,
  className,
  style,
}: DomeResourceIconProps) {
  const kind = kindOverride ?? inferResourceVisualKind(type, name);
  // Defensive fallback: an out-of-map `kind` override must degrade to the
  // generic file icon, never render `undefined` (React error 130).
  const Icon = RESOURCE_ICON_MAP[kind] ?? RESOURCE_ICON_MAP.file;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      style={style}
      aria-hidden
    />
  );
}

export interface DomeResourceIconBoxProps {
  type?: string | null;
  name?: string | null;
  kind?: ResourceVisualKind;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}

/** 20×20 icon tile for composer attach chips (prototype attach-icon). */
export function DomeResourceIconBox({
  type,
  name,
  kind: kindOverride,
  size = 20,
  className,
  children,
}: DomeResourceIconBoxProps) {
  const kind = kindOverride ?? inferResourceVisualKind(type, name);
  return (
    <span
      className={cn('attach-icon', className)}
      data-resource-tone={resourceVisualCssSuffix(kind)}
      style={{ width: size, height: size }}
    >
      {children ?? (
        <DomeResourceIcon kind={kind} type={type} name={name} size={12} strokeWidth={2} />
      )}
    </span>
  );
}
