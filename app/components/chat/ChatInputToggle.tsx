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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
