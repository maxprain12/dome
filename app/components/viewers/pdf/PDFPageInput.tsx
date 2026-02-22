import React, { useState, useCallback, useRef, useEffect } from 'react';

interface PDFPageInputProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function PDFPageInput({
  currentPage,
  totalPages,
  onPageChange,
  inputRef: externalRef,
}: PDFPageInputProps) {
  const [inputValue, setInputValue] = useState(String(currentPage));
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;

  useEffect(() => {
    setInputValue(String(currentPage));
  }, [currentPage]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= totalPages) {
        onPageChange(num);
      }
    },
    [totalPages, onPageChange]
  );

  const handleBlur = useCallback(() => {
    const num = parseInt(inputValue, 10);
    if (Number.isNaN(num) || num < 1) {
      setInputValue(String(currentPage));
    } else if (num > totalPages) {
      setInputValue(String(totalPages));
      onPageChange(totalPages);
    } else if (num !== currentPage) {
      onPageChange(num);
    } else {
      setInputValue(String(currentPage));
    }
  }, [inputValue, currentPage, totalPages, onPageChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    },
    []
  );

  if (totalPages === 0) {
    return (
      <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
        0 / 0
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        min={1}
        max={totalPages}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-12 px-1.5 py-1 text-sm text-center rounded border focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--primary-text)',
        }}
        aria-label="Go to page"
        title="Go to page (Ctrl+G)"
      />
      <span className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        / {totalPages}
      </span>
    </div>
  );
}
