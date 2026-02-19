
import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';

export type ResourceType = 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder' | 'notebook' | 'excel';

export interface Resource {
    id: string;
    project_id: string;
    type: ResourceType;
    title: string;
    content?: string;
    file_path?: string;
    // Internal file storage
    internal_path?: string;
    file_mime_type?: string;
    file_size?: number;
    file_hash?: string;
    thumbnail_data?: string;
    original_filename?: string;
    // Folder containment
    folder_id?: string | null;
    preview_image?: string;
    metadata?: Record<string, any>;
    created_at: number;
    updated_at: number;
}

export interface ResourceFilter {
    types?: ResourceType[];
    projectId?: string;
    folderId?: string | null; // null = root level, undefined = all, string = specific folder
    sortBy?: 'created_at' | 'updated_at' | 'title';
    sortOrder?: 'asc' | 'desc';
}

export interface ImportProgress {
    current: number;
    total: number;
    currentFile: string;
    status: 'idle' | 'importing' | 'complete' | 'error';
    error?: string;
}

/**
 * Determine resource type from file extension
 */
function getResourceTypeFromPath(filePath: string): ResourceType {
    const ext = filePath.toLowerCase().split('.').pop() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        return 'image';
    }
    if (ext === 'pdf') {
        return 'pdf';
    }
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
        return 'video';
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
        return 'audio';
    }
    return 'document';
}

/** Parse metadata from DB (often stored as JSON string) */
function parseResourceMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (metadata == null) return undefined;
    if (typeof metadata === 'object') return metadata as Record<string, unknown>;
    try {
        return typeof metadata === 'string' ? JSON.parse(metadata || '{}') : undefined;
    } catch {
        return undefined;
    }
}

/** Normalize resource from DB: parse metadata so folder colors etc. work */
function normalizeResource(r: Resource): Resource {
    return {
        ...r,
        metadata: r.metadata != null ? parseResourceMetadata(r.metadata) : undefined,
    };
}

export function useResources(filter?: ResourceFilter) {
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState<ImportProgress>({
        current: 0,
        total: 0,
        currentFile: '',
        status: 'idle',
    });

    // Fetch resources from database
    const fetchResources = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (typeof window !== 'undefined' && window.electron?.db) {
                const result = await window.electron.db.resources.getAll(100);
                if (result.success && result.data) {
                    startTransition(() => setResources((result.data as Resource[]).map(normalizeResource)));
                } else if (result.error) {
                    setError(result.error);
                }
            }
        } catch (err) {
            console.error('Error fetching resources:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchResources();
    }, [fetchResources]);

    // Refetch when AI tools modify resources (defensive fallback if broadcast missed)
    useEffect(() => {
        const handler = () => fetchResources();
        window.addEventListener('dome:resources-changed', handler);
        return () => window.removeEventListener('dome:resources-changed', handler);
    }, [fetchResources]);

    // Setup event listeners for real-time sync
    useEffect(() => {
        if (typeof window === 'undefined' || !window.electron) return;

        // Listener: Recurso creado
        const unsubscribeCreate = window.electron.on('resource:created', (resource: Resource) => {
            setResources(prev => {
                if (prev.some(r => r.id === resource.id)) return prev;
                return [normalizeResource(resource), ...prev];
            });
        });

        // Listener: Recurso actualizado
        const unsubscribeUpdate = window.electron.on('resource:updated',
            ({ id, updates }: { id: string, updates: Partial<Resource> }) => {
                // When thumbnail is ready (e.g. URL screenshot), broadcast omits thumbnail_data
                // to avoid OOM. Re-fetch the resource to get thumbnail_data for preview.
                // NOTE: Partial<Resource> may not have thumbnail_ready property - check using 'in' operator.
                if ('thumbnail_ready' in updates && updates.thumbnail_ready && window.electron?.db?.resources?.getById) {
                    window.electron.db.resources.getById(id).then((result) => {
                        if (result?.success && result.data) {
                            const full = normalizeResource(result.data as Resource);
                            setResources(prev =>
                                prev.map(r => (r.id !== id ? r : full))
                            );
                        }
                    }).catch(() => {
                        // Fallback to merge if re-fetch fails
                        setResources(prev =>
                            prev.map(r => {
                                if (r.id !== id) return r;
                                const merged = { ...r, ...updates, updated_at: Date.now() };
                                if (updates?.metadata != null) {
                                    const existingMeta = parseResourceMetadata(r.metadata) || {};
                                    const incomingMeta = parseResourceMetadata(updates.metadata) || {};
                                    merged.metadata = { ...existingMeta, ...incomingMeta };
                                }
                                return merged;
                            })
                        );
                    });
                    return;
                }
                setResources(prev =>
                    prev.map(r => {
                        if (r.id !== id) return r;
                        const merged = { ...r, ...updates, updated_at: Date.now() };
                        // Deep-merge metadata so partial updates (e.g. folder color) preserve other fields
                        if (updates?.metadata != null) {
                            const existingMeta = parseResourceMetadata(r.metadata) || {};
                            const incomingMeta = parseResourceMetadata(updates.metadata) || {};
                            merged.metadata = { ...existingMeta, ...incomingMeta };
                        }
                        return merged;
                    })
                );
            }
        );

        // Listener: Recurso eliminado
        const unsubscribeDelete = window.electron.on('resource:deleted',
            ({ id }: { id: string }) => {
                setResources(prev => prev.filter(r => r.id !== id));
            }
        );

        // Cleanup todas las suscripciones al desmontar
        return () => {
            unsubscribeCreate();
            unsubscribeUpdate();
            unsubscribeDelete();
        };
    }, []); // Sin dependencias - configurar listeners solo una vez

    // Apply filters and sorting
    const filteredResources = useMemo(() => {
        let result = [...resources];

        // Filter by types
        if (filter?.types && filter.types.length > 0) {
            result = result.filter((r) => filter.types!.includes(r.type));
        }

        // Filter by project
        if (filter?.projectId) {
            result = result.filter((r) => r.project_id === filter.projectId);
        }

        // Filter by folder (null = root level, undefined = all, string = specific folder)
        if (filter?.folderId !== undefined) {
            if (filter.folderId === null) {
                // Root level: resources without folder_id
                result = result.filter((r) => !r.folder_id);
            } else {
                // Inside a specific folder
                result = result.filter((r) => r.folder_id === filter.folderId);
            }
        }

        // Sort
        const sortBy = filter?.sortBy || 'updated_at';
        const sortOrder = filter?.sortOrder || 'desc';

        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'title') {
                comparison = a.title.localeCompare(b.title);
            } else {
                comparison = (a[sortBy] || 0) - (b[sortBy] || 0);
            }
            return sortOrder === 'desc' ? -comparison : comparison;
        });

        return result;
    }, [resources, filter]);

    // Create a new resource
    const createResource = useCallback(async (resource: Omit<Resource, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            if (typeof window !== 'undefined' && window.electron?.db) {
                const now = Date.now();
                const newResource: Resource = {
                    ...resource,
                    id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    created_at: now,
                    updated_at: now,
                };

                const result = await window.electron.db.resources.create(newResource);
                if (result.success) {
                    // El listener actualiza; fetchResources como respaldo
                    fetchResources();
                    return newResource;
                }
                throw new Error(result.error || 'Failed to create resource');
            }
        } catch (err) {
            console.error('Error creating resource:', err);
            throw err;
        }
    }, [fetchResources]);

    // Separate folders from other resources
    const { folders, nonFolderResources } = useMemo(() => {
        const folders = filteredResources.filter((r) => r.type === 'folder');
        const nonFolderResources = filteredResources.filter((r) => r.type !== 'folder');
        return { folders, nonFolderResources };
    }, [filteredResources]);

    // Import a single file using the new internal storage API
    const importFile = useCallback(async (
        filePath: string,
        projectId: string = 'default',
        title?: string
    ): Promise<{ success: boolean; resource?: Resource; error?: string }> => {
        try {
            if (typeof window === 'undefined' || !window.electron?.resource) {
                throw new Error('Resource API not available');
            }

            const type = getResourceTypeFromPath(filePath);
            const result = await window.electron.resource.import(filePath, projectId, type, title);

            if (result.success && result.data) {
                // El listener actualiza; fetchResources como respaldo
                fetchResources();
                const imported = result.data as Resource;
                return { success: true, resource: imported };
            }

            // Handle duplicate
            if (result.error === 'duplicate' && result.duplicate) {
                return {
                    success: false,
                    error: `File already exists as "${result.duplicate.title}"`,
                };
            }

            return { success: false, error: result.error || 'Import failed' };
        } catch (err) {
            console.error('Error importing file:', err);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }, [fetchResources]);

    // Import multiple files with progress tracking (async-parallel: batch with Promise.all)
    const BATCH_SIZE = 4;

    const importFiles = useCallback(async (
        filePaths: string[],
        projectId: string = 'default',
        folderId?: string | null
    ): Promise<{ success: boolean; imported: number; failed: number; errors: string[]; resourceIds: string[] }> => {
        if (filePaths.length === 0) {
            return { success: true, imported: 0, failed: 0, errors: [], resourceIds: [] };
        }

        setImportProgress({
            current: 0,
            total: filePaths.length,
            currentFile: '',
            status: 'importing',
        });

        let imported = 0;
        let failed = 0;
        const errors: string[] = [];
        const importedResources: Resource[] = [];
        const validPaths = filePaths.filter(Boolean);

        for (let i = 0; i < validPaths.length; i += BATCH_SIZE) {
            const batch = validPaths.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(async (filePath) => {
                    const fileName = filePath.split('/').pop() || filePath;
                    try {
                        const result = await importFile(filePath, projectId, undefined);
                        return { filePath, fileName, result };
                    } catch (err) {
                        return {
                            filePath,
                            fileName,
                            result: { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
                        };
                    }
                })
            );

            for (const { fileName, result } of batchResults) {
                setImportProgress((prev) => ({
                    ...prev,
                    current: Math.min(i + batchResults.length, validPaths.length),
                    currentFile: fileName,
                }));

                if (result.success && result.resource) {
                    imported++;
                    importedResources.push(result.resource);
                } else {
                    failed++;
                    errors.push(`${fileName}: ${result.error}`);
                }
            }
        }

        const resourceIds = importedResources.map((r) => r.id);

        // If folderId is specified, move all imported resources in parallel
        if (folderId && importedResources.length > 0 && typeof window !== 'undefined' && window.electron?.db) {
            await Promise.all(
                importedResources.map((resource) =>
                    window.electron.db.resources.moveToFolder(resource.id, folderId).catch((err) => {
                        console.error(`Failed to move ${resource.title} to folder:`, err);
                    })
                )
            );
        }

        setImportProgress({
            current: filePaths.length,
            total: filePaths.length,
            currentFile: '',
            status: failed === 0 ? 'complete' : 'error',
            error: errors.length > 0 ? errors.join('; ') : undefined,
        });

        // Los listeners actualizan; fetchResources como respaldo (tras progress para evitar flicker)
        fetchResources();

        // Reset progress after a delay
        setTimeout(() => {
            setImportProgress({
                current: 0,
                total: 0,
                currentFile: '',
                status: 'idle',
            });
        }, 3000);

        return { success: failed === 0, imported, failed, errors, resourceIds };
    }, [importFile, fetchResources]);

    // Update a resource
    const updateResource = useCallback(async (
        resourceId: string,
        updates: Partial<Pick<Resource, 'title' | 'content' | 'metadata'>>
    ): Promise<boolean> => {
        try {
            if (typeof window === 'undefined' || !window.electron?.db) {
                throw new Error('Database API not available');
            }

            const result = await window.electron.db.resources.update({
                id: resourceId,
                ...updates,
                updated_at: Date.now(),
            });

            if (result.success) {
                fetchResources();
                return true;
            }

            return false;
        } catch (err) {
            console.error('Error updating resource:', err);
            return false;
        }
    }, [fetchResources]);

    // Delete a resource
    const deleteResource = useCallback(async (resourceId: string): Promise<boolean> => {
        try {
            if (typeof window === 'undefined' || !window.electron?.resource) {
                throw new Error('Resource API not available');
            }

            const result = await window.electron.resource.delete(resourceId);

            if (result.success) {
                // El listener actualiza; fetchResources como respaldo
                fetchResources();
                return true;
            }

            return false;
        } catch (err) {
            console.error('Error deleting resource:', err);
            return false;
        }
    }, [fetchResources]);

    // Move a resource to a folder
    const moveToFolder = useCallback(async (resourceId: string, folderId: string | null): Promise<boolean> => {
        try {
            if (typeof window === 'undefined' || !window.electron?.db) {
                throw new Error('Database API not available');
            }

            const result = await window.electron.db.resources.moveToFolder(resourceId, folderId);

            if (result.success) {
                // El listener actualiza; fetchResources como respaldo
                fetchResources();
                return true;
            }

            return false;
        } catch (err) {
            console.error('Error moving resource to folder:', err);
            return false;
        }
    }, [fetchResources]);

    // Get a folder by ID (useful for breadcrumbs)
    const getFolderById = useCallback((folderId: string): Resource | undefined => {
        return resources.find((r) => r.id === folderId && r.type === 'folder');
    }, [resources]);

    // Get breadcrumb path from root to folder (for folder navigation UI)
    const getBreadcrumbPath = useCallback((folderId: string): Resource[] => {
        const path: Resource[] = [];
        const foldersMap = new Map<string, Resource>(
            resources.filter((r) => r.type === 'folder').map((r) => [r.id, r])
        );
        let currentId: string | null = folderId;
        const visited = new Set<string>();
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = foldersMap.get(currentId);
            if (!folder) break;
            path.unshift(folder);
            currentId = folder.folder_id ?? null;
        }
        return path;
    }, [resources]);

    // Get all folders (for move dialog)
    const allFolders = useMemo(() => {
        return resources.filter((r) => r.type === 'folder');
    }, [resources]);

    return {
        resources: filteredResources,
        folders,
        nonFolderResources,
        allFolders,
        isLoading,
        error,
        importProgress,
        refetch: fetchResources,
        createResource,
        updateResource,
        importFile,
        importFiles,
        deleteResource,
        moveToFolder,
        getFolderById,
        getBreadcrumbPath,
    };
}

export default useResources;
