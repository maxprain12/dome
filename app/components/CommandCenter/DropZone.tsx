'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface DropZoneProps {
    onDrop: (data: DropData) => Promise<void>;
    onDragStateChange?: (isDragging: boolean) => void;
    children: React.ReactNode;
}

export interface DropData {
    type: 'file' | 'url' | 'text';
    files?: File[];
    url?: string;
    text?: string;
}

export function DropZone({ onDrop, onDragStateChange, children }: DropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;

        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
            onDragStateChange?.(true);
        }
    }, [onDragStateChange]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;

        if (dragCounter.current === 0) {
            setIsDragging(false);
            onDragStateChange?.(false);
        }
    }, [onDragStateChange]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(false);
        onDragStateChange?.(false);
        dragCounter.current = 0;

        const dataTransfer = e.dataTransfer;

        // Check for files
        if (dataTransfer.files && dataTransfer.files.length > 0) {
            const files = Array.from(dataTransfer.files);
            await onDrop({ type: 'file', files });
            return;
        }

        // Check for URL
        const url = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');
        if (url && isValidUrl(url)) {
            await onDrop({ type: 'url', url });
            return;
        }

        // Check for text
        const text = dataTransfer.getData('text/plain');
        if (text) {
            await onDrop({ type: 'text', text });
        }
    }, [onDrop, onDragStateChange]);

    // Handle paste events for URLs
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const clipboardData = e.clipboardData;
            if (!clipboardData) return;

            // Check for files in clipboard
            if (clipboardData.files && clipboardData.files.length > 0) {
                const files = Array.from(clipboardData.files);
                await onDrop({ type: 'file', files });
                return;
            }

            // Check for URL
            const text = clipboardData.getData('text/plain');
            if (text && isValidUrl(text)) {
                // Don't prevent default - let input fields handle it normally
                // Only intercept if we're not focused on an input
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                    return;
                }
                e.preventDefault();
                await onDrop({ type: 'url', url: text });
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [onDrop]);

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
        >
            {children}
        </div>
    );
}

function isValidUrl(string: string): boolean {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export default DropZone;
