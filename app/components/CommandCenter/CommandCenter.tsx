
import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import {
    Search,
    Sparkles,
    Upload,
    FileText,
    Link2,
    Notebook,
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
    onCreateNotebook?: () => void;
    onUpload?: (files: File[]) => void;
    onImportFiles?: (filePaths: string[]) => void;
    onAddUrl?: (url: string, type: 'youtube' | 'article') => void;
    onStudioOutputSelect?: (output: any) => void;
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
    onCreateNotebook,
    onUpload,
    onImportFiles,
    onAddUrl,
    onStudioOutputSelect,
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
    const [, startTransition] = useTransition();
    const {
        setSearchQuery,
        searchResults,
        setSearchResults,
        commandCenterOpen,
        setCommandCenterOpen,
        commandCenterUrlModeRequest,
        setCommandCenterUrlModeRequest,
        setHomeSidebarSection,
        setActiveStudioOutput,
        addStudioOutput,
    } = useAppStore();

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

    // Open from header/store
    useEffect(() => {
        if (commandCenterOpen) {
            setIsExpanded(true);
            if (commandCenterUrlModeRequest) {
                setUrlMode(true);
                setUrlInput('https://');
                setCommandCenterUrlModeRequest(false);
            }
            inputRef.current?.focus();
            setCommandCenterOpen(false);
        }
    }, [commandCenterOpen, commandCenterUrlModeRequest, setCommandCenterOpen, setCommandCenterUrlModeRequest]);

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
                setCommandCenterOpen(false);
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
    }, [isFocused, urlMode, isUrlValid, urlInput, setCommandCenterOpen]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
                setCommandCenterOpen(false);
                setUrlMode(false);
                setUrlInput('https://');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setCommandCenterOpen]);

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

                    // Use hybrid for ranking; enrich with full resource data for display (updated_at, folder_id)
                    let resources: any[];
                    if (hybridResults.length > 0) {
                        const ids = hybridResults.map((r) => r.id);
                        const fullResources = await Promise.all(
                            ids.map((id) => window.electron.db.resources.getById(id))
                        );
                        resources = fullResources
                            .filter((r: any) => r?.success && r?.data)
                            .map((r: any) => r.data)
                            .sort((a: any, b: any) => {
                                const idxA = ids.indexOf(a.id);
                                const idxB = ids.indexOf(b.id);
                                return idxA - idxB;
                            });
                    } else {
                        resources =
                            (ftsResult as any).success && (ftsResult as any).data
                                ? (ftsResult as any).data.resources
                                : [];
                    }

                    const interactions =
                        (ftsResult as any).success && (ftsResult as any).data
                            ? (ftsResult as any).data.interactions
                            : [];

                    const studioOutputs =
                        (ftsResult as any).success && (ftsResult as any).data?.studioOutputs
                            ? (ftsResult as any).data.studioOutputs
                            : [];

                    startTransition(() => setSearchResults({ resources, interactions, studioOutputs }));
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

    const handleStudioOutputClick = useCallback((output: any) => {
        if (onStudioOutputSelect) {
            onStudioOutputSelect(output);
        } else {
            setHomeSidebarSection('studio');
            addStudioOutput(output);
            setActiveStudioOutput(output);
        }
        setIsExpanded(false);
        setQuery('');
        setSearchResults(null);
    }, [onStudioOutputSelect, setHomeSidebarSection, addStudioOutput, setActiveStudioOutput, setSearchResults]);

    const handleQuickAction = useCallback((action: string) => {
        switch (action) {
            case 'note':
                if (onCreateNote) onCreateNote();
                setIsExpanded(false);
                break;
            case 'notebook':
                if (onCreateNotebook) onCreateNotebook();
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

    const hasResults = Boolean(searchResults && (
        (searchResults.resources?.length ?? 0) > 0 ||
        (searchResults.interactions?.length ?? 0) > 0 ||
        (searchResults.studioOutputs?.length ?? 0) > 0
    ));

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

                        <label htmlFor="command-center-search" className="sr-only">Search or add URL</label>
                        <input
                            id="command-center-search"
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
                            aria-label={urlMode ? 'URL or YouTube link' : 'Search resources'}
                        />

                        <div className="command-center-actions">
                            {/* URL Type Indicator */}
                            {urlMode && detectedUrlType ? (
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
                            ) : null}

                            {/* Submit URL button */}
                            {urlMode && isUrlValid ? (
                                <button
                                    className="url-submit-btn"
                                    onClick={handleSubmitUrl}
                                    aria-label="Add URL"
                                >
                                    <Check size={16} />
                                    <span>Add</span>
                                </button>
                            ) : null}

                            {/* AI Mode Indicator - only when not in URL mode */}
                            {!urlMode && query.length > 0 ? (
                                <div className={`ai-mode-indicator ${isSearching ? 'active' : ''}`}>
                                    <Sparkles size={14} />
                                    <span>AI</span>
                                </div>
                            ) : null}

                            {/* Clear/Cancel button */}
                            {(query || urlMode) ? (
                                <button
                                    className="command-center-clear focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
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
                            ) : null}
                            <div className="command-center-shortcut">
                                <kbd>⌘</kbd>
                                <kbd>K</kbd>
                            </div>
                        </div>
                    </div>

                    {/* Expandable content */}
                    {isExpanded ? (
                        <div className="command-center-dropdown">
                            {/* URL Mode - Show URL input feedback */}
                            {urlMode && (
                                <div className="url-input-feedback">
                                    <div className="url-feedback-header">
                                        <Link2 size={16} />
                                        <span>Add Web Resource</span>
                                    </div>
                                    <div className="url-feedback-content">
                                        {!isUrlValid && urlInput.length > 8 ? (
                                            <div className="url-feedback-hint error">
                                                Please enter a valid URL starting with http:// or https://
                                            </div>
                                        ) : null}
                                        {isUrlValid ? (
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
                                        ) : null}
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
                            {!query && !urlMode ? (
                                <div className="quick-actions">
                                    <div className="quick-actions-label">Quick Actions</div>
                                    <div className="quick-actions-grid">
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('note')}
                                            title="Nueva nota"
                                            aria-label="Crear nueva nota"
                                        >
                                            <FileText size={24} strokeWidth={2} />
                                            <span className="quick-action-label">Nota</span>
                                        </button>
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('notebook')}
                                            title="Nuevo cuaderno"
                                            aria-label="Crear nuevo cuaderno"
                                        >
                                            <Notebook size={24} strokeWidth={2} />
                                            <span className="quick-action-label">Cuaderno</span>
                                        </button>
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('upload')}
                                            title="Subir archivos"
                                            aria-label="Subir archivos"
                                        >
                                            <Upload size={24} strokeWidth={2} />
                                            <span className="quick-action-label">Archivos</span>
                                        </button>
                                        <button
                                            className="quick-action-btn"
                                            onClick={() => handleQuickAction('url')}
                                            title="Añadir URL"
                                            aria-label="Añadir URL o enlace"
                                        >
                                            <Link2 size={24} strokeWidth={2} />
                                            <span className="quick-action-label">URL</span>
                                        </button>
                                    </div>
                                    <div className="ai-hint">
                                        <Sparkles size={14} />
                                        <span>Type naturally to search with AI or use / for commands</span>
                                    </div>
                                </div>
                            ) : null}

                            {/* Filter chips + Search results - only when not in URL mode */}
                            {!urlMode && query && hasResults && searchResults ? (
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
                                        results={filteredResults || searchResults || { resources: [], interactions: [] }}
                                        query={query}
                                        isLoading={isSearching}
                                        onSelect={handleResourceClick}
                                        onStudioOutputSelect={handleStudioOutputClick}
                                    />
                                </>
                            ) : null}

                            {/* No results - only when not in URL mode */}
                            {!urlMode && query && !isSearching && !hasResults ? (
                                <div className="no-results">
                                    <Search size={32} className="no-results-icon" />
                                    <p>No results found for "{query}"</p>
                                    <span>Try a different search term or ask AI</span>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {/* Drop overlay */}
                {showDropzone ? (
                    <div className="drop-overlay">
                        <div className="drop-overlay-content">
                            <Upload size={48} />
                            <p>Drop files or URLs here</p>
                            <span>Images, PDFs, Audio, Documents</span>
                        </div>
                    </div>
                ) : null}
            </div>
        </DropZone>
    );
}

export default CommandCenter;
