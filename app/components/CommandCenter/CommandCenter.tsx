'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search,
    Sparkles,
    Upload,
    FileText,
    Link2,
    X,
    Command,
    Youtube,
    Globe,
    Check,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { SearchResults } from './SearchResults';
import { SearchFilterChips } from './SearchFilterChips';
import { DropZone } from './DropZone';
import { hybridSearch } from '@/lib/search/hybrid-search';

interface CommandCenterProps {
    onResourceSelect?: (resource: any) => void;
    onCreateNote?: () => void;
    onUpload?: (files: File[]) => void;
    onImportFiles?: (filePaths: string[]) => void;
    onAddUrl?: (url: string, type: 'youtube' | 'article') => void;
}

// Helper to detect YouTube URLs
function isYouTubeUrl(url: string): boolean {
    const youtubePatterns = [
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/v\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
    ];
    return youtubePatterns.some(pattern => pattern.test(url));
}

// Validate URL format
function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

// Allowed file extensions for upload
const ALLOWED_EXTENSIONS = [
    // Documents
    'pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt',
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
    // Audio
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
    // Video
    'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v',
    // Presentations
    'ppt', 'pptx', 'odp',
    // Spreadsheets
    'xls', 'xlsx', 'csv', 'ods',
];

// Blocked extensions
const BLOCKED_EXTENSIONS = [
    'exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'app',
    'bat', 'cmd', 'sh', 'ps1',
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
    'dll', 'so', 'dylib',
];

const PLACEHOLDER_SUGGESTIONS = [
    'Search your resources...',
    'Ask AI about your documents...',
    'Type / for commands...',
    'Drop files or URLs here...',
];

export function CommandCenter({
    onResourceSelect,
    onCreateNote,
    onUpload,
    onImportFiles,
    onAddUrl,
}: CommandCenterProps) {
    const [query, setQuery] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [showDropzone, setShowDropzone] = useState(false);

    // URL Mode state
    const [urlMode, setUrlMode] = useState(false);
    const [urlInput, setUrlInput] = useState('https://');

    const [filterTypes, setFilterTypes] = useState<string[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { setSearchQuery, searchResults, setSearchResults } = useAppStore();

    // Detected URL type
    const detectedUrlType = urlMode && urlInput.length > 10
        ? (isYouTubeUrl(urlInput) ? 'youtube' : 'article')
        : null;

    const isUrlValid = urlMode && isValidUrl(urlInput);

    // Rotate placeholder text
    useEffect(() => {
        const interval = setInterval(() => {
            setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Keyboard shortcut (Cmd+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                setIsExpanded(true);
            }
            if (e.key === 'Escape' && (isFocused || urlMode)) {
                setIsExpanded(false);
                setUrlMode(false);
                setUrlInput('https://');
                inputRef.current?.blur();
                setQuery('');
                setSearchResults(null);
            }
            // Enter to submit URL
            if (e.key === 'Enter' && urlMode && isUrlValid) {
                e.preventDefault();
                handleSubmitUrl();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isFocused, urlMode, isUrlValid, urlInput]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
                setUrlMode(false);
                setUrlInput('https://');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced search - ONLY when NOT in URL mode
    // Uses hybrid search (vector + graph + FTS) for resources,
    // and unified FTS for interactions (annotations/notes)
    useEffect(() => {
        if (urlMode) {
            setSearchResults(null);
            return;
        }

        if (!query.trim()) {
            setSearchResults(null);
            setFilterTypes([]);
            return;
        }

        setFilterTypes([]);
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                if (typeof window !== 'undefined' && window.electron?.db) {
                    // Run hybrid search and FTS interactions in parallel
                    const [hybridResults, ftsResult] = await Promise.all([
                        hybridSearch(query, {
                            vectorWeight: 0.7,
                            graphWeight: 0.3,
                            maxResults: 20,
                            semanticThreshold: 0.3,
                        }).catch((err) => {
                            console.warn('Hybrid search failed, falling back:', err);
                            return [];
                        }),
                        window.electron.db.search.unified(query).catch(() => ({
                            success: false,
                            data: { resources: [], interactions: [] },
                        })),
                    ]);

                    // Map hybrid results to search results format
                    const resources = hybridResults.length > 0
                        ? hybridResults.map((r) => ({
                            id: r.id,
                            title: r.title,
                            type: r.type,
                            content: r.metadata?.content || '',
                            source: r.source,
                            score: r.score,
                        }))
                        : (ftsResult as any).success && (ftsResult as any).data
                            ? (ftsResult as any).data.resources
                            : [];

                    const interactions =
                        (ftsResult as any).success && (ftsResult as any).data
                            ? (ftsResult as any).data.interactions
                            : [];

                    setSearchResults({ resources, interactions });
                }
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, urlMode, setSearchResults]);

    // Sync with global store - not in URL mode
    useEffect(() => {
        if (!urlMode) {
            setSearchQuery(query);
        }
    }, [query, setSearchQuery, urlMode]);

    const handleFocus = useCallback(() => {
        setIsFocused(true);
        setIsExpanded(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (urlMode) {
            setUrlInput(e.target.value);
        } else {
            setQuery(e.target.value);
        }
    }, [urlMode]);

    const handleSubmitUrl = useCallback(() => {
        if (!isValidUrl(urlInput)) return;

        const type = isYouTubeUrl(urlInput) ? 'youtube' : 'article';

        if (onAddUrl) {
            onAddUrl(urlInput, type);
        } else {
            // Fallback: Could emit an event or handle locally
            console.log('Adding URL:', urlInput, 'Type:', type);
        }

        // Reset state
        setUrlMode(false);
        setUrlInput('https://');
        setIsExpanded(false);
    }, [urlInput, onAddUrl]);

    const handleDrop = useCallback(async (data: { type: string; files?: File[]; url?: string; text?: string }) => {
        setShowDropzone(false);

        if (data.files && data.files.length > 0) {
            console.log('Drop received files:', data.files.length, 'files');

            // Filter out blocked file types
            const allowedFiles = data.files.filter(file => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                return !BLOCKED_EXTENSIONS.includes(ext);
            });

            if (allowedFiles.length === 0) {
                console.warn('All dropped files are blocked types (executables, installers, archives)');
                return;
            }

            let filePaths: string[] = [];

            // Use Electron's webUtils.getPathForFile() API (the recommended way)
            if (typeof window !== 'undefined' && window.electron?.getPathsForFiles) {
                filePaths = window.electron.getPathsForFiles(allowedFiles);
                console.log('Got file paths via getPathsForFiles:', filePaths);
            }

            // Fallback: try the .path property (older Electron versions)
            if (filePaths.length === 0) {
                filePaths = allowedFiles
                    .map((file: any) => file.path as string)
                    .filter((path): path is string => !!path);
                console.log('Got file paths via .path property:', filePaths);
            }

            if (filePaths.length > 0 && onImportFiles) {
                console.log('Importing files:', filePaths);
                onImportFiles(filePaths);
            } else {
                // No paths available - show message
                console.warn('Could not get file paths from dropped files');
                console.log('File objects:', allowedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

                // Fallback to onUpload if provided
                if (onUpload) {
                    onUpload(allowedFiles);
                }
            }
        }

        // Handle URL drops - enter URL mode with the dropped URL
        if (data.url) {
            setUrlMode(true);
            setUrlInput(data.url);
            setIsExpanded(true);
            inputRef.current?.focus();
        }
    }, [onUpload, onImportFiles]);

    const handleResourceClick = useCallback((resource: any) => {
        if (onResourceSelect) {
            onResourceSelect(resource);
        }
        setIsExpanded(false);
        setQuery('');
        setSearchResults(null);
    }, [onResourceSelect, setSearchResults]);

    const handleQuickAction = useCallback((action: string) => {
        switch (action) {
            case 'note':
                if (onCreateNote) onCreateNote();
                setIsExpanded(false);
                break;
            case 'upload':
                if (window.electron) {
                    window.electron.selectFiles({
                        filters: [
                            { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'] },
                            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'] },
                            { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
                            { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
                            { name: 'Presentations', extensions: ['ppt', 'pptx', 'odp'] },
                            { name: 'Spreadsheets', extensions: ['xls', 'xlsx', 'csv', 'ods'] },
                        ],
                    }).then((filePaths) => {
                        if (filePaths && filePaths.length > 0) {
                            // Filter blocked extensions
                            const allowedPaths = filePaths.filter(path => {
                                const ext = path.split('.').pop()?.toLowerCase() || '';
                                return !BLOCKED_EXTENSIONS.includes(ext);
                            });

                            if (allowedPaths.length > 0) {
                                console.log('Selected files:', allowedPaths);
                                if (onImportFiles) {
                                    onImportFiles(allowedPaths);
                                }
                            }
                        }
                    });
                }
                setIsExpanded(false);
                break;
            case 'url':
                // Enter URL mode
                setUrlMode(true);
                setUrlInput('https://');
                // Keep expanded and focus the input
                setTimeout(() => inputRef.current?.focus(), 50);
                break;
        }
    }, [onCreateNote, onImportFiles]);

    const handleExitUrlMode = useCallback(() => {
        setUrlMode(false);
        setUrlInput('https://');
    }, []);

    // Derive available types from search results for filter chips
    const availableTypes = React.useMemo(() => {
        if (!searchResults?.resources) return [];
        const types = new Set(searchResults.resources.map((r: any) => r.type));
        return Array.from(types).sort();
    }, [searchResults]);

    // Filter results by selected types
    const filteredResults = React.useMemo(() => {
        if (!searchResults) return null;
        if (filterTypes.length === 0) return searchResults;
        return {
            ...searchResults,
            resources: searchResults.resources.filter((r: any) => filterTypes.includes(r.type)),
        };
    }, [searchResults, filterTypes]);

    const hasResults = Boolean(searchResults && (searchResults.resources.length > 0 || searchResults.interactions.length > 0));

    return (
        <DropZone onDrop={handleDrop} onDragStateChange={setShowDropzone}>
            <div
                ref={containerRef}
                className={`command-center ${isExpanded ? 'expanded' : ''} ${showDropzone ? 'drop-active' : ''}`}
            >
                {/* Glassmorphism container */}
                <div className="command-center-container">
                    {/* Search input or URL input based on mode */}
                    <div className="command-center-input-wrapper">
                        <div className="command-center-icon">
                            {urlMode ? (
                                detectedUrlType === 'youtube' ? (
                                    <Youtube size={20} className="youtube-icon" />
                                ) : (
                                    <Globe size={20} className="globe-icon" />
                                )
                            ) : isSearching ? (
                                <div className="spinner" />
                            ) : query.startsWith('/') ? (
                                <Command size={20} />
                            ) : (
                                <Search size={20} />
                            )}
                        </div>

                        <input
                            ref={inputRef}
                            type="text"
                            value={urlMode ? urlInput : query}
                            onChange={handleInputChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            placeholder={urlMode ? 'https://example.com or YouTube URL' : PLACEHOLDER_SUGGESTIONS[placeholderIndex]}
                            className={`command-center-input ${urlMode ? 'url-mode' : ''}`}
                            autoComplete="off"
                            spellCheck={false}
                        />

                        <div className="command-center-actions">
                            {/* URL Type Indicator */}
                            {urlMode && detectedUrlType && (
                                <div className={`url-type-indicator ${detectedUrlType}`}>
                                    {detectedUrlType === 'youtube' ? (
                                        <>
                                            <Youtube size={14} />
                                            <span>YouTube</span>
                                        </>
                                    ) : (
                                        <>
                                            <Globe size={14} />
                                            <span>Article</span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Submit URL button */}
                            {urlMode && isUrlValid && (
                                <button
                                    className="url-submit-btn"
                                    onClick={handleSubmitUrl}
                                    aria-label="Add URL"
                                >
                                    <Check size={16} />
                                    <span>Add</span>
                                </button>
                            )}

                            {/* AI Mode Indicator - only when not in URL mode */}
                            {!urlMode && query.length > 0 && (
                                <div className={`ai-mode-indicator ${isSearching ? 'active' : ''}`}>
                                    <Sparkles size={14} />
                                    <span>AI</span>
                                </div>
                            )}

                            {/* Clear/Cancel button */}
                            {(query || urlMode) && (
                                <button
                                    className="command-center-clear"
                                    onClick={() => {
                                        if (urlMode) {
                                            handleExitUrlMode();
                                        } else {
                                            setQuery('');
                                            setSearchResults(null);
                                        }
                                    }}
                                    aria-label={urlMode ? "Cancel" : "Clear search"}
                                >
                                    <X size={16} />
                                </button>
                            )}
                            <div className="command-center-shortcut">
                                <kbd>⌘</kbd>
                                <kbd>K</kbd>
                            </div>
                        </div>
                    </div>

                    {/* Expandable content */}
                    {isExpanded && (
                        <div className="command-center-dropdown">
                            {/* URL Mode - Show URL input feedback */}
                            {urlMode && (
                                <div className="url-input-feedback">
                                    <div className="url-feedback-header">
                                        <Link2 size={16} />
                                        <span>Add Web Resource</span>
                                    </div>
                                    <div className="url-feedback-content">
                                        {!isUrlValid && urlInput.length > 8 && (
                                            <div className="url-feedback-hint error">
                                                Please enter a valid URL starting with http:// or https://
                                            </div>
                                        )}
                                        {isUrlValid && (
                                            <div className={`url-feedback-hint success ${detectedUrlType}`}>
                                                {detectedUrlType === 'youtube' ? (
                                                    <>
                                                        <Youtube size={16} />
                                                        <span>YouTube video detected - will extract video info</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Globe size={16} />
                                                        <span>Web article - will extract content</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        <div className="url-feedback-actions">
                                            <button
                                                className="url-action-btn secondary"
                                                onClick={handleExitUrlMode}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                className="url-action-btn primary"
                                                onClick={handleSubmitUrl}
                                                disabled={!isUrlValid}
                                            >
                                                <Check size={16} />
                                                Add Resource
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Quick actions when no query and not in URL mode */}
                            {!query && !urlMode && (
                                <div className="quick-actions">
                                    <div className="quick-actions-label">Quick Actions</div>
                                    <div className="quick-actions-grid three-columns">
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('note')}
                                        >
                                            <FileText size={18} />
                                            <span>New Note</span>
                                        </button>
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('upload')}
                                        >
                                            <Upload size={18} />
                                            <span>Upload Files</span>
                                        </button>
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('url')}
                                        >
                                            <Link2 size={18} />
                                            <span>Add URL</span>
                                        </button>
                                    </div>
                                    <div className="ai-hint">
                                        <Sparkles size={14} />
                                        <span>Type naturally to search with AI or use / for commands</span>
                                    </div>
                                </div>
                            )}

                            {/* Filter chips + Search results - only when not in URL mode */}
                            {!urlMode && query && hasResults && searchResults && (
                                <>
                                    <SearchFilterChips
                                        availableTypes={availableTypes}
                                        selectedTypes={filterTypes}
                                        onToggle={(type) =>
                                            setFilterTypes((prev) =>
                                                prev.includes(type)
                                                    ? prev.filter((t) => t !== type)
                                                    : [...prev, type]
                                            )
                                        }
                                        onClear={() => setFilterTypes([])}
                                    />
                                    <SearchResults
                                        results={filteredResults || searchResults}
                                        query={query}
                                        isLoading={isSearching}
                                        onSelect={handleResourceClick}
                                    />
                                </>
                            )}

                            {/* No results - only when not in URL mode */}
                            {!urlMode && query && !isSearching && !hasResults && (
                                <div className="no-results">
                                    <Search size={32} className="no-results-icon" />
                                    <p>No results found for "{query}"</p>
                                    <span>Try a different search term or ask AI</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Drop overlay */}
                {showDropzone && (
                    <div className="drop-overlay">
                        <div className="drop-overlay-content">
                            <Upload size={48} />
                            <p>Drop files or URLs here</p>
                            <span>Images, PDFs, Audio, Documents</span>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
        .command-center {
          position: relative;
          width: 100%;
          max-width: 680px;
          margin: 0 auto;
          z-index: 100;
        }

        .command-center-container {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          transition: all var(--transition-base);
        }

        .command-center.expanded .command-center-container {
          box-shadow: var(--shadow-xl), 0 0 0 1px var(--translucent);
          border-color: var(--accent);
        }

        .command-center.drop-active .command-center-container {
          border-color: var(--success);
          box-shadow: 0 0 0 3px var(--success-bg);
        }

        .command-center-input-wrapper {
          display: flex;
          align-items: center;
          padding: 14px 18px;
          gap: 12px;
        }

        .command-center-icon {
          color: var(--secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .command-center-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 16px;
          color: var(--primary-text);
          font-family: var(--font-sans);
        }

        .command-center-input::placeholder {
          color: var(--secondary-text);
          transition: opacity 0.3s ease;
        }

        .command-center-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .command-center-clear {
          padding: 4px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: var(--radius-sm);
          color: var(--secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }

        .command-center-clear:hover {
          background: var(--bg-hover);
          color: var(--primary-text);
        }

        .command-center-shortcut {
          display: flex;
          gap: 4px;
        }

        .command-center-shortcut kbd {
          padding: 2px 6px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-family: var(--font-sans);
          color: var(--secondary);
        }

        .ai-mode-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: var(--translucent);
          border: 1px solid var(--border-hover);
          border-radius: var(--radius-full);
          font-size: 11px;
          font-weight: 600;
          color: var(--secondary);
          transition: all var(--transition-fast);
        }

        .ai-mode-indicator.active {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        .ai-mode-indicator :global(svg) {
          color: var(--secondary);
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--translucent); }
          50% { opacity: 0.9; box-shadow: 0 0 12px 2px var(--translucent); }
        }

        .command-center-dropdown {
          border-top: 1px solid var(--border);
          max-height: 420px;
          overflow-y: auto;
        }

        /* Quick Actions */
        .quick-actions {
          padding: 16px;
        }

        .quick-actions-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }

        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .quick-actions-grid.three-columns {
          grid-template-columns: repeat(3, 1fr);
        }

        /* URL Mode Styles */
        .youtube-icon {
          color: var(--error);
        }

        .globe-icon {
          color: var(--accent);
        }

        .command-center-input.url-mode {
          color: var(--accent);
        }

        .url-type-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: var(--radius-full);
          font-size: 11px;
          font-weight: 600;
          transition: all var(--transition-fast);
        }

        .url-type-indicator.youtube {
          background: var(--error-bg);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .url-type-indicator.article {
          background: var(--translucent);
          border: 1px solid var(--accent);
          color: var(--accent);
        }

        .url-submit-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: var(--accent);
          border: none;
          border-radius: var(--radius-md);
          color: var(--base-text);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .url-submit-btn:hover {
          background: var(--base-hover);
          transform: scale(1.02);
        }

        /* URL Input Feedback */
        .url-input-feedback {
          padding: 16px;
        }

        .url-feedback-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--primary-text);
          margin-bottom: 12px;
        }

        .url-feedback-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .url-feedback-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: var(--radius-md);
          font-size: 13px;
        }

        .url-feedback-hint.error {
          background: var(--error-bg);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .url-feedback-hint.success {
          background: var(--success-bg);
          border: 1px solid var(--success);
          color: var(--success);
        }

        .url-feedback-hint.success.youtube {
          background: var(--error-bg);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .url-feedback-hint.success.youtube :global(svg) {
          color: var(--error);
        }

        .url-feedback-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }

        .url-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .url-action-btn.secondary {
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          color: var(--secondary);
        }

        .url-action-btn.secondary:hover {
          background: var(--bg-hover);
          color: var(--primary-text);
        }

        .url-action-btn.primary {
          background: var(--accent);
          border: none;
          color: var(--base-text);
        }

        .url-action-btn.primary:hover:not(:disabled) {
          background: var(--base-hover);
          transform: translateY(-1px);
        }

        .url-action-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quick-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          color: var(--primary-text);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .quick-action-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        .quick-action-btn span {
          font-size: 13px;
          font-weight: 500;
        }

        .ai-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding: 12px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(14, 165, 233, 0.1));
          border-radius: var(--radius-md);
          font-size: 13px;
          color: var(--secondary-text);
        }

        .ai-hint :global(svg) {
          color: var(--accent);
        }

        /* No Results */
        .no-results {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          text-align: center;
          color: var(--secondary-text);
        }

        .no-results-icon {
          color: var(--tertiary);
          margin-bottom: 12px;
        }

        .no-results p {
          font-size: 15px;
          font-weight: 500;
          color: var(--primary-text);
          margin-bottom: 4px;
        }

        .no-results span {
          font-size: 13px;
        }

        /* Drop Overlay */
        .drop-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(14, 165, 233, 0.08));
          backdrop-filter: blur(2px);
          border: 2px dashed var(--brand-accent);
          border-radius: var(--radius-xl);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          animation: drop-pulse 1.5s ease-in-out infinite;
        }

        @keyframes drop-pulse {
          0%, 100% {
            border-color: var(--brand-accent);
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(14, 165, 233, 0.08));
          }
          50% {
            border-color: var(--accent);
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(14, 165, 233, 0.12));
          }
        }

        .drop-overlay-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--brand-accent);
          padding: 24px;
        }

        .drop-overlay-content :global(svg) {
          filter: drop-shadow(0 2px 8px rgba(16, 185, 129, 0.3));
        }

        .drop-overlay-content p {
          font-size: 18px;
          font-weight: 600;
          color: var(--primary-text);
        }

        .drop-overlay-content span {
          font-size: 13px;
          color: var(--secondary-text);
        }
      `}</style>
        </DropZone>
    );
}

export default CommandCenter;
