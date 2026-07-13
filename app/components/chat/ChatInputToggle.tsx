/**
 * Small switch used in chat composer menus (capabilities / tools).
 */
export function ChatInputToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  /** Accessible name for the switch (icon-only control). */
  label: string;
}) {
  return (
    <Switch
      checked={checked}
      aria-label={label}
      onCheckedChange={onChange}
      size="sm"
    />
  );
}
import { Switch } from '@/components/ui/switch';
