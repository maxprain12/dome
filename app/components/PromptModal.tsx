'use client';

import { useEffect, useRef, useState } from 'react';
import { usePromptStore } from '@/lib/store/usePromptStore';
import { X } from 'lucide-react';

export default function PromptModal() {
  const { isOpen, message, defaultValue, handleSubmit, handleCancel } = usePromptStore();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Focus input after a short delay to ensure modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
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
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative rounded-lg shadow-2xl w-full max-w-md"
        style={{ 
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 
            className="text-lg font-semibold"
            style={{ color: 'var(--primary-text)' }}
          >
            Entrada
          </h2>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--secondary-text)' }}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={onSubmit} className="p-4">
          <label 
            className="block text-sm mb-2"
            style={{ color: 'var(--secondary-text)' }}
          >
            {message}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{ 
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--primary-text)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--base)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            placeholder="Type here..."
          />
          
          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--secondary-text)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: 'var(--base)',
                color: 'white',
              }}
            >
              Aceptar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
