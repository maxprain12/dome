'use client';

import { useRef, useCallback, useEffect } from 'react';

interface CodeCellEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function CodeCellEditor({
  value,
  onChange,
  onRun,
  editable = true,
  placeholder = '# Escribe código Python... (Shift+Enter to run)',
  className = '',
  style,
}: CodeCellEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newValue = value.slice(0, start) + '  ' + value.slice(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
        return;
      }
      if ((e.key === 'Enter' && e.shiftKey) || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        onRun?.();
      }
    },
    [value, onChange, onRun]
  );

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(80, ta.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      readOnly={!editable}
      placeholder={placeholder}
      spellCheck={false}
      className={`flex-1 min-h-[80px] min-w-0 rounded overflow-hidden resize-none w-full p-2 text-sm font-mono outline-none border-0 ${className}`}
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--primary-text)',
        caretColor: 'var(--primary-text)',
        fontFamily: 'var(--font-mono)',
        ...style,
      }}
      data-placeholder={placeholder}
    />
  );
}
