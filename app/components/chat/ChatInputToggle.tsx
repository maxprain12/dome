/**
 * Small switch used in chat composer menus (capabilities / tools).
 */
export function ChatInputToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
