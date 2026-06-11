import { useRef, useLayoutEffect } from 'react';

interface NoteDocTitleProps {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function NoteDocTitle({
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder = '',
}: NoteDocTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const isFocused = useRef(false);

  // Sync external value changes (cross-window IPC sync) when not actively typing
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || isFocused.current) return;
    if (el.innerText !== value) {
      el.innerText = value;
    }
  }, [value]);

  return (
    // contentEditable title: behaves as a text input (focus/blur/Enter), a
    // pattern the static rules below don't model; aria-label names it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/heading-has-content
    <h1
      ref={ref}
      className="note-doc-title-editable"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      aria-label={placeholder}
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={(e) => {
        isFocused.current = false;
        const text = e.currentTarget.innerText.trim();
        onChange(text);
        onBlur();
      }}
      onInput={(e) => {
        onChange(e.currentTarget.innerText.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Move focus to the first editable ProseMirror node
          const pm = document.querySelector<HTMLElement>('.ProseMirror');
          if (pm) {
            pm.focus();
            // Place cursor at beginning of first node
            const selection = window.getSelection();
            const range = document.createRange();
            const firstChild = pm.firstChild ?? pm;
            range.setStart(firstChild, 0);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
        document.execCommand('insertText', false, text);
      }}
    />
  );
}
