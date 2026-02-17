
import { useState, useCallback, useEffect, useMemo, useTransition } from 'react';
import { generateId } from '@/lib/utils';

export type InteractionType = 'note' | 'annotation' | 'chat';

export interface Interaction {
  id: string;
  resource_id: string;
  type: InteractionType;
  content: string;
  position_data?: string | null;
  metadata?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ParsedInteraction extends Omit<Interaction, 'position_data' | 'metadata'> {
  position_data?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

interface UseInteractionsResult {
  interactions: ParsedInteraction[];
  notes: ParsedInteraction[];
  annotations: ParsedInteraction[];
  chatMessages: ParsedInteraction[];
  isLoading: boolean;
  error: string | null;
  addInteraction: (
    type: InteractionType,
    content: string,
    positionData?: Record<string, any>,
    metadata?: Record<string, any>
  ) => Promise<ParsedInteraction | null>;
  updateInteraction: (
    id: string,
    content: string,
    positionData?: Record<string, any>,
    metadata?: Record<string, any>
  ) => Promise<boolean>;
  deleteInteraction: (id: string) => Promise<boolean>;
  clearChat: () => Promise<void>;
  refetch: () => Promise<void>;
}

function parseInteraction(interaction: Interaction): ParsedInteraction {
  return {
    ...interaction,
    position_data: interaction.position_data
      ? typeof interaction.position_data === 'string'
        ? JSON.parse(interaction.position_data)
        : interaction.position_data
      : null,
    metadata: interaction.metadata
      ? typeof interaction.metadata === 'string'
        ? JSON.parse(interaction.metadata)
        : interaction.metadata
      : null,
  };
}

export function useInteractions(resourceId: string): UseInteractionsResult {
  const [interactions, setInteractions] = useState<ParsedInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchInteractions = useCallback(async () => {
    if (!resourceId || typeof window === 'undefined' || !window.electron) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await window.electron.db.interactions.getByResource(resourceId);

      if (result.success && result.data) {
        const parsed = result.data.map(parseInteraction);
        // Sort by created_at descending (newest first)
        parsed.sort((a, b) => b.created_at - a.created_at);
        startTransition(() => setInteractions(parsed));
      } else {
        setError(result.error || 'Failed to fetch interactions');
      }
    } catch (err) {
      console.error('Error fetching interactions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);

  // Setup event listeners for real-time sync
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;

    // Listener: Interacción creada
    const unsubscribeCreate = window.electron.on('interaction:created',
      (interaction: Interaction) => {
        // Solo agregar si pertenece a este recurso
        if (interaction.resource_id === resourceId) {
          setInteractions(prev => {
            // Evitar duplicados
            if (prev.some(i => i.id === interaction.id)) return prev;
            // Agregar al inicio (más reciente primero)
            const parsed = parseInteraction(interaction);
            return [parsed, ...prev];
          });
        }
      }
    );

    // Listener: Interacción actualizada
    const unsubscribeUpdate = window.electron.on('interaction:updated',
      ({ id, updates }: { id: string, updates: Partial<Interaction> }) => {
        setInteractions(prev =>
          prev.map(i => {
            if (i.id === id) {
              return {
                ...i,
                ...updates,
                position_data: updates.position_data
                  ? (typeof updates.position_data === 'string'
                      ? JSON.parse(updates.position_data)
                      : updates.position_data)
                  : i.position_data,
                metadata: updates.metadata
                  ? (typeof updates.metadata === 'string'
                      ? JSON.parse(updates.metadata)
                      : updates.metadata)
                  : i.metadata,
                updated_at: Date.now()
              };
            }
            return i;
          })
        );
      }
    );

    // Listener: Interacción eliminada
    const unsubscribeDelete = window.electron.on('interaction:deleted',
      ({ id }: { id: string }) => {
        setInteractions(prev => prev.filter(i => i.id !== id));
      }
    );

    // Cleanup todas las suscripciones al desmontar
    return () => {
      unsubscribeCreate();
      unsubscribeUpdate();
      unsubscribeDelete();
    };
  }, [resourceId]); // Depende de resourceId para filtrar correctamente

  const addInteraction = useCallback(
    async (
      type: InteractionType,
      content: string,
      positionData?: Record<string, any>,
      metadata?: Record<string, any>
    ): Promise<ParsedInteraction | null> => {
      if (!resourceId || typeof window === 'undefined' || !window.electron) {
        return null;
      }

      try {
        const now = Date.now();
        const interaction = {
          id: generateId(),
          resource_id: resourceId,
          type,
          content,
          position_data: positionData || null,
          metadata: metadata || null,
          created_at: now,
          updated_at: now,
        };

        const result = await window.electron.db.interactions.create(interaction);

        if (result.success && result.data) {
          // NO actualizar estado aquí - el listener se encargará
          const parsed = parseInteraction(result.data);
          return parsed;
        }

        return null;
      } catch (err) {
        console.error('Error adding interaction:', err);
        return null;
      }
    },
    [resourceId]
  );

  const updateInteraction = useCallback(
    async (
      id: string,
      content: string,
      positionData?: Record<string, any>,
      metadata?: Record<string, any>
    ): Promise<boolean> => {
      if (typeof window === 'undefined' || !window.electron) {
        return false;
      }

      try {
        const now = Date.now();
        const update = {
          id,
          content,
          position_data: positionData || null,
          metadata: metadata || null,
          updated_at: now,
        };

        const result = await window.electron.db.interactions.update(update);

        if (result.success) {
          // NO actualizar estado aquí - el listener se encargará
          return true;
        }

        return false;
      } catch (err) {
        console.error('Error updating interaction:', err);
        return false;
      }
    },
    []
  );

  const deleteInteraction = useCallback(async (id: string): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.electron) {
      return false;
    }

    try {
      const result = await window.electron.db.interactions.delete(id);

      if (result.success) {
        // NO actualizar estado aquí - el listener se encargará
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error deleting interaction:', err);
      return false;
    }
  }, []);

  const clearChat = useCallback(async (): Promise<void> => {
    if (!resourceId || typeof window === 'undefined' || !window.electron) return;
    const chatOnly = interactions.filter((i) => i.type === 'chat');
    for (const msg of chatOnly) {
      await window.electron.db.interactions.delete(msg.id);
    }
  }, [resourceId, interactions]);

  // Filter by type (memoized to avoid new array references on every render)
  const notes = useMemo(
    () => interactions.filter((i) => i.type === 'note'),
    [interactions]
  );
  const annotations = useMemo(
    () => interactions.filter((i) => i.type === 'annotation'),
    [interactions]
  );
  const chatMessages = useMemo(
    () => interactions.filter((i) => i.type === 'chat'),
    [interactions]
  );

  return {
    interactions,
    notes,
    annotations,
    chatMessages,
    isLoading,
    error,
    addInteraction,
    updateInteraction,
    deleteInteraction,
    clearChat,
    refetch: fetchInteractions,
  };
}
