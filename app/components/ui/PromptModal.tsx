'use client';

import { useEffect, useRef, useState } from 'react';
import { usePromptStore } from '@/lib/store/usePromptStore';
import { X, Send } from 'lucide-react';

export default function PromptModal() {
  const { isOpen, message, defaultValue, handleSubmit, handleCancel } = usePromptStore();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleCancel]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(value);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ zIndex: 9999 }}
    >
      {/* Overlay with blur */}
      <div
        className="absolute inset-0 cursor-pointer animate-overlay"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-2xl, 16px)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.12)',
          animation: 'modal-appear 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: 'var(--primary-text)', letterSpacing: '-0.01em' }}
          >
            Input
          </h2>
          <button
            onClick={handleCancel}
            className="flex items-center justify-center rounded-lg transition-all duration-150"
            style={{
              width: 32,
              height: 32,
              color: 'var(--secondary-text)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={onSubmit} style={{ padding: '20px' }}>
          <label
            className="block text-sm mb-3"
            style={{
              color: 'var(--secondary-text)',
              lineHeight: 1.5,
            }}
          >
            {message}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full text-sm outline-none transition-all duration-200"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg, 8px)',
              color: 'var(--primary-text)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--translucent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            placeholder="Type here..."
          />

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                color: 'var(--secondary-text)',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'white',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-hover)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
              }}
            >
              <Send size={14} />
              Accept
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
