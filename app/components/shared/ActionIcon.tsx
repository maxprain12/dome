import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Button } from '@/components/ui/button';

export function ActionIcon({
  label,
  available,
  unavailableLabel,
  icon,
  onClick,
}: {
  label: string;
  available: boolean;
  unavailableLabel: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="rounded-full"
      disabled={!available}
      title={available ? label : unavailableLabel}
      aria-label={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  );
}
